from __future__ import annotations

import re
from typing import Optional


_NUMBER_WORDS: dict[str, int] = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "thirteen": 13,
    "fourteen": 14,
    "fifteen": 15,
    "sixteen": 16,
    "seventeen": 17,
    "eighteen": 18,
    "nineteen": 19,
    "twenty": 20,
    "twenty-one": 21,
    "twenty-two": 22,
    "twenty-three": 23,
    "twenty-four": 24,
    "twenty-five": 25,
    "twenty-six": 26,
    "twenty-seven": 27,
    "twenty-eight": 28,
    "twenty-nine": 29,
    "thirty": 30,
    "thirty-one": 31,
    "thirty-two": 32,
    "thirty-three": 33,
    "thirty-four": 34,
    "thirty-five": 35,
    "thirty-six": 36,
    "thirty-seven": 37,
    "thirty-eight": 38,
    "thirty-nine": 39,
    "forty": 40,
    "forty-one": 41,
    "forty-two": 42,
    "forty-three": 43,
    "forty-four": 44,
    "forty-five": 45,
    "forty-six": 46,
    "forty-seven": 47,
    "forty-eight": 48,
    "forty-nine": 49,
    "fifty": 50,
}

_NUMBER_SEPARATORS = r"(?:-|\s+)"


def _build_number_token_pattern() -> str:
    tokens: list[str] = []
    for token in _NUMBER_WORDS:
        escaped = re.escape(token).replace(r"\-", _NUMBER_SEPARATORS)
        tokens.append(escaped)
    return "|".join(sorted(tokens, key=len, reverse=True))


_NUMBER_TOKEN_PATTERN = _build_number_token_pattern()
_COUNT_PATTERN = rf"(?P<count>\d{{1,3}}|{_NUMBER_TOKEN_PATTERN})"
_JOINER_PATTERN = r"(?:\s*[-\u2010-\u2015]?\s*)"
_PRESENTATION_TERMS_PATTERN = r"(?:ppt|powerpoint|presentation|deck)"
_CHINESE_PRESENTATION_TERMS_PATTERN = (
    r"(?:PPT|ppt|\u6f14\u793a\u6587\u7a3f|\u5e7b\u706f\u7247|\u6295\u5f71\u7247)"
)
_CHINESE_PAGE_TERMS_PATTERN = r"(?:\u9875|\u9801|\u5f20|\u5f35)"

_EXPLICIT_SLIDE_COUNT_PATTERNS = [
    re.compile(
        rf"\b{_COUNT_PATTERN}{_JOINER_PATTERN}slides?\b",
        re.IGNORECASE,
    ),
    re.compile(
        rf"\b{_COUNT_PATTERN}{_JOINER_PATTERN}pages?{_JOINER_PATTERN}{_PRESENTATION_TERMS_PATTERN}\b",
        re.IGNORECASE,
    ),
    re.compile(
        rf"\b{_PRESENTATION_TERMS_PATTERN}\b(?:\s+(?:with|of|for))?{_JOINER_PATTERN}{_COUNT_PATTERN}{_JOINER_PATTERN}(?:slides?|pages?)\b",
        re.IGNORECASE,
    ),
    re.compile(
        rf"{_COUNT_PATTERN}\s*{_CHINESE_PAGE_TERMS_PATTERN}\s*(?:\u7684\s*)?{_CHINESE_PRESENTATION_TERMS_PATTERN}",
    ),
    re.compile(
        rf"{_CHINESE_PRESENTATION_TERMS_PATTERN}\s*(?:\u9700\u8981|\u505a\u6210|\u5236\u4f5c|\u751f\u6210|\u5236\u4f5c\u4e00\u4e2a|\u505a\u4e00\u4e2a)?\s*{_COUNT_PATTERN}\s*{_CHINESE_PAGE_TERMS_PATTERN}",
    ),
]


def _parse_number_token(token: str) -> Optional[int]:
    normalized = re.sub(_NUMBER_SEPARATORS, "-", (token or "").strip().lower())
    if not normalized:
        return None
    if normalized.isdigit():
        return int(normalized)
    return _NUMBER_WORDS.get(normalized)


def infer_requested_slide_count(
    content: Optional[str],
    *,
    maximum: int,
) -> Optional[int]:
    if not content:
        return None

    normalized_content = " ".join(str(content).split())
    if not normalized_content:
        return None

    for pattern in _EXPLICIT_SLIDE_COUNT_PATTERNS:
        match = pattern.search(normalized_content)
        if not match:
            continue

        count = _parse_number_token(match.group("count"))
        if count is None or count < 1 or count > maximum:
            continue
        return count

    return None
