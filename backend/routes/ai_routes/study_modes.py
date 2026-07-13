"""Shared mode suffix strings used by study_coach.py and study_stream.py."""

_STUDY_MODE_SUFFIXES: dict[str, str] = {
    "hint": (
        "\n\nThe student selected this text — provide a Socratic hint to guide their thinking, "
        "not a direct explanation."
    ),
    "explain": "\n\nExplain this concept in simple terms with an analogy.",
    "quiz": (
        "\n\nBased on the selected text, generate ONE multiple-choice question with 4 options (A/B/C/D) "
        "and mark the correct answer. Format: Question → Options → Answer → Brief explanation."
    ),
    "simplify": (
        "\n\nRewrite the selected text in very simple language, as if explaining to a 12-year-old. "
        "Use short sentences and plain vocabulary."
    ),
    "expand": (
        "\n\nExpand on the selected text with deeper context, related concepts, real-world examples, "
        "and connections to broader ideas in this field."
    ),
}


def get_study_mode_suffix(mode: str) -> str:
    """Return the system-prompt suffix for a given study mode."""
    return _STUDY_MODE_SUFFIXES.get(mode, "")
