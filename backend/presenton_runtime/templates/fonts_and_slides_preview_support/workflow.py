from __future__ import annotations

import asyncio
import contextlib
import json
import os
import re
import shutil
import tempfile
import urllib.parse
import uuid
from typing import Dict, List, Optional, Sequence, Set, Tuple

import aiohttp
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
    font_info_entry,
    font_info_entries,
    font_name_has_explicit_variant,
    font_variants_by_normalized_name,
    original_names_by_normalized_variant,
    variants_for_font_name,
)
from .models import (
    FontCheckResponse,
    FontInfo,
    FontReplacementSelection,
    FontsUploadAndSlidesPreviewResponse,
    _PreviewLogger,
)
from .rendering import render_pptx_slides_to_images
from .session_store import get_fonts_directory, get_template_preview_session_dir, persist_files_to_session, public_urls_for_local_paths, write_bytes_to_path

MISSING_FONTS_REQUIRED_CODE = "missing_font_files_required"
SLIDE_PREVIEW_GENERATION_FAILED_CODE = "slide_preview_generation_failed"


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
    font_replacements: Optional[str] = None,
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
        font_variants_by_name = await asyncio.to_thread(extract_used_font_variants_from_pptx, pptx_path)
        variants_by_name = font_variants_by_normalized_name(font_variants_by_name)
        originals = original_names_by_normalized_variant(font_variants_by_name)
        available_fonts_data, unavailable_fonts_data = await get_available_and_unavailable_fonts_for_pptx(
            pptx_path, active_temp_dir
        )
        available_font_entries = font_info_entries(
            available_fonts_data, variants_by_name, originals
        )
        unavailable_font_entries = font_info_entries(
            unavailable_fonts_data, variants_by_name, originals
        )
        parsed_font_replacements = _parse_font_replacements(font_replacements)
        validated_font_replacements = _validate_font_replacements(
            parsed_font_replacements,
            available_font_entries=available_font_entries,
            unavailable_font_entries=unavailable_font_entries,
        )
        session_dir = get_template_preview_session_dir(uuid.uuid4())
        raw_fonts, embedded_urls, font_mapping, custom_font_files, modified_pptx_path, font_paths_for_install, font_upload_pairs, embedded_aliases, protected_embedded_names, font_variant_mapping = await upload_fonts_and_fix_fonts_in_pptx(
            pptx_path=pptx_path,
            temp_dir=active_temp_dir,
            original_filename=filename,
            font_files=font_files,
            original_font_names=original_font_names,
            font_replacements=validated_font_replacements,
            logger=logger,
            session_dir=session_dir,
            upload_fonts=upload_fonts,
        )
        replacement_font_css, replacement_font_urls = await _prepare_replacement_font_assets(
            font_replacements=validated_font_replacements,
            available_font_entries=available_font_entries,
            embedded_urls=embedded_urls,
            session_dir=session_dir,
            logger=logger,
        )
        unresolved_fonts = await _find_unresolved_fonts(
            variants_by_name=variants_by_name,
            originals=originals,
            embedded_urls=embedded_urls,
            font_variant_mapping=font_variant_mapping,
        )
        if unresolved_fonts:
            missing_font_names = ", ".join(font.name for font in unresolved_fonts[:3])
            if len(unresolved_fonts) > 3:
                missing_font_names = f"{missing_font_names}, +{len(unresolved_fonts) - 3} more"
            message = (
                f"Still missing {len(unresolved_fonts)} resolved font entr"
                f"{'y' if len(unresolved_fonts) == 1 else 'ies'}: {missing_font_names}. "
                "Resolve each entry with either an uploaded font file, a matched font selection, "
                "or a PPTX with embedded fonts before generating previews."
            )
            logger.warning(message)
            raise HTTPException(
                status_code=409,
                detail={
                    "code": MISSING_FONTS_REQUIRED_CODE,
                    "message": message,
                    "missing_count": len(unresolved_fonts),
                    "missing_fonts": [font.model_dump() for font in unresolved_fonts],
                },
            )
        slide_image_paths = await create_slide_previews(
            modified_pptx_path,
            font_paths_for_install,
            max_slides,
            logger,
            session_dir,
            replacement_font_css,
        ) if get_slide_images else []
        modified_pptx_path_out = await upload_presentations(modified_pptx_path, logger, session_dir) if upload_presentation else ""
        fonts = await _collect_result_fonts(
            raw_fonts=raw_fonts,
            original_font_names=original_font_names,
            embedded_urls=embedded_urls,
            font_mapping=font_mapping,
            custom_font_files=custom_font_files,
            font_upload_pairs=font_upload_pairs,
            font_variant_mapping=font_variant_mapping,
            font_replacements=validated_font_replacements,
            replacement_font_urls=replacement_font_urls,
            available_font_entries=available_font_entries,
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
    font_replacements: Sequence[FontReplacementSelection],
    logger,
    session_dir: str,
    upload_fonts: bool = True,
) -> Tuple[Set[str], Dict[str, str], Dict[str, str], List[Tuple[str, str]], str, List[str], List[Tuple[str, str]], Dict[str, str], List[str], Dict[str, Dict[str, str]]]:
    raw_fonts, embedded_details, embedded_paths = await asyncio.to_thread(extract_raw_fonts_and_embedded_details, pptx_path, temp_dir)
    found_embedded_urls, found_embedded_paths, _ = await _prepare_embedded_fonts(raw_fonts, embedded_details, embedded_paths, temp_dir, logger) if upload_fonts else ({}, {}, {})
    custom_font_files, uploaded_font_mapping, uploaded_font_variant_mapping = await _save_uploaded_fonts_to_temp(font_files, original_font_names, temp_dir, logger)
    _replacement_font_mapping, replacement_font_variant_mapping = _build_replacement_mappings(
        font_replacements, logger
    )
    font_mapping = uploaded_font_mapping
    font_variant_mapping = _merge_font_variant_mappings(
        replacement_font_variant_mapping,
        uploaded_font_variant_mapping,
    )
    font_paths_for_install = [font_path for font_path, _ in custom_font_files] + list(found_embedded_paths.values())
    modified_pptx_path = os.path.join(temp_dir, build_modified_pptx_filename(original_filename))
    if uploaded_font_mapping:
        await asyncio.to_thread(replace_fonts_in_pptx, pptx_path, font_mapping, modified_pptx_path, font_variant_mapping)
    else:
        modified_pptx_path = pptx_path
    font_upload_pairs = [(os.path.join(session_dir, "fonts", os.path.basename(font_path)), font_path) for font_path, _ in custom_font_files] if upload_fonts else []
    if font_upload_pairs:
        await persist_files_to_session(font_upload_pairs)
    return raw_fonts, found_embedded_urls, font_mapping, custom_font_files, modified_pptx_path, font_paths_for_install, font_upload_pairs, {}, list(found_embedded_paths.keys()), font_variant_mapping


async def create_slide_previews(
    modified_pptx_path: str,
    font_paths_for_install: List[str],
    max_slides: Optional[int],
    logger,
    session_dir: str,
    replacement_font_css: str = "",
) -> List[str]:
    try:
        screenshot_paths = await render_pptx_slides_to_images(
            modified_pptx_path=modified_pptx_path,
            font_paths_for_install=font_paths_for_install,
            max_slides=max_slides,
            logger=logger,
            extra_font_css=replacement_font_css,
        )
    except HTTPException as exc:
        logger.error(f"Slide preview generation failed: {exc.detail}")
        raise HTTPException(
            status_code=500,
            detail={
                "code": SLIDE_PREVIEW_GENERATION_FAILED_CODE,
                "message": (
                    "Unable to generate slide previews for this PPTX after font validation. "
                    "Please retry with valid font files or use a template with embedded fonts."
                ),
            },
        ) from exc
    except Exception as exc:
        logger.error(f"Slide preview generation failed unexpectedly: {exc}")
        raise HTTPException(
            status_code=500,
            detail={
                "code": SLIDE_PREVIEW_GENERATION_FAILED_CODE,
                "message": (
                    "Unable to generate slide previews for this PPTX after font validation. "
                    "Please retry with valid font files or use a template with embedded fonts."
                ),
            },
        ) from exc
    if not screenshot_paths:
        raise HTTPException(status_code=500, detail="Failed to generate slide images")
    persisted_paths = await persist_files_to_session(
        [
            (os.path.join(session_dir, f"slide_{idx}.png"), path)
            for idx, path in enumerate(screenshot_paths, start=1)
        ]
    )
    for path in screenshot_paths:
        with contextlib.suppress(OSError):
            os.remove(path)
    return persisted_paths


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
    font_replacements: Sequence[FontReplacementSelection],
    replacement_font_urls: Dict[str, str],
    available_font_entries: Sequence[FontInfo],
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
    for original_name, replacement_url in replacement_font_urls.items():
        fonts[original_name] = replacement_url
        logger.info(f"Added replacement alias stylesheet: {original_name} -> {replacement_url}")
    exact_original_names = {
        (name or "").strip()
        for name in (original_font_names or [])
        if (name or "").strip()
    }.union(
        (replacement.original_name or "").strip()
        for replacement in font_replacements
        if (replacement.original_name or "").strip()
    )
    normalized_original_names = {
        normalize_font_family_name(name)
        for name in exact_original_names
        if normalize_font_family_name(name)
    }
    replaced_names = exact_original_names.union(normalized_original_names).union(font_mapping.keys()).union(embedded_urls.keys())
    fonts_to_check = sorted({normalize_font_family_name(font) for font in raw_fonts if font not in replaced_names and normalize_font_family_name(font)})
    results = await asyncio.gather(*[check_google_font_availability(font, variants=variants_for_font_name(font, variants_by_name)) for font in fonts_to_check]) if fonts_to_check else []
    for font, is_available in zip(fonts_to_check, results):
        if is_available:
            fonts[font] = build_google_fonts_stylesheet_url(font, variants=variants_for_font_name(font, variants_by_name))
            logger.info(f"Added Google Font: {font} -> {fonts[font]}")
    return fonts


async def _find_unresolved_fonts(
    *,
    variants_by_name: Dict[str, Set[str]],
    originals: Dict[Tuple[str, str], str],
    embedded_urls: Dict[str, str],
    font_variant_mapping: Dict[str, Dict[str, str]],
) -> List[FontInfo]:
    google_availability: Dict[str, bool] = {}
    unresolved_fonts: List[FontInfo] = []

    for (normalized_name, variant), original_name in sorted(originals.items()):
        if _is_variant_resolved(
            normalized_name=normalized_name,
            original_name=original_name,
            variant=variant,
            embedded_urls=embedded_urls,
            font_variant_mapping=font_variant_mapping,
        ):
            continue

        if normalized_name not in google_availability:
            google_availability[normalized_name] = await check_google_font_availability(
                normalized_name,
                variants=variants_for_font_name(normalized_name, variants_by_name),
            )
        if google_availability[normalized_name]:
            continue

        unresolved_fonts.append(
            font_info_entry(
                normalized_name,
                None,
                variant,
                original_name=original_name,
            )
        )

    return unresolved_fonts


def _is_variant_resolved(
    *,
    normalized_name: str,
    original_name: str,
    variant: str,
    embedded_urls: Dict[str, str],
    font_variant_mapping: Dict[str, Dict[str, str]],
) -> bool:
    if original_name in embedded_urls:
        return True

    lookup_keys = {
        original_name,
        normalized_name,
        normalize_font_family_name(original_name),
    }
    return any((font_variant_mapping.get(key) or {}).get(variant) for key in lookup_keys if key)


def _parse_font_replacements(
    font_replacements: Optional[str],
) -> List[FontReplacementSelection]:
    if not font_replacements:
        return []
    try:
        payload = json.loads(font_replacements)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=400,
            detail="Invalid font_replacements payload. Expected JSON array.",
        ) from exc
    if not isinstance(payload, list):
        raise HTTPException(
            status_code=400,
            detail="Invalid font_replacements payload. Expected JSON array.",
        )
    try:
        return [FontReplacementSelection.model_validate(item) for item in payload]
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail="Invalid font_replacements entry.",
        ) from exc


def _validate_font_replacements(
    replacements: Sequence[FontReplacementSelection],
    *,
    available_font_entries: Sequence[FontInfo],
    unavailable_font_entries: Sequence[FontInfo],
) -> List[FontReplacementSelection]:
    if not replacements:
        return []

    missing_keys = {
        (font.original_name or font.name, font.variant or "regular")
        for font in unavailable_font_entries
    }
    matched_keys = {
        ((font.family_name or font.name), font.variant or "regular")
        for font in available_font_entries
    }
    validated: List[FontReplacementSelection] = []
    seen_missing_keys: Set[Tuple[str, str]] = set()

    for replacement in replacements:
        missing_key = (
            replacement.original_name.strip(),
            replacement.original_variant.strip() or "regular",
        )
        matched_key = (
            replacement.replacement_family_name.strip(),
            replacement.replacement_variant.strip() or "regular",
        )
        if missing_key not in missing_keys:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Invalid font replacement. The selected missing font entry does not "
                    "exist in the current PPTX."
                ),
            )
        if matched_key not in matched_keys:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Invalid font replacement. The selected matched font is not "
                    "available for the current PPTX."
                ),
            )
        if missing_key in seen_missing_keys:
            raise HTTPException(
                status_code=400,
                detail="Invalid font replacement. Duplicate replacement entries are not allowed.",
            )
        seen_missing_keys.add(missing_key)
        validated.append(replacement)

    return validated


def _build_replacement_mappings(
    font_replacements: Sequence[FontReplacementSelection],
    logger,
) -> Tuple[Dict[str, str], Dict[str, Dict[str, str]]]:
    font_mapping: Dict[str, str] = {}
    font_variant_mapping: Dict[str, Dict[str, str]] = {}
    for replacement in font_replacements:
        original_name = replacement.original_name.strip()
        original_variant = replacement.original_variant.strip() or "regular"
        replacement_name = replacement.replacement_family_name.strip()
        normalized_original_name = normalize_font_family_name(original_name)
        font_mapping[original_name] = replacement_name
        font_variant_mapping.setdefault(original_name, {})[original_variant] = replacement_name
        if normalized_original_name:
            font_variant_mapping.setdefault(normalized_original_name, {})[
                original_variant
            ] = replacement_name
        logger.info(
            "Replacement mapping: "
            f"{original_name} {original_variant} -> {replacement_name}"
        )
    return font_mapping, font_variant_mapping


def _merge_font_variant_mappings(
    base_mapping: Dict[str, Dict[str, str]],
    overriding_mapping: Dict[str, Dict[str, str]],
) -> Dict[str, Dict[str, str]]:
    merged: Dict[str, Dict[str, str]] = {
        key: value.copy() for key, value in base_mapping.items()
    }
    for key, variants in overriding_mapping.items():
        merged.setdefault(key, {}).update(variants)
    return merged


def _available_font_url_index(
    available_font_entries: Sequence[FontInfo],
) -> Dict[Tuple[str, str], str]:
    urls: Dict[Tuple[str, str], str] = {}
    for font in available_font_entries:
        family_name = (font.family_name or font.name or "").strip()
        variant_name = (font.variant or "regular").strip() or "regular"
        if family_name and font.url:
            urls[(family_name, variant_name)] = font.url
    return urls


def _is_placeholder_font_url(url: str) -> bool:
    return url == "https://example.com/just-a-placeholder-url.ttf"


async def _prepare_replacement_font_assets(
    *,
    font_replacements: Sequence[FontReplacementSelection],
    available_font_entries: Sequence[FontInfo],
    embedded_urls: Dict[str, str],
    session_dir: str,
    logger,
) -> Tuple[str, Dict[str, str]]:
    if not font_replacements:
        return "", {}

    available_font_urls = _available_font_url_index(available_font_entries)
    alias_css_chunks: List[str] = []
    alias_names: Set[str] = set()
    seen_alias_sources: Set[Tuple[str, str, str]] = set()

    for replacement in font_replacements:
        original_name = replacement.original_name.strip()
        original_variant = replacement.original_variant.strip() or "regular"
        source_url = _resolve_replacement_source_url(
            replacement=replacement,
            available_font_entries=available_font_entries,
            available_font_urls=available_font_urls,
            embedded_urls=embedded_urls,
        )
        if not source_url:
            raise HTTPException(
                status_code=500,
                detail=(
                    "Unable to resolve the selected matched font resource for preview generation."
                ),
            )
        dedupe_key = (original_name, original_variant, source_url)
        if dedupe_key in seen_alias_sources:
            alias_names.add(original_name)
            continue
        seen_alias_sources.add(dedupe_key)
        alias_names.add(original_name)

        if _is_stylesheet_url(source_url):
            stylesheet_text = await _read_font_stylesheet_text(source_url)
            if not stylesheet_text.strip():
                raise HTTPException(
                    status_code=500,
                    detail=(
                        "Unable to load the selected matched font stylesheet for preview generation."
                    ),
                )
            alias_css_chunks.append(
                _rewrite_font_family_in_stylesheet(stylesheet_text, original_name)
            )
        else:
            alias_css_chunks.append(
                _build_local_alias_font_face_rule(
                    original_name=original_name,
                    original_variant=original_variant,
                    source_url=source_url,
                )
            )

    combined_css = "\n\n".join(chunk for chunk in alias_css_chunks if chunk.strip()).strip()
    if not combined_css:
        return "", {}

    alias_stylesheet_path = os.path.join(
        session_dir,
        "fonts",
        "replacement-font-aliases.css",
    )
    await asyncio.to_thread(os.makedirs, os.path.dirname(alias_stylesheet_path), exist_ok=True)
    await asyncio.to_thread(
        write_bytes_to_path,
        alias_stylesheet_path,
        combined_css.encode("utf-8"),
    )
    alias_stylesheet_url = public_urls_for_local_paths([alias_stylesheet_path])[0]
    logger.info(
        f"Prepared replacement font alias stylesheet for {len(alias_names)} original font name(s)"
    )
    return combined_css, {name: alias_stylesheet_url for name in sorted(alias_names)}


def _resolve_replacement_source_url(
    *,
    replacement: FontReplacementSelection,
    available_font_entries: Sequence[FontInfo],
    available_font_urls: Dict[Tuple[str, str], str],
    embedded_urls: Dict[str, str],
) -> Optional[str]:
    matched_key = (
        replacement.replacement_family_name.strip(),
        replacement.replacement_variant.strip() or "regular",
    )
    candidate_url = available_font_urls.get(matched_key)
    if candidate_url and not _is_placeholder_font_url(candidate_url):
        return candidate_url

    for font in available_font_entries:
        family_name = (font.family_name or font.name or "").strip()
        variant_name = (font.variant or "regular").strip() or "regular"
        if (family_name, variant_name) != matched_key:
            continue
        if font.url and not _is_placeholder_font_url(font.url):
            return font.url
        for embedded_key in (
            (font.original_name or "").strip(),
            family_name,
            (font.name or "").strip(),
        ):
            if embedded_key and embedded_key in embedded_urls:
                return embedded_urls[embedded_key]
    return None


def _is_stylesheet_url(url: str) -> bool:
    parsed = urllib.parse.urlparse(url or "")
    return parsed.path.lower().endswith(".css") or parsed.netloc.lower() == "fonts.googleapis.com"


async def _read_font_stylesheet_text(url: str) -> str:
    parsed = urllib.parse.urlparse(url or "")
    if parsed.scheme in ("http", "https"):
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=20)) as response:
                if response.status != 200:
                    return ""
                return await response.text()

    if str(url).startswith(("/app_data/", "/static/")):
        try:
            try:
                from utils.asset_directory_utils import resolve_app_path_to_filesystem
            except ModuleNotFoundError:  # pragma: no cover - backend test import path
                from backend.presenton_runtime.utils.asset_directory_utils import (
                    resolve_app_path_to_filesystem,
                )
            candidate = resolve_app_path_to_filesystem(url)
        except Exception:
            candidate = None
        if candidate and os.path.isfile(candidate):
            return await asyncio.to_thread(_read_text_file, candidate)
    return ""


def _rewrite_font_family_in_stylesheet(stylesheet_text: str, original_name: str) -> str:
    quoted_name = _css_string_literal(original_name)
    return re.sub(
        r"font-family\s*:\s*(?:'[^']*'|\"[^\"]*\"|[^;}{]+)",
        lambda _match: f"font-family: {quoted_name}",
        stylesheet_text,
        flags=re.IGNORECASE,
    )


def _css_string_literal(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    escaped = escaped.replace("\r", " ").replace("\n", " ")
    return f'"{escaped}"'


def _build_local_alias_font_face_rule(
    *,
    original_name: str,
    original_variant: str,
    source_url: str,
) -> str:
    font_weight = "700" if "bold" in original_variant else "400"
    font_style = "italic" if "italic" in original_variant else "normal"
    return (
        "@font-face {\n"
        f"  font-family: {_css_string_literal(original_name)};\n"
        f"  src: url({_css_string_literal(source_url)});\n"
        f"  font-weight: {font_weight};\n"
        f"  font-style: {font_style};\n"
        "  font-display: swap;\n"
        "}"
    )


def _read_text_file(path: str) -> str:
    with open(path, "r", encoding="utf-8") as file:
        return file.read()
