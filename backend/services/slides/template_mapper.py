"""
Template Mapper — Decoupled module that maps structured summaries to PPT template fields.

Input: Standardized summary structure from the summarizer:
{
    "title": "Slide Title",
    "key_points": ["Point 1", "Point 2", ...],
    "evidence": ["Formula/citation/data", ...],
    "slide_hint": "content_heavy | chart_focused | formula_heavy | title_only",
    "latex": ["E=mc^2", ...],
    "chart_type": "Flowchart",
    "chart_reasoning": ["..."]
}

Output: PPT-ready slide data matching template placeholders:
{
    "title": "...",
    "content": ["..."],       # Mapped to placeholder type 2
    "latex": ["..."],
    "chart_type": "...",
    "chart_reasoning": ["..."],
    "layout": {"name": "..."},   # Recommended layout
    "slide_number": N
}

This separation means:
- Template changes don't affect summarization quality
- Template mapping failures can be retried independently
- Multiple templates can be applied to the same summary
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

# Layout recommendation based on slide_hint
LAYOUT_HINTS = {
    "content_heavy": "Title and Content",
    "chart_focused": "Title, Content, and Image",
    "formula_heavy": "Title and Content",
    "title_only": "Section Header",
    "two_column": "Two Content",
}

DEFAULT_LAYOUT = "Title and Content"


def map_summary_to_slide(
    summary: dict[str, Any],
    slide_number: int,
    available_layouts: list[str] | None = None,
) -> dict[str, Any]:
    """
    Map a single structured summary to a PPT-ready slide dict.

    Args:
        summary: standardized summary from summarizer
        slide_number: 1-based slide number
        available_layouts: list of layout names available in the template

    Returns:
        PPT-ready slide dict
    """
    title = summary.get("title", f"Slide {slide_number}")
    key_points = summary.get("key_points") or summary.get("content", [])
    evidence = summary.get("evidence", [])
    slide_hint = summary.get("slide_hint", "content_heavy")
    latex = summary.get("latex", [])
    chart_type = summary.get("chart_type", "No Chart")
    chart_reasoning = summary.get("chart_reasoning", [])

    # Determine layout
    recommended = LAYOUT_HINTS.get(slide_hint, DEFAULT_LAYOUT)
    if available_layouts and recommended not in available_layouts:
        # Fallback to first available
        recommended = available_layouts[0] if available_layouts else DEFAULT_LAYOUT

    # Build content from key_points + evidence
    content = list(key_points)
    if evidence and slide_hint != "chart_focused":
        # Append evidence as additional bullets if there's room
        for ev in evidence[:2]:  # max 2 evidence items
            if ev not in content:
                content.append(ev)

    return {
        "title": title,
        "content": content,
        "latex": latex,
        "chart_type": chart_type,
        "chart_reasoning": chart_reasoning,
        "layout": {"name": recommended},
        "slide_number": slide_number,
        "_status": summary.get("_status", "success"),
    }


def map_summaries_to_slides(
    summaries: list[dict[str, Any]],
    available_layouts: list[str] | None = None,
    start_number: int = 1,
) -> list[dict[str, Any]]:
    """
    Map a list of structured summaries to PPT-ready slide dicts.

    Args:
        summaries: list of standardized summaries
        available_layouts: list of layout names in the template
        start_number: first slide number

    Returns:
        List of PPT-ready slide dicts
    """
    slides = []
    for i, summary in enumerate(summaries):
        slide = map_summary_to_slide(
            summary,
            slide_number=start_number + i,
            available_layouts=available_layouts,
        )
        slides.append(slide)

    logger.info("Mapped %d summaries to slides (layouts: %s)",
                len(slides), [s["layout"]["name"] for s in slides[:3]])
    return slides


def validate_slide_data(slide: dict[str, Any]) -> list[str]:
    """
    Validate a slide dict for common issues.
    Returns list of warning messages (empty = valid).
    """
    warnings = []
    if not slide.get("title"):
        warnings.append("Missing title")
    content = slide.get("content", [])
    if not content:
        warnings.append("No content bullets")
    elif len(content) > 6:
        warnings.append(f"Too many bullets ({len(content)}), consider splitting")
    for i, bullet in enumerate(content):
        words = len(bullet.split())
        if words > 35:
            warnings.append(f"Bullet {i+1} too long ({words} words)")
    if slide.get("chart_type") and slide["chart_type"] != "No Chart":
        if not slide.get("chart_reasoning"):
            warnings.append(f"Chart type '{slide['chart_type']}' specified but no chart_reasoning")
    return warnings


def validate_presentation(slides: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Validate all slides and return a quality report.
    """
    issues = []
    for slide in slides:
        warnings = validate_slide_data(slide)
        if warnings:
            issues.append({
                "slide_number": slide.get("slide_number"),
                "title": slide.get("title", "Unknown"),
                "warnings": warnings,
            })

    return {
        "total_slides": len(slides),
        "slides_with_issues": len(issues),
        "issues": issues,
        "quality_score": round((1 - len(issues) / max(len(slides), 1)) * 100, 1),
    }
