from __future__ import annotations

import asyncio
import contextlib
import os
import shutil
import tempfile
import urllib.parse
import uuid
from typing import Dict, List, Optional, Set, Tuple

from fastapi import HTTPException, UploadFile

from ..pptx_font_utils_support.font_matching import _font_style_variant, get_index_of_matching_font_detail_or_none, normalize_font_family_name
from ..pptx_font_utils_support.font_metadata import FontDetail, convert_eot_to_ttf, extract_font_name_from_file, get_font_details
from ..pptx_font_utils_support.google_fonts import build_google_fonts_stylesheet_url, check_google_font_availability
from ..pptx_font_utils_support.pptx_font_replace import replace_fonts_in_pptx
from ..pptx_font_utils_support.pptx_font_scan import extract_raw_fonts_and_embedded_details, extract_used_font_variants_from_pptx, get_available_and_unavailable_fonts_for_pptx

from .font_mapping import (
    actual_uploaded_font_name,
    build_modified_pptx_filename,
    direct_upload_replacement_font_name,
    font_detail_variant,
    font_info_entries,
    font_name_has_explicit_variant,
    font_variants_by_normalized_name,
    original_names_by_normalized_variant,
    variants_for_font_name,
)
from .models import FontCheckResponse, FontsUploadAndSlidesPreviewResponse, _PreviewLogger
from .rendering import render_pptx_slides_to_images
from .session_store import get_fonts_directory, get_template_preview_session_dir, persist_files_to_session, public_urls_for_local_paths, write_bytes_to_path


async def check_fonts_in_pptx_handler(pptx_file: UploadFile) -> FontCheckResponse:
    filename = getattr(pptx_file, "filename", "") or ""
    if not filename.lower().endswith(".pptx"):
        raise HTTPException(status_code=400, detail="Invalid file type. Expected PPTX file")
    with tempfile.TemporaryDirectory() as temp_dir:
        pptx_path = os.path.join(temp_dir, "presentation.pptx")
        await asyncio.to_thread(write_bytes_to_path, pptx_path, await pptx_file.read())
        font_variants_by_name = await asyncio.to_thread(extract_used_font_variants_from_pptx, pptx_path)
        variants_by_name = font_variants_by_normalized_name(font_variants_by_name)
        originals = original_names_by_normalized_variant(font_variants_by_name)
        available, unavailable = await get_available_and_unavailable_fonts_for_pptx(pptx_path, temp_dir)
        return FontCheckResponse(
            available_fonts=font_info_entries(available, variants_by_name, originals),
            unavailable_fonts=font_info_entries(unavailable, variants_by_name, originals),
        )


async def upload_fonts_and_preview_handler(
    pptx_file: UploadFile,
    font_files: Optional[List[UploadFile]] = None,
    original_font_names: Optional[List[str]] = None,
    max_slides: Optional[int] = None,
    upload_fonts: bool = True,
    get_slide_images: bool = True,
    upload_presentation: bool = True,
    temp_dir: Optional[str] = None,
) -> FontsUploadAndSlidesPreviewResponse:
    num_font_files = len(font_files or [])
    num_original_names = len(original_font_names or [])
    if (num_font_files and not num_original_names) or (num_original_names and not num_font_files):
        raise HTTPException(status_code=400, detail="Both font_files and original_font_names must be provided together")
    if num_font_files != num_original_names:
        raise HTTPException(status_code=400, detail="Number of font files must match number of original font names")
    filename = getattr(pptx_file, "filename", "") or ""
    if not filename.lower().endswith(".pptx"):
        raise HTTPException(status_code=400, detail="Invalid file type. Expected PPTX file")
    logger = _PreviewLogger()
    logger.info(f"Processing font upload and preview for {num_font_files} fonts")
    temp_dir_context = contextlib.nullcontext(temp_dir) if temp_dir else tempfile.TemporaryDirectory()
    with temp_dir_context as active_temp_dir:
        pptx_path = os.path.join(active_temp_dir, "presentation.pptx")
        await asyncio.to_thread(write_bytes_to_path, pptx_path, await pptx_file.read())
        variants_by_name = font_variants_by_normalized_name(await asyncio.to_thread(extract_used_font_variants_from_pptx, pptx_path))
        session_dir = get_template_preview_session_dir(uuid.uuid4())
        raw_fonts, embedded_urls, font_mapping, custom_font_files, modified_pptx_path, font_paths_for_install, font_upload_pairs, embedded_aliases, protected_embedded_names, font_variant_mapping = await upload_fonts_and_fix_fonts_in_pptx(
            pptx_path=pptx_path,
            temp_dir=active_temp_dir,
            original_filename=filename,
            font_files=font_files,
            original_font_names=original_font_names,
            logger=logger,
            session_dir=session_dir,
            upload_fonts=upload_fonts,
        )
        slide_image_paths = await create_slide_previews(modified_pptx_path, font_paths_for_install, max_slides, logger, session_dir) if get_slide_images else []
        modified_pptx_path_out = await upload_presentations(modified_pptx_path, logger, session_dir) if upload_presentation else ""
        fonts = await _collect_result_fonts(
            raw_fonts=raw_fonts,
            original_font_names=original_font_names,
            embedded_urls=embedded_urls,
            font_mapping=font_mapping,
            custom_font_files=custom_font_files,
            font_upload_pairs=font_upload_pairs,
            font_variant_mapping=font_variant_mapping,
            variants_by_name=variants_by_name,
            logger=logger,
        )
        slide_image_urls = public_urls_for_local_paths(slide_image_paths) if get_slide_images else []
        modified_pptx_url = public_urls_for_local_paths([modified_pptx_path_out])[0] if upload_presentation else modified_pptx_path
        logger.info(f"Upload and preview completed successfully with {len(fonts)} total fonts")
        return FontsUploadAndSlidesPreviewResponse(slide_image_urls=slide_image_urls, pptx_url=modified_pptx_url, modified_pptx_url=modified_pptx_url, fonts=fonts)


async def upload_fonts_and_fix_fonts_in_pptx(
    pptx_path: str,
    temp_dir: str,
    original_filename: str,
    font_files: Optional[List[UploadFile]],
    original_font_names: Optional[List[str]],
    logger,
    session_dir: str,
    upload_fonts: bool = True,
) -> Tuple[Set[str], Dict[str, str], Dict[str, str], List[Tuple[str, str]], str, List[str], List[Tuple[str, str]], Dict[str, str], List[str], Dict[str, Dict[str, str]]]:
    raw_fonts, embedded_details, embedded_paths = await asyncio.to_thread(extract_raw_fonts_and_embedded_details, pptx_path, temp_dir)
    found_embedded_urls, found_embedded_paths, _ = await _prepare_embedded_fonts(raw_fonts, embedded_details, embedded_paths, temp_dir, logger) if upload_fonts else ({}, {}, {})
    custom_font_files, font_mapping, font_variant_mapping = await _save_uploaded_fonts_to_temp(font_files, original_font_names, temp_dir, logger)
    font_paths_for_install = [font_path for font_path, _ in custom_font_files] + list(found_embedded_paths.values())
    modified_pptx_path = os.path.join(temp_dir, build_modified_pptx_filename(original_filename))
    if font_mapping:
        await asyncio.to_thread(replace_fonts_in_pptx, pptx_path, font_mapping, modified_pptx_path, font_variant_mapping)
    else:
        modified_pptx_path = pptx_path
    font_upload_pairs = [(os.path.join(session_dir, "fonts", os.path.basename(font_path)), font_path) for font_path, _ in custom_font_files] if upload_fonts else []
    if font_upload_pairs:
        await persist_files_to_session(font_upload_pairs)
    return raw_fonts, found_embedded_urls, font_mapping, custom_font_files, modified_pptx_path, font_paths_for_install, font_upload_pairs, {}, list(found_embedded_paths.keys()), font_variant_mapping


async def create_slide_previews(modified_pptx_path: str, font_paths_for_install: List[str], max_slides: Optional[int], logger, session_dir: str) -> List[str]:
    screenshot_paths = await render_pptx_slides_to_images(modified_pptx_path=modified_pptx_path, font_paths_for_install=font_paths_for_install, max_slides=max_slides, logger=logger)
    if not screenshot_paths:
        raise HTTPException(status_code=500, detail="Failed to generate slide images")
    return await persist_files_to_session([(os.path.join(session_dir, f"slide_{idx}.png"), path) for idx, path in enumerate(screenshot_paths, start=1)])


async def upload_presentations(modified_pptx_path: str, logger, session_dir: str) -> str:
    return (await persist_files_to_session([(os.path.join(session_dir, os.path.basename(modified_pptx_path)), modified_pptx_path)]))[0]


async def _save_uploaded_fonts_to_temp(
    font_files: Optional[List[UploadFile]],
    original_font_names: Optional[List[str]],
    temp_dir: str,
    logger,
) -> Tuple[List[Tuple[str, str]], Dict[str, str], Dict[str, Dict[str, str]]]:
    saved_fonts: List[Tuple[str, str]] = []
    font_mapping: Dict[str, str] = {}
    font_variant_mapping: Dict[str, Dict[str, str]] = {}
    if not font_files or not original_font_names:
        return saved_fonts, font_mapping, font_variant_mapping
    for index, (font_file, original_name) in enumerate(zip(font_files, original_font_names)):
        font_filename = getattr(font_file, "filename", f"font_{index}")
        font_path = os.path.join(temp_dir, font_filename)
        await asyncio.to_thread(write_bytes_to_path, font_path, await font_file.read())
        saved_fonts.append((font_path, original_name))
        detail = await asyncio.to_thread(get_font_details, font_path)
        uploaded_variant = font_detail_variant(detail, font_filename)
        requested_variant = _font_style_variant(original_name, None, []) if font_name_has_explicit_variant(original_name) else uploaded_variant
        original_family_name = normalize_font_family_name(original_name)
        actual_name = direct_upload_replacement_font_name(original_name, requested_variant, uploaded_variant, detail, font_filename)
        font_mapping[original_name] = actual_name
        font_variant_mapping.setdefault(original_name, {})[requested_variant] = actual_name
        if original_family_name:
            font_variant_mapping.setdefault(original_family_name, {})[requested_variant] = actual_name
        logger.info(f"Font mapping: {original_name} {requested_variant} -> {actual_name} ({font_filename})")
    return saved_fonts, font_mapping, font_variant_mapping


async def _prepare_embedded_fonts(
    raw_fonts: Set[str],
    embedded_details: List[FontDetail],
    embedded_paths: List[str],
    temp_dir: str,
    logger,
) -> Tuple[Dict[str, str], Dict[str, str], Dict[str, str]]:
    if not raw_fonts or not embedded_details:
        return {}, {}, {}
    random_id = str(uuid.uuid4())

    async def process_font(font_name: str, font_detail: FontDetail, font_path: str):
        converted_path = await asyncio.to_thread(convert_eot_to_ttf, font_path, temp_dir)
        extension = os.path.splitext(converted_path)[1] or ".ttf"
        safe_name = (font_detail.full_name or font_detail.family_name or font_name).replace("/", "_")
        embedded_dir = os.path.join(get_fonts_directory(), "embedded", random_id)
        await asyncio.to_thread(os.makedirs, embedded_dir, exist_ok=True)
        dest_path = os.path.join(embedded_dir, f"{safe_name}{extension}")
        await asyncio.to_thread(shutil.copy2, converted_path, dest_path)
        actual_name = font_detail.full_name or font_detail.family_name or await asyncio.to_thread(extract_font_name_from_file, converted_path)
        return font_name, public_urls_for_local_paths([dest_path])[0], converted_path, actual_name

    tasks = []
    for font_name in raw_fonts:
        match_index = get_index_of_matching_font_detail_or_none(font_name, embedded_details)
        if match_index is not None and match_index < len(embedded_paths):
            tasks.append(asyncio.create_task(process_font(font_name, embedded_details[match_index], embedded_paths[match_index])))
    if not tasks:
        return {}, {}, {}
    results = await asyncio.gather(*tasks)
    return (
        {font_name: url for font_name, url, _, _ in results},
        {font_name: converted_path for font_name, _, converted_path, _ in results},
        {font_name: actual_name for font_name, _, _, actual_name in results},
    )


async def _collect_result_fonts(
    *,
    raw_fonts: Set[str],
    original_font_names: Optional[List[str]],
    embedded_urls: Dict[str, str],
    font_mapping: Dict[str, str],
    custom_font_files: List[Tuple[str, str]],
    font_upload_pairs: List[Tuple[str, str]],
    font_variant_mapping: Dict[str, Dict[str, str]],
    variants_by_name: Dict[str, Set[str]],
    logger,
) -> Dict[str, str]:
    fonts: Dict[str, str] = {font_mapping.get(name, name): url for name, url in embedded_urls.items()}
    if font_upload_pairs:
        font_urls = public_urls_for_local_paths([dest for dest, _ in font_upload_pairs])
        for (font_path, original_name), font_url in zip(custom_font_files, font_urls):
            detail = await asyncio.to_thread(get_font_details, font_path)
            variant = font_detail_variant(detail, os.path.basename(font_path))
            actual_name = ((font_variant_mapping.get(original_name) or {}).get(variant) or font_mapping.get(original_name) or detail.full_name or detail.family_name or original_name)
            fonts[actual_name] = font_url
            logger.info(f"Added custom font: {actual_name} -> {font_url}")
    normalized_original_names = {normalize_font_family_name(name) for name in (original_font_names or [])}
    replaced_names = set(normalized_original_names).union(font_mapping.keys()).union(embedded_urls.keys())
    fonts_to_check = sorted({normalize_font_family_name(font) for font in raw_fonts if font not in replaced_names and normalize_font_family_name(font)})
    results = await asyncio.gather(*[check_google_font_availability(font, variants=variants_for_font_name(font, variants_by_name)) for font in fonts_to_check]) if fonts_to_check else []
    for font, is_available in zip(fonts_to_check, results):
        if is_available:
            fonts[font] = build_google_fonts_stylesheet_url(font, variants=variants_for_font_name(font, variants_by_name))
            logger.info(f"Added Google Font: {font} -> {fonts[font]}")
    return fonts
