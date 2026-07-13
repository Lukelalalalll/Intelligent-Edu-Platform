from __future__ import annotations

import asyncio
import re
import xml.etree.ElementTree as ET

import aiohttp

from api.v1.ppt.endpoints.pptx_slides_support.pptx_slide_models import FontAnalysisResult

_STYLE_TOKENS = {
    "italic",
    "italics",
    "ital",
    "oblique",
    "roman",
    "bolditalic",
    "bolditalics",
    "thin",
    "hairline",
    "extralight",
    "ultralight",
    "light",
    "demilight",
    "semilight",
    "book",
    "regular",
    "normal",
    "medium",
    "semibold",
    "demibold",
    "bold",
    "extrabold",
    "ultrabold",
    "black",
    "extrablack",
    "ultrablack",
    "heavy",
    "narrow",
    "condensed",
    "semicondensed",
    "extracondensed",
    "ultracondensed",
    "expanded",
    "semiexpanded",
    "extraexpanded",
    "ultraexpanded",
}
_STYLE_MODIFIERS = {"semi", "demi", "extra", "ultra"}


def insert_spaces_in_camel_case(value: str) -> str:
    value = re.sub(r"(?<=[a-z0-9])([A-Z])", r" \1", value)
    value = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", value)
    return value


def normalize_font_family_name(raw_name: str) -> str:
    if not raw_name:
        return raw_name

    name = insert_spaces_in_camel_case(raw_name.replace("_", " ").replace("-", " "))
    name = re.sub(r"\s+", " ", name).strip()
    lower_name = name.lower()
    for style in sorted(_STYLE_TOKENS, key=len, reverse=True):
        if lower_name.endswith(" " + style):
            name = name[: -(len(style) + 1)]
            break

    tokens_original = name.split(" ")
    tokens_filtered: list[str] = []
    for index, token in enumerate(tokens_original):
        lower_token = token.lower()
        if index == 0 or (
            lower_token not in _STYLE_TOKENS and lower_token not in _STYLE_MODIFIERS
        ):
            tokens_filtered.append(token)
    if not tokens_filtered:
        tokens_filtered = tokens_original
    return re.sub(r"\s+", " ", " ".join(tokens_filtered).strip())


def extract_fonts_from_oxml(xml_content: str) -> list[str]:
    fonts = set()
    try:
        root = ET.fromstring(xml_content)
        namespaces = {
            "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
            "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
            "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        }
        for xpath in (".//a:latin", ".//a:ea", ".//a:cs", ".//a:font"):
            for font_elem in root.findall(xpath, namespaces):
                typeface = font_elem.attrib.get("typeface")
                if typeface:
                    fonts.add(typeface)
        for rpr_elem in root.findall(".//a:rPr", namespaces):
            for font_elem in rpr_elem.findall(".//a:latin", namespaces):
                typeface = font_elem.attrib.get("typeface")
                if typeface:
                    fonts.add(typeface)
        for font_elem in root.findall(".//latin"):
            typeface = font_elem.attrib.get("typeface")
            if typeface:
                fonts.add(typeface)
        fonts.update(re.findall(r'typeface="([^"]+)"', xml_content))
        system_fonts = {"+mn-lt", "+mj-lt", "+mn-ea", "+mj-ea", "+mn-cs", "+mj-cs", ""}
        return [font for font in fonts if font not in system_fonts and font.strip()]
    except Exception as exc:
        print(f"Error extracting fonts from OXML: {exc}")
        return []


async def check_google_font_availability(font_name: str) -> bool:
    try:
        formatted_name = font_name.replace(" ", "+")
        url = f"https://fonts.googleapis.com/css2?family={formatted_name}&display=swap"
        async with aiohttp.ClientSession() as session:
            async with session.head(
                url,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as response:
                return response.status == 200
    except Exception as exc:
        print(f"Error checking Google Font availability for {font_name}: {exc}")
        return False


def normalized_fonts_for_slide(xml_content: str) -> list[str]:
    raw_fonts = extract_fonts_from_oxml(xml_content)
    return sorted({normalize_font_family_name(font) for font in raw_fonts if font})


async def analyze_fonts_in_all_slides(slide_xmls: list[str]) -> FontAnalysisResult:
    raw_fonts = set()
    for xml_content in slide_xmls:
        raw_fonts.update(extract_fonts_from_oxml(xml_content))

    normalized_fonts = {normalize_font_family_name(font) for font in raw_fonts if font}
    if not normalized_fonts:
        return FontAnalysisResult(internally_supported_fonts=[], not_supported_fonts=[])

    tasks = [check_google_font_availability(font) for font in normalized_fonts]
    results = await asyncio.gather(*tasks)

    internally_supported_fonts = []
    not_supported_fonts = []
    for font, is_available in zip(normalized_fonts, results):
        if is_available:
            formatted_name = font.replace(" ", "+")
            internally_supported_fonts.append(
                {
                    "name": font,
                    "google_fonts_url": (
                        f"https://fonts.googleapis.com/css2?family={formatted_name}&display=swap"
                    ),
                }
            )
        else:
            not_supported_fonts.append(font)

    return FontAnalysisResult(
        internally_supported_fonts=internally_supported_fonts,
        not_supported_fonts=[],
    )
