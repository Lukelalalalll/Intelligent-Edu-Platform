from __future__ import annotations

import asyncio
import os
import zipfile
from typing import Dict, List, Optional, Set, Tuple

from .font_matching import get_index_of_matching_font_detail_or_none, normalize_font_family_name, normalize_font_variants
from .font_metadata import FontDetail, get_font_details
from .google_fonts import build_google_fonts_stylesheet_url, check_google_font_availability
from .scan_oxml import extract_fonts_from_oxml
from .scan_variants import extract_used_font_variants_from_pptx


def extract_used_fonts_from_pptx(pptx_path: str) -> Set[str]:
    return set(extract_used_font_variants_from_pptx(pptx_path).keys())


def extract_raw_fonts_and_embedded_details(
    pptx_path: str,
    temp_dir: str,
) -> Tuple[Set[str], List[FontDetail], List[str]]:
    raw_fonts = extract_used_fonts_from_pptx(pptx_path)
    embedded_details: List[FontDetail] = []
    embedded_paths: List[str] = []
    if not raw_fonts:
        return raw_fonts, embedded_details, embedded_paths
    with zipfile.ZipFile(pptx_path, "r") as zip_ref:
        for rel_path in [path for path in zip_ref.namelist() if path.startswith("ppt/fonts/") and path.endswith(".fntdata")]:
            try:
                zip_ref.extract(rel_path, temp_dir)
                font_path = os.path.join(temp_dir, rel_path)
                embedded_details.append(get_font_details(font_path))
                embedded_paths.append(font_path)
            except zipfile.BadZipFile:
                print(f"Skipping corrupted embedded font: {rel_path}")
            except Exception as exc:
                print(f"Failed to parse embedded font {rel_path}: {exc}")
    return raw_fonts, embedded_details, embedded_paths


async def get_available_and_unavailable_fonts_for_pptx(
    pptx_path: str,
    temp_dir: str,
) -> Tuple[List[Tuple[str, Optional[str]]], List[Tuple[str, Optional[str]]]]:
    raw_fonts, embedded_details, _ = await asyncio.to_thread(extract_raw_fonts_and_embedded_details, pptx_path, temp_dir)
    font_variants_by_name = await asyncio.to_thread(extract_used_font_variants_from_pptx, pptx_path)
    if not raw_fonts:
        return [], []
    found_fonts_with_url: Dict[str, str] = {
        font_name: "https://example.com/just-a-placeholder-url.ttf"
        for font_name in raw_fonts
        if get_index_of_matching_font_detail_or_none(font_name, embedded_details) is not None
    }
    normalized_variants: Dict[str, Set[str]] = {}
    for font_name, variants in font_variants_by_name.items():
        normalized_name = normalize_font_family_name(font_name)
        if normalized_name:
            normalized_variants.setdefault(normalized_name, set()).update(variants)
    fonts_to_check = list({normalize_font_family_name(font) for font in sorted(raw_fonts - set(found_fonts_with_url)) if normalize_font_family_name(font)})
    availability_results = await asyncio.gather(*[
        check_google_font_availability(font, variants=normalize_font_variants(normalized_variants.get(font)))
        for font in fonts_to_check
    ]) if fonts_to_check else []
    available_fonts = list(found_fonts_with_url.items())
    unavailable_fonts: List[Tuple[str, Optional[str]]] = []
    for font, is_available in zip(fonts_to_check, availability_results):
        if is_available:
            available_fonts.append((font, build_google_fonts_stylesheet_url(font, variants=normalize_font_variants(normalized_variants.get(font)))))
        else:
            unavailable_fonts.append((font, None))
    return available_fonts, unavailable_fonts


__all__ = [
    "extract_fonts_from_oxml",
    "extract_raw_fonts_and_embedded_details",
    "extract_used_font_variants_from_pptx",
    "extract_used_fonts_from_pptx",
    "get_available_and_unavailable_fonts_for_pptx",
]
