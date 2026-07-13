from __future__ import annotations

AUDIENCE_HINTS: dict[str, dict[str, str]] = {
    "student": {
        "zh": "面向本科生，口语化，概念解释清楚，举例说明。",
        "en": "Target audience: undergraduates. Use plain language, explain concepts clearly, give examples.",
    },
    "teacher": {
        "zh": "面向教师同行，可使用专业术语，深度分析，引用文献。",
        "en": "Target audience: fellow educators. Use professional terminology, deep analysis, cite references.",
    },
    "researcher": {
        "zh": "面向研究者，聚焦方法论，引用相关研究，严谨表述。",
        "en": "Target audience: researchers. Focus on methodology, cite related work, be rigorous.",
    },
    "general": {
        "zh": "面向大众，通俗易懂，避免专业术语，生动有趣。",
        "en": "Target audience: general public. Keep it accessible, avoid jargon, be engaging.",
    },
}


def resolve_audience_hint(audience: str, lang: str) -> str:
    profile = AUDIENCE_HINTS.get(audience, AUDIENCE_HINTS["student"])
    return profile["zh"] if lang == "zh" else profile["en"]
