from __future__ import annotations

import os
import re
from datetime import datetime


def build_theme_draft_preview_impl(
    *,
    slides: list[dict],
    css_content: str,
    title: str,
    selected_slide_id: str | None,
    selected_index: int | None,
    theme_draft_to_render_slides_fn,
    render_html_fn,
) -> dict:
    renderable_slides = theme_draft_to_render_slides_fn(slides)
    if not renderable_slides:
        renderable_slides = [
            {
                "id": "slide-1",
                "heading": "Presentation Title",
                "body": "",
                "bullets": [],
                "accent_text": "",
                "layout": "cover",
                "align": "left",
            }
        ]

    selected_zero_index = 0
    if selected_slide_id:
        for index, slide in enumerate(renderable_slides):
            if slide.get("id") == selected_slide_id:
                selected_zero_index = index
                break
    elif selected_index is not None:
        selected_zero_index = max(0, min(int(selected_index), len(renderable_slides) - 1))

    html = render_html_fn(slides=renderable_slides, css_content=css_content, title=title)
    return {
        "html": html,
        "selected_index": selected_zero_index,
        "selected_slide_id": renderable_slides[selected_zero_index].get("id") or "",
        "page_count": len(renderable_slides),
    }


def build_output_paths(output_dir: str, title: str) -> dict[str, str]:
    safe_title = re.sub(r"[^a-zA-Z0-9_\-\u4e00-\u9fff]+", "_", title).strip("_")[:50] or "Presentation"
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    html_filename = f"{safe_title}_{timestamp}.html"
    pptx_filename = f"{safe_title}_{timestamp}.pptx"
    html_path = os.path.join(output_dir, html_filename)
    pptx_path = os.path.join(output_dir, pptx_filename)
    return {
        "html_filename": html_filename,
        "pptx_filename": pptx_filename,
        "html_path": html_path,
        "pptx_path": pptx_path,
        "html_preview_url": f"/api/slides/download_html/{html_filename}",
        "pptx_download_url": f"/api/slides/download_ppt/{pptx_filename}",
    }


def markdown_to_slides(md_content: str) -> list[dict]:
    if not md_content or not md_content.strip():
        return [{"heading": "Untitled", "body_html": "", "raw": ""}]

    import markdown2

    raw_sections = re.split(r"\n?===SECTION_BREAK===", md_content.strip())
    slides: list[dict] = []
    heading_pattern = re.compile(r"^(#{1,2})\s+(.+)$", re.MULTILINE)

    for raw_section in raw_sections:
        raw_section = raw_section.strip()
        if not raw_section:
            continue

        sub_sections = re.split(r"\n(?=#{1,2}\s)", raw_section)
        for section in sub_sections:
            section = section.strip()
            if not section:
                continue

            heading = ""
            body = section
            heading_match = heading_pattern.match(section)
            if heading_match:
                heading = heading_match.group(2).strip()
                body = re.sub(r"^#{1,2}\s+.+\n", "", section, count=1).strip()

            body_html = markdown2.markdown(
                body,
                extras=[
                    "fenced-code-blocks",
                    "tables",
                    "break-on-newline",
                    "header-ids",
                    "cuddled-lists",
                ],
            )
            slides.append(
                {
                    "heading": heading,
                    "body_html": body_html,
                    "raw": body,
                }
            )

    if not slides:
        slides.append({"heading": "Untitled", "body_html": "<p>No content</p>", "raw": ""})

    if slides and not slides[0]["heading"]:
        first_line = slides[0]["raw"].split("\n")[0] if slides[0]["raw"] else ""
        slides[0]["heading"] = first_line[:100] or "Presentation Title"
        slides[0]["body_html"] = f'<div class="title-slide-content">{slides[0]["body_html"]}</div>'

    return slides


def split_body_blocks(raw_body: str) -> tuple[str, list[str]]:
    lines = [line.strip() for line in (raw_body or "").splitlines()]
    bullets: list[str] = []
    paragraphs: list[str] = []
    for line in lines:
        if not line:
            continue
        if re.match(r"^[-*+]\s+", line):
            bullets.append(re.sub(r"^[-*+]\s+", "", line).strip())
            continue
        if re.match(r"^\d+\.\s+", line):
            bullets.append(re.sub(r"^\d+\.\s+", "", line).strip())
            continue
        paragraphs.append(line)
    body = "\n".join(paragraphs).strip()
    return body, bullets


def slides_to_theme_draft(slides: list[dict]) -> list[dict]:
    draft_slides: list[dict] = []
    total = len(slides)
    for index, slide in enumerate(slides):
        body, bullets = split_body_blocks(slide.get("raw", ""))
        heading = str(slide.get("heading") or "").strip()
        if index == 0:
            layout = "cover"
            align = "left"
        elif len(bullets) >= 4:
            layout = "split"
            align = "left"
        elif len(body) < 120 and not bullets:
            layout = "quote"
            align = "center"
        else:
            layout = "content"
            align = "left"
        accent_text = ""
        if index == 0 and total > 1:
            accent_text = f"{total} slides"
        elif bullets:
            accent_text = bullets[0]
        draft_slides.append(
            {
                "id": f"slide-{index + 1}",
                "heading": heading or (f"Slide {index + 1}" if index else "Presentation Title"),
                "body": body,
                "bullets": bullets[:6],
                "accent_text": accent_text,
                "layout": layout,
                "align": align,
            }
        )
    return draft_slides


def theme_draft_to_render_slides(slides: list[dict]) -> list[dict]:
    renderable: list[dict] = []
    for slide in slides:
        heading = str(slide.get("heading") or "").strip()
        body = str(slide.get("body") or "").strip()
        bullets = [str(item).strip() for item in (slide.get("bullets") or []) if str(item).strip()]
        accent_text = str(slide.get("accent_text") or "").strip()
        layout = str(slide.get("layout") or "content").strip().lower()
        align = str(slide.get("align") or "left").strip().lower()
        renderable.append(
            {
                "id": str(slide.get("id") or ""),
                "heading": heading,
                "body": body,
                "bullets": bullets,
                "accent_text": accent_text,
                "layout": layout if layout in {"cover", "content", "split", "quote"} else "content",
                "align": align if align in {"left", "center"} else "left",
            }
        )
    return renderable
