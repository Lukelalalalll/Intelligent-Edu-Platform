"""HTML-based slide renderer — converts Markdown + custom CSS into HTML and exports to PPTX.

Uses Playwright to screenshot individual slides (pixel-perfect rendering)
and python-pptx to package them into a downloadable PPTX file.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import uuid
from datetime import datetime
from io import BytesIO
from typing import Optional

from jinja2 import Environment, FileSystemLoader, select_autoescape
from PIL import Image

logger = logging.getLogger(__name__)

# ── Template paths ──
_TEMPLATE_DIR = os.path.join(
    os.path.dirname(__file__), "..", "..", "static", "slides_themes"
)
_SLIDE_TEMPLATE = "slide_template.html"

# ── Default slide dimensions (16:9 HD) ──
SLIDE_WIDTH = 1280
SLIDE_HEIGHT = 720


# ── Markdown to slides ──

def markdown_to_slides(md_content: str) -> list[dict]:
    """Split Markdown content into an array of slide dictionaries.

    Each slide is a dict with:
        - heading: str
        - body_html: str (HTML rendered from markdown)
        - raw: str

    Splitting rules:
        1. Split on ``===SECTION_BREAK===`` markers first (explicit breaks).
        2. Then split each section on ``# `` and ``## `` headings.
        3. Content before the first heading becomes a title slide.
        4. If content is very short (<1 paragraph) it stays on the title slide.
    """
    if not md_content or not md_content.strip():
        return [{"heading": "Untitled", "body_html": "", "raw": ""}]

    import markdown2

    # Step 1: Split on explicit SECTION_BREAK markers first
    raw_sections = re.split(r"\n?===SECTION_BREAK===", md_content.strip())

    slides: list[dict] = []
    _heading_pattern = re.compile(r"^(#{1,2})\s+(.+)$", re.MULTILINE)

    for raw_section in raw_sections:
        raw_section = raw_section.strip()
        if not raw_section:
            continue

        # Step 2: Further split on # or ## headings at the start of a line
        sub_sections = re.split(r"\n(?=#{1,2}\s)", raw_section)

        for section in sub_sections:
            section = section.strip()
            if not section:
                continue

            # Extract heading (first line starting with # or ##)
            heading = ""
            body = section
            heading_match = _heading_pattern.match(section)
            if heading_match:
                heading = heading_match.group(2).strip()
                # Remove the heading line from body
                body = re.sub(r"^#{1,2}\s+.+\n", "", section, count=1).strip()

            # Convert body markdown to HTML
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

    # If we have NO slides at all (edge case)
    if not slides:
        slides.append({"heading": "Untitled", "body_html": "<p>No content</p>", "raw": ""})

    # If the first slide has no heading, make it a title slide
    if slides and not slides[0]["heading"]:
        first_line = slides[0]["raw"].split("\n")[0] if slides[0]["raw"] else ""
        slides[0]["heading"] = first_line[:100] or "Presentation Title"
        slides[0]["body_html"] = f'<div class="title-slide-content">{slides[0]["body_html"]}</div>'

    return slides


# ── HTML rendering via Jinja2 ──

def _build_jinja_env() -> Environment:
    """Create a Jinja2 environment pointing to the slides_themes templates directory."""
    return Environment(
        loader=FileSystemLoader(_TEMPLATE_DIR),
        autoescape=select_autoescape(["html", "xml"]),
    )


def render_html(
    slides: list[dict],
    css_content: str,
    title: str = "Presentation",
) -> str:
    """Render a list of slide dicts into a complete HTML document.

    Args:
        slides: List of slide dicts from ``markdown_to_slides()``.
        css_content: Complete CSS string (including :root variables).
        title: HTML page title.

    Returns:
        Complete HTML string ready for browser rendering.
    """
    env = _build_jinja_env()
    template = env.get_template(_SLIDE_TEMPLATE)

    # Build slide content with headings
    enriched_slides = []
    for i, slide in enumerate(slides):
        content_parts = []
        if slide["heading"]:
            # First slide gets cover treatment
            tag = "h1" if i == 0 else "h2"
            content_parts.append(f'<{tag} class="slide-heading">{slide["heading"]}</{tag}>')
        content_parts.append(slide["body_html"])
        enriched_slides.append(
            {
                "content_html": "\n".join(content_parts),
                "heading": slide["heading"],
            }
        )

    html = template.render(
        css_content=css_content,
        slides=enriched_slides,
        title=title,
    )

    return html


# ── Playwright screenshotting ──

async def _screenshot_slides(html: str, slide_count: int) -> list[bytes]:
    """Render each slide individually and capture PNG screenshots.

    Returns a list of PNG image bytes (one per slide).
    """
    from playwright.async_api import async_playwright

    screenshots: list[bytes] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            args=[
                "--disable-gpu",
                "--disable-dev-shm-usage",
                "--no-sandbox",
                "--disable-setuid-sandbox",
            ]
        )
        try:
            page = await browser.new_page(
                viewport={"width": SLIDE_WIDTH, "height": SLIDE_HEIGHT}
            )

            # Set content once with a reasonable timeout, not networkidle
            # (networkidle hangs on Google Fonts imports)
            await page.set_content(html, wait_until="load", timeout=30000)
            await asyncio.sleep(0.5)

            for slide_index in range(slide_count):
                # Show only the current slide, hide nav UI
                await page.evaluate(
                    f"""
                    () => {{
                        document.querySelectorAll('.viewport .slide').forEach((s, i) => {{
                            if (i === {slide_index}) {{
                                s.style.display = 'flex';
                                s.scrollIntoView({{ behavior: 'instant', block: 'start' }});
                            }} else {{
                                s.style.display = 'none';
                            }}
                        }});
                        // Hide navigation bar during screenshot
                        var nav = document.querySelector('.slide-nav');
                        if (nav) nav.style.display = 'none';
                    }}
                    """
                )

                await asyncio.sleep(0.4)

                screenshot = await page.screenshot(type="png", full_page=False)
                screenshots.append(screenshot)

            return screenshots
        finally:
            await browser.close()


# ── PPTX packaging ──

def _images_to_pptx(images: list[bytes], output_path: str) -> str:
    """Create a PPTX file where each slide is a full-screen image.

    Args:
        images: List of PNG image byte arrays.
        output_path: Where to save the PPTX file.

    Returns:
        The *output_path* (for chaining).
    """
    from pptx import Presentation
    from pptx.util import Inches

    prs = Presentation()
    # Set 16:9 slide size
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    # Use blank layout
    blank_layout = prs.slide_layouts[6]  # Usually 'Blank'

    for img_bytes in images:
        slide = prs.slides.add_slide(blank_layout)
        img_stream = BytesIO(img_bytes)
        # Add picture filling the entire slide
        slide.shapes.add_picture(
            img_stream,
            left=0,
            top=0,
            width=prs.slide_width,
            height=prs.slide_height,
        )
        img_stream.close()

    prs.save(output_path)
    logger.info("PPTX saved to %s with %d slides", output_path, len(images))
    return output_path


async def _save_single_slide_screenshots(html: str, slide_count: int) -> list[bytes]:
    """The real implementation — use Playwright to screenshot individual slides.

    Falls back gracefully if Playwright is not installed.
    """
    try:
        return await _screenshot_slides(html, slide_count)
    except Exception as exc:
        logger.error("Playwright screenshot failed: %s", exc)
        raise RuntimeError(f"Playwright rendering failed: {exc}") from exc


# ── Service class wrapper ──

class SlidesHtmlRenderer:
    """Service that renders Markdown + CSS into HTML slides and exports them as PPTX.

    Usage::

        renderer = SlidesHtmlRenderer()
        result = await renderer.render_and_export(md_content, css_content, output_dir, title="My Deck")
    """

    async def render_and_export(
        self,
        md_content: str,
        css_content: str,
        output_dir: str,
        title: str = "Presentation",
    ) -> dict:
        """Full pipeline: Markdown → HTML → Screenshots → PPTX.

        Args:
            md_content: Raw Markdown content for the presentation.
            css_content: Complete CSS (variables + rules) for styling.
            output_dir: Directory where output files will be written.
            title: Presentation title (used as filename prefix).

        Returns:
            dict with keys:
                - pptx_filename: str (just the filename, not full path)
                - pptx_download_url: str (relative URL for download)
                - html_preview_url: str (relative URL for preview)
                - pptx_path: str (full path)
                - html_path: str (full path to preview HTML)
                - page_count: int
        """
        return await render_and_export(md_content, css_content, output_dir, title)


# ── Main render-and-export entry point (module-level) ──

async def render_and_export(
    md_content: str,
    css_content: str,
    output_dir: str,
    title: str = "Presentation",
) -> dict:
    """Full pipeline: Markdown → HTML → Screenshots → PPTX.

    Args:
        md_content: Raw Markdown content for the presentation.
        css_content: Complete CSS (variables + rules) for styling.
        output_dir: Directory where output files will be written.
        title: Presentation title (used as filename prefix).

    Returns:
        dict with keys:
            - pptx_filename: str (just the filename, not full path)
            - pptx_path: str (full path)
            - html_path: str (full path to preview HTML)
            - page_count: int
    """
    os.makedirs(output_dir, exist_ok=True)

    # 1. Parse markdown into slides
    slides = markdown_to_slides(md_content)
    logger.info("Parsed %d slides from markdown", len(slides))

    # 2. Render full HTML
    html = render_html(slides=slides, css_content=css_content, title=title)

    # 3. Save HTML preview
    safe_title = re.sub(r"[^a-zA-Z0-9_\-\u4e00-\u9fff]+", "_", title).strip("_")[:50]
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    html_filename = f"{safe_title}_{timestamp}.html"
    html_path = os.path.join(output_dir, html_filename)
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html)
    logger.info("HTML preview saved to %s", html_path)

    # 4. Screenshot each slide via Playwright
    try:
        screenshots = await _save_single_slide_screenshots(html, len(slides))
    except RuntimeError:
        # Playwright not available — return HTML only with a note
        logger.warning("Playwright not available — returning HTML-only output")
        return {
            "pptx_filename": None,
            "pptx_download_url": None,
            "html_preview_url": None,
            "pptx_path": None,
            "html_path": html_path,
            "page_count": len(slides),
            "error": "Playwright not available — PPTX generation skipped. HTML preview is available.",
        }

    # 5. Package screenshots into PPTX
    pptx_filename = f"{safe_title}_{timestamp}.pptx"
    pptx_path = os.path.join(output_dir, pptx_filename)
    _images_to_pptx(screenshots, pptx_path)

    # Build download URLs
    pptx_download_url = f"/api/slides/download_ppt/{pptx_filename}"
    html_preview_url = f"/api/slides/download_html/{html_filename}"

    return {
        "pptx_filename": pptx_filename,
        "pptx_download_url": pptx_download_url,
        "html_preview_url": html_preview_url,
        "pptx_path": pptx_path,
        "html_path": html_path,
        "page_count": len(slides),
    }
