from __future__ import annotations

import os
from typing import Dict, List, Optional, Set, Tuple

from ..pptx_font_utils_support.font_matching import (
    _font_style_variant,
    normalize_font_family_name,
    normalize_font_variants,
)
from ..pptx_font_utils_support.font_metadata import FontDetail

from .models import FontInfo


def font_variants_by_normalized_name(font_variants: Dict[str, Set[str]]) -> Dict[str, Set[str]]:
    normalized_variants: Dict[str, Set[str]] = {}
    for font_name, variants in font_variants.items():
        normalized_name = normalize_font_family_name(font_name)
        if normalized_name:
            normalized_variants.setdefault(normalized_name, set()).update(variants)
    return normalized_variants


def variants_for_font_name(font_name: str, variants_by_normalized_name: Dict[str, Set[str]]) -> List[str]:
    return normalize_font_variants(variants_by_normalized_name.get(normalize_font_family_name(font_name)))


def font_variant_display_name(font_name: str, variant: str) -> str:
    labels = {"regular": "Regular", "bold": "Bold", "italic": "Italic", "bold_italic": "Bold Italic"}
    return f"{font_name} {labels.get(variant, variant.replace('_', ' ').title())}"


def font_info_entry(font_name: str, url: Optional[str], variant: str, original_name: Optional[str] = None) -> FontInfo:
    return FontInfo(
        name=font_variant_display_name(font_name, variant),
        url=url,
        original_name=original_name or font_name,
        family_name=font_name,
        variant=variant,
        variants=[variant],
    )


def font_info_entries(
    fonts_data: List[Tuple[str, Optional[str]]],
    variants_by_normalized_name: Dict[str, Set[str]],
    original_names_by_normalized_variant: Optional[Dict[Tuple[str, str], str]] = None,
) -> List[FontInfo]:
    entries: List[FontInfo] = []
    for name, url in fonts_data:
        for variant in variants_for_font_name(name, variants_by_normalized_name):
            original_name = (original_names_by_normalized_variant or {}).get((normalize_font_family_name(name), variant))
            entries.append(font_info_entry(name, url, variant, original_name))
    return entries


def original_names_by_normalized_variant(font_variants: Dict[str, Set[str]]) -> Dict[Tuple[str, str], str]:
    originals: Dict[Tuple[str, str], str] = {}
    for original_name, variants in font_variants.items():
        normalized_name = normalize_font_family_name(original_name)
        if normalized_name:
            for variant in normalize_font_variants(variants):
                originals.setdefault((normalized_name, variant), original_name)
    return originals


def font_detail_variant(font_detail: FontDetail, filename: str = "") -> str:
    compact_metadata = "".join(
        char for char in " ".join(value or "" for value in (font_detail.subfamily_name, font_detail.full_name, font_detail.postscript_name, filename)).lower() if char.isalnum()
    )
    italic = "italic" in compact_metadata or "oblique" in compact_metadata
    if font_detail.weight_class is not None:
        if font_detail.weight_class == 700:
            bold = True
        elif font_detail.weight_class == 400:
            bold = False
        else:
            return "unsupported"
    else:
        bold = "bold" in compact_metadata or "gras" in compact_metadata
        if any(token in compact_metadata for token in ("semibold", "demibold", "medium", "extrabold", "black")) and not bold:
            return "unsupported"
    return "bold_italic" if bold and italic else "bold" if bold else "italic" if italic else "regular"


def font_name_has_explicit_variant(font_name: str) -> bool:
    return bool(font_name and normalize_font_family_name(font_name) != font_name.strip())


def actual_uploaded_font_name(detail: FontDetail, variant: str, font_filename: str) -> str:
    if detail.full_name:
        return detail.full_name
    if detail.family_name:
        family_name = normalize_font_family_name(detail.family_name)
        return font_variant_display_name(family_name or detail.family_name, variant)
    filename_family = normalize_font_family_name(os.path.splitext(os.path.basename(font_filename))[0])
    return font_variant_display_name(filename_family or font_filename, variant)


def direct_upload_replacement_font_name(
    original_name: str,
    requested_variant: str,
    uploaded_variant: str,
    detail: FontDetail,
    font_filename: str,
) -> str:
    actual_font_name = actual_uploaded_font_name(detail, uploaded_variant, font_filename)
    original_family_name = normalize_font_family_name(original_name)
    if not original_family_name or not font_name_has_explicit_variant(original_name) or requested_variant != uploaded_variant:
        return actual_font_name
    candidates = (detail.family_name, detail.full_name, detail.postscript_name, os.path.splitext(os.path.basename(font_filename))[0])
    return font_variant_display_name(original_family_name, requested_variant) if any(normalize_font_family_name(candidate) == original_family_name for candidate in candidates) else actual_font_name


def strip_trailing_modified_suffix(name: str) -> str:
    cleaned_name = (name or "").strip()
    lowered_name = cleaned_name.casefold()
    for suffix in ("-modified", "_modified", " modified"):
        if lowered_name.endswith(suffix):
            return cleaned_name[: -len(suffix)].rstrip(" -_")
    return cleaned_name


def build_modified_pptx_filename(original_filename: str) -> str:
    safe_filename = os.path.basename((original_filename or "").strip())
    stem, extension = os.path.splitext(safe_filename)
    base_stem = strip_trailing_modified_suffix(stem) or stem.strip() or "presentation"
    return f"{base_stem}-modified{extension or '.pptx'}"
