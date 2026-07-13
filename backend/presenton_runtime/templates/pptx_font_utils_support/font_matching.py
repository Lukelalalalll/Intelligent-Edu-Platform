from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from functools import lru_cache
from typing import Optional, Sequence

from .common import FONT_TAGS

STYLE_TOKENS = {
    "italic", "italics", "ital", "oblique", "roman", "gras", "bolditalic", "bolditalics",
    "thin", "hairline", "extralight", "ultralight", "light", "demilight", "semilight",
    "book", "regular", "normal", "medium", "semibold", "demibold", "bold", "extrabold",
    "ultrabold", "black", "extrablack", "ultrablack", "heavy", "narrow", "condensed",
    "semicondensed", "extracondensed", "ultracondensed", "expanded", "semiexpanded",
    "extraexpanded", "ultraexpanded",
}
STYLE_MODIFIERS = {"semi", "demi", "extra", "ultra"}
WEIGHT_KEYWORDS = {
    "thin": ("thin", "hairline"),
    "extra_light": ("extra light", "extra-light", "extralight", "ultra light", "ultra-light", "ultralight"),
    "light": ("light",),
    "regular": ("regular", "normal", "book"),
    "medium": ("medium",),
    "semibold": ("semi bold", "semi-bold", "semibold", "demi bold", "demi-bold", "demibold"),
    "bold": ("bold",),
    "extra_bold": ("extra bold", "extra-bold", "extrabold", "ultra bold", "ultra-bold", "ultrabold"),
    "black": ("black", "heavy"),
    "extra_black": ("extra black", "extra-black", "extrablack", "ultra black", "ultra-black", "ultrablack", "super black", "super-black", "superblack"),
}
STYLE_KEYWORDS = ("italic", "oblique")
WEIGHT_CLASS_BUCKETS = (
    ("thin", 0, 149), ("extra_light", 150, 249), ("light", 250, 349), ("regular", 350, 449),
    ("medium", 450, 549), ("semibold", 550, 649), ("bold", 650, 749), ("extra_bold", 750, 849),
    ("black", 850, 925), ("extra_black", 926, 1000),
)


def normalize_font_family_name(raw_name: str) -> str:
    if not raw_name:
        return raw_name
    name = raw_name.replace("_", " ").replace("-", " ")
    name = re.sub(r"(?<=[a-z0-9])([A-Z])", r" \1", name)
    name = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", name)
    name = re.sub(r"\s+", " ", name).strip()
    lower_name = name.lower()
    for style in sorted(STYLE_TOKENS, key=len, reverse=True):
        if lower_name.endswith(" " + style):
            name = name[: -(len(style) + 1)]
            lower_name = lower_name[: -(len(style) + 1)]
            break
    tokens_original = name.split(" ")
    tokens_filtered = []
    for index, token in enumerate(tokens_original):
        lower_token = token.lower()
        if index == 0 or (lower_token not in STYLE_TOKENS and lower_token not in STYLE_MODIFIERS):
            tokens_filtered.append(token)
    return re.sub(r"\s+", " ", " ".join(tokens_filtered or tokens_original).strip())


def normalize_font_variants(variants: Optional[Sequence[str]]) -> list[str]:
    order = ("regular", "bold", "italic", "bold_italic")
    variant_set = set(variants or ()) or {"regular"}
    return [variant for variant in order if variant in variant_set]


def _normalize_text(value: Optional[str]) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", (value or "").lower())).strip()


def _normalize_compact(value: Optional[str]) -> str:
    return re.sub(r"[^a-z0-9]+", "", (value or "").lower())


def _is_truthy_ooxml_flag(value: Optional[str]) -> bool:
    return str(value or "").lower() in {"1", "true", "on"}


def _font_style_variant(font_name: str, r_pr: Optional[ET.Element], default_rprs: Sequence[ET.Element] = ()) -> str:
    bold = False
    italic = False
    for style_node in [r_pr, *default_rprs]:
        if style_node is not None and style_node.get("b") is not None:
            bold = _is_truthy_ooxml_flag(style_node.get("b"))
            break
    for style_node in [r_pr, *default_rprs]:
        if style_node is not None and style_node.get("i") is not None:
            italic = _is_truthy_ooxml_flag(style_node.get("i"))
            break
    if _extract_weight_from_name(font_name) == "bold":
        bold = True
    compact_name = _normalize_compact(font_name)
    if "italic" in compact_name or "oblique" in compact_name:
        italic = True
    return "bold_italic" if bold and italic else "bold" if bold else "italic" if italic else "regular"


@lru_cache(maxsize=1)
def _get_weight_keyword_index():
    entries = []
    for canonical, phrases in WEIGHT_KEYWORDS.items():
        for phrase in phrases:
            normalized = _normalize_text(phrase)
            compact = _normalize_compact(phrase)
            if normalized:
                entries.append((normalized, compact, canonical))
    return tuple(sorted(entries, key=lambda item: len(item[0]), reverse=True))


@lru_cache(maxsize=1)
def _get_removal_keywords():
    keywords = {normalized for normalized, _, _ in _get_weight_keyword_index() if normalized}
    keywords.update(_normalize_text(style) for style in STYLE_KEYWORDS if _normalize_text(style))
    return tuple(sorted(keywords, key=len, reverse=True))


def _family_key(value: Optional[str]) -> str:
    normalized = _normalize_text(value)
    cleaned = normalized
    for keyword in _get_removal_keywords():
        cleaned = re.sub(r"\b" + re.escape(keyword) + r"\b", " ", cleaned)
    target = re.sub(r"\s+", " ", cleaned).strip() or normalized
    return re.sub(r"\s+", "", target)


def _extract_weight_from_name(value: Optional[str]) -> Optional[str]:
    normalized = _normalize_text(value)
    compact = _normalize_compact(value)
    padded = f" {normalized} "
    for phrase_norm, phrase_compact, canonical in _get_weight_keyword_index():
        if f" {phrase_norm} " in padded or (phrase_compact and phrase_compact in compact):
            return canonical
    return None


def _weight_from_class(weight_class: Optional[int]) -> Optional[str]:
    for canonical, lower, upper in WEIGHT_CLASS_BUCKETS:
        if weight_class is not None and lower <= weight_class <= upper:
            return canonical
    return None


def _extract_weight_from_detail(font_detail) -> Optional[str]:
    for candidate in (None, font_detail.subfamily_name, font_detail.full_name, font_detail.postscript_name):
        weight = _weight_from_class(font_detail.weight_class) if candidate is None else _extract_weight_from_name(candidate)
        if weight:
            return weight
    return None


def _weight_value_from_canonical(weight_key: Optional[str]) -> Optional[int]:
    for canonical, lower, upper in WEIGHT_CLASS_BUCKETS:
        if canonical == weight_key:
            return (lower + upper) // 2
    return None


def _weight_value_from_detail(font_detail) -> Optional[int]:
    midpoint = _weight_value_from_canonical(_extract_weight_from_detail(font_detail))
    if midpoint is not None:
        return midpoint
    for _, lower, upper in WEIGHT_CLASS_BUCKETS:
        if font_detail.weight_class is not None and lower <= font_detail.weight_class <= upper:
            return (lower + upper) // 2
    return None


def get_index_of_matching_font_detail_or_none(font_name: str, font_details: Sequence) -> Optional[int]:
    family_key = _family_key(font_name)
    if not family_key or not font_details:
        return None
    expected_weight = _extract_weight_from_name(font_name) or "regular"
    expected_weight_value = _weight_value_from_canonical(expected_weight) or 400
    best_index = None
    best_score = -1
    fallback_index = None
    fallback_diff = float("inf")
    for index, font_detail in enumerate(font_details):
        detail_keys = {
            _family_key(value)
            for value in (
                getattr(font_detail, "full_name", None),
                getattr(font_detail, "postscript_name", None),
                getattr(font_detail, "family_name", None),
                getattr(font_detail, "subfamily_name", None),
            )
            if _family_key(value)
        }
        if family_key not in detail_keys:
            continue
        detail_weight = _extract_weight_from_detail(font_detail)
        detail_weight_value = _weight_value_from_detail(font_detail) or expected_weight_value
        score = 3 if detail_weight == expected_weight else 2 if detail_weight is None and expected_weight == "regular" else 1
        if score > best_score:
            best_index = index
            best_score = score
        diff = abs(detail_weight_value - expected_weight_value)
        if diff < fallback_diff:
            fallback_index = index
            fallback_diff = diff
    return best_index if best_score >= 2 else fallback_index
