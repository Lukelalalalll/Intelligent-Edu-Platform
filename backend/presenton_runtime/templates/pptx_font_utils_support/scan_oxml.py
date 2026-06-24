from __future__ import annotations

import xml.etree.ElementTree as ET
from typing import Dict, List, Optional, Set

from .common import FONT_TAGS, PPT_NS, TEXT_STYLE_TAGS, THEME_FONT_REFERENCES


def _resolve_theme_typeface(typeface: Optional[str], theme_fonts: Optional[Dict[str, str]] = None) -> Optional[str]:
    cleaned = str(typeface or "").strip()
    if not cleaned:
        return None
    if cleaned.startswith("+mj"):
        return ((theme_fonts or {}).get("major") or "").strip() or None
    if cleaned.startswith("+mn"):
        return ((theme_fonts or {}).get("minor") or "").strip() or None
    return cleaned


def _extract_typefaces_from_text_style_node(text_style_node: ET.Element, theme_fonts: Optional[Dict[str, str]] = None) -> List[str]:
    fonts: List[str] = []
    seen = set()
    font_tags = FONT_TAGS
    latin_elem = text_style_node.find("a:latin", PPT_NS)
    latin_typeface = _resolve_theme_typeface(latin_elem.get("typeface"), theme_fonts) if latin_elem is not None else None
    if latin_typeface and latin_typeface not in THEME_FONT_REFERENCES:
        font_tags = ("a:latin",)
    for font_tag in font_tags:
        font_elem = text_style_node.find(font_tag, PPT_NS)
        if font_elem is None:
            continue
        resolved = _resolve_theme_typeface(font_elem.get("typeface"), theme_fonts)
        if not resolved or resolved in THEME_FONT_REFERENCES or resolved in seen:
            continue
        seen.add(resolved)
        fonts.append(resolved)
    return fonts


def extract_fonts_from_xml_root(root: ET.Element, theme_fonts: Optional[Dict[str, str]] = None) -> Set[str]:
    fonts: Set[str] = set()
    for style_tag in TEXT_STYLE_TAGS:
        for style_elem in root.findall(f".//{style_tag}", PPT_NS):
            fonts.update(_extract_typefaces_from_text_style_node(style_elem, theme_fonts))
    return fonts


def extract_fonts_from_oxml(xml_content: str) -> List[str]:
    try:
        return sorted(extract_fonts_from_xml_root(ET.fromstring(xml_content)))
    except Exception as exc:
        print(f"Error extracting fonts from OXML: {exc}")
        return []
