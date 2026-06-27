from __future__ import annotations

from typing import Optional

AUTO_PRESENTATION_LANGUAGE = "Auto"
ENGLISH_PRESENTATION_LANGUAGE = "English"
CHINESE_SIMPLIFIED_PRESENTATION_LANGUAGE = "Chinese (Simplified - 中文, 汉语)"
CHINESE_TRADITIONAL_PRESENTATION_LANGUAGE = "Chinese (Traditional - 中文, 漢語)"
CANTONESE_TRADITIONAL_PRESENTATION_LANGUAGE = "Cantonese (Traditional - 粵語繁體)"


def normalize_presentation_language(language: Optional[str]) -> Optional[str]:
    if language is None:
        return None

    value = str(language).strip()
    if not value:
        return None

    folded = value.casefold()

    if folded in {"auto", "auto-detect"}:
        return AUTO_PRESENTATION_LANGUAGE

    if folded in {"en", "en-us", "en-gb"} or folded.startswith("en-"):
        return ENGLISH_PRESENTATION_LANGUAGE

    if folded in {"zh-cn", "zh-sg", "zh-hans"} or folded.startswith("zh-cn") or folded.startswith("zh-sg"):
        return CHINESE_SIMPLIFIED_PRESENTATION_LANGUAGE

    if folded in {"zh-hk", "zh-mo", "yue"} or folded.startswith("zh-hk") or folded.startswith("zh-mo") or folded.startswith("yue"):
        return CANTONESE_TRADITIONAL_PRESENTATION_LANGUAGE

    if folded in {"zh-tw", "zh-hant"} or folded.startswith("zh-tw") or folded.startswith("zh-hant"):
        return CHINESE_TRADITIONAL_PRESENTATION_LANGUAGE

    if folded == ENGLISH_PRESENTATION_LANGUAGE.casefold() or folded.startswith("english ("):
        return ENGLISH_PRESENTATION_LANGUAGE

    if folded.startswith("chinese (simplified"):
        return CHINESE_SIMPLIFIED_PRESENTATION_LANGUAGE

    if folded.startswith("chinese (traditional"):
        return CHINESE_TRADITIONAL_PRESENTATION_LANGUAGE

    if folded.startswith("cantonese (traditional"):
        return CANTONESE_TRADITIONAL_PRESENTATION_LANGUAGE

    return value


def resolve_presentation_prompt_language(language: Optional[str]) -> str:
    normalized = normalize_presentation_language(language)
    if normalized in {None, AUTO_PRESENTATION_LANGUAGE}:
        return "auto-detect"
    return normalized
