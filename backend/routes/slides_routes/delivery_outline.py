from __future__ import annotations

import re
from typing import Any

from backend.schemas import PresentonAssistantMessageSchema


def strip_html(html_text: str) -> str:
    if not html_text:
        return ""
    clean = re.sub(r"<[^>]+>", " ", str(html_text))
    clean = re.sub(r"\s+", " ", clean)
    return clean.strip()


def extract_source_text_and_chapters(
    content: str,
    chapter_data: list[dict[str, Any]] | None,
) -> tuple[str, list[dict[str, str]]]:
    source_text = (content or "").strip()
    chapter_data_clean: list[dict[str, str]] = []
    if not source_text and chapter_data:
        chapter_data_clean = [
            {
                "sectionTitle": str(item.get("sectionTitle") or f"Chapter {idx + 1}"),
                "text": strip_html(str(item.get("text") or "")),
            }
            for idx, item in enumerate(chapter_data)
            if isinstance(item, dict)
        ]
        source_text = "\n\n".join(
            f"{chapter['sectionTitle']}\n{chapter['text']}"
            for chapter in chapter_data_clean
        ).strip()
    return source_text, chapter_data_clean


def coerce_outline_points(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    values = [str(item).strip() for item in value if str(item).strip()]
    deduped: list[str] = []
    for value_text in values:
        if value_text not in deduped:
            deduped.append(value_text)
    return deduped[:5]


def outline_to_markdown(item: dict[str, Any], slide_number: int) -> str:
    title = str(item.get("title") or f"Slide {slide_number}").strip()
    objective = str(item.get("objective") or "").strip()
    key_points = coerce_outline_points(item.get("key_points"))
    lines = [f"# {title}"]
    if objective:
        lines.extend(["", f"Objective: {objective}"])
    if key_points:
        lines.append("")
        lines.extend([f"- {point}" for point in key_points])
    return "\n".join(lines).strip()


def extract_outline_title(text: str, slide_number: int) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return f"Slide {slide_number}"
    candidate = re.sub(r"^[#*\-\d\.\)\s]+", "", lines[0]).strip()
    return candidate or f"Slide {slide_number}"


def normalize_outline_slide(item: dict[str, Any], slide_number: int) -> dict[str, Any]:
    if not isinstance(item, dict):
        item = {}

    explicit_title = str(item.get("title") or "").strip()
    explicit_objective = str(item.get("objective") or "").strip()
    explicit_key_points = coerce_outline_points(item.get("key_points"))
    raw_content = str(item.get("content") or "").strip()

    title = explicit_title or extract_outline_title(raw_content, slide_number)
    objective = explicit_objective
    key_points = explicit_key_points

    if raw_content:
        bullet_points: list[str] = []
        candidate_lines: list[str] = []
        for raw_line in raw_content.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            bullet_match = re.match(r"^(?:[-*+]\s+|\d+[\.\)]\s+)(.+)$", line)
            if bullet_match:
                bullet_points.append(bullet_match.group(1).strip())
                continue
            if line.lower().startswith("objective:"):
                objective = objective or line.split(":", 1)[1].strip()
                continue
            if line.startswith("#"):
                continue
            candidate_lines.append(line)

        if not objective and candidate_lines:
            objective = candidate_lines[0]
        if not key_points:
            key_points = bullet_points
        if not key_points:
            key_points = [
                segment.strip()
                for segment in re.split(r"[。.!！？?\n]+", raw_content)
                if len(segment.strip()) > 4
            ][:4]

    if not objective:
        objective = f"Explain: {title}"
    if not key_points:
        key_points = ["Core concept", "Why it matters", "Practical takeaway"]

    normalized = {
        "title": title,
        "objective": objective,
        "key_points": key_points[:5],
    }
    normalized["content"] = raw_content or outline_to_markdown(normalized, slide_number)
    return normalized


def normalize_outline_slides(
    items: list[dict[str, Any]] | None,
    fallback_total_pages: int,
) -> list[dict[str, Any]]:
    normalized = [
        normalize_outline_slide(item, idx + 1)
        for idx, item in enumerate(items or [])
        if isinstance(item, dict)
    ]
    if normalized:
        return normalized
    return [normalize_outline_slide({}, idx + 1) for idx in range(max(1, fallback_total_pages))]


def build_presenton_assistant_prompt(req: PresentonAssistantMessageSchema) -> str:
    title = (req.presentation_title or "").strip() or "Untitled Presentation"
    history_lines: list[str] = []
    for message in req.history[-8:]:
        if not isinstance(message, dict):
            continue
        role = str(message.get("role") or "user").strip() or "user"
        content = str(message.get("content") or "").strip()
        if content:
            history_lines.append(f"{role.title()}: {content}")

    slide_lines: list[str] = []
    for idx, slide in enumerate(req.slides[:20], start=1):
        if not isinstance(slide, dict):
            continue
        slide_title = str(slide.get("title") or f"Slide {idx}").strip()
        objective = str(slide.get("objective") or "").strip()
        bullets = slide.get("content") if isinstance(slide.get("content"), list) else slide.get("key_points")
        bullet_text = "; ".join(str(item).strip() for item in (bullets or []) if str(item).strip())
        parts = [f"{idx}. {slide_title}"]
        if objective:
            parts.append(f"Objective: {objective}")
        if bullet_text:
            parts.append(f"Bullets: {bullet_text}")
        slide_lines.append(" | ".join(parts))

    current_slide_index = req.current_slide_index if req.current_slide_index is not None else 0
    current_slide_title = str(req.current_slide_title or "").strip() or f"Slide {current_slide_index + 1}"
    current_slide_content = "; ".join(
        str(item).strip() for item in (req.current_slide_content or []) if str(item).strip()
    )
    conversation = "\n".join(history_lines) if history_lines else "No prior conversation."
    deck_context = "\n".join(slide_lines) if slide_lines else "No deck content available yet."

    return (
        "You are Presenton AI Assistant inside a presentation editing workspace. "
        "Help the user improve the deck, answer questions about structure and wording, "
        "and stay grounded in the current presentation. Be concise, practical, and specific.\n\n"
        f"Presentation title: {title}\n"
        f"Current slide: {current_slide_index + 1} - {current_slide_title}\n"
        f"Current slide bullets: {current_slide_content or 'No bullet content provided'}\n\n"
        f"Deck context:\n{deck_context}\n\n"
        f"Conversation so far:\n{conversation}\n\n"
        f"User request:\n{req.message.strip()}"
    )
