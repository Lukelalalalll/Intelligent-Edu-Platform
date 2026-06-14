"""HTML-based slide rendering via Playwright."""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import textwrap
import time
from pathlib import Path
from typing import Optional

from .subtitle_renderer import _img_to_data_uri
from ..types import logger

def _build_animation_css(level: str) -> str:
    """Return raw CSS for the given animation level (injected into _HTML_TEMPLATE)."""
    if level == "off":
        return ""
    if level == "basic":
        # Visual polish visible in static screenshots
        return """
/* Phase 2.1 basic — visual polish */
h1 { text-shadow: 0 2px 18px rgba(0,0,0,0.45); }
.bullets li { text-shadow: 0 1px 6px rgba(0,0,0,0.35); }
.accent-bar { filter: drop-shadow(0 0 10px currentColor); }
.col-title { text-shadow: 0 2px 12px rgba(0,0,0,0.4); }
.quote-text { text-shadow: 0 2px 18px rgba(0,0,0,0.45); }
"""
    # high — CSS keyframe animations (rendered as video via Playwright recording)
    return """
/* Phase 2.1 high — CSS entrance animations */
@keyframes fadeInUp {
  from { transform: translateY(22px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
@keyframes scaleInX {
  from { transform: scaleX(0); }
  to   { transform: scaleX(1); }
}
h1 {
  animation: fadeInUp 0.55s ease-out both;
  text-shadow: 0 2px 18px rgba(0,0,0,0.45);
}
.accent-bar { animation: fadeInUp 0.3s ease-out both; }
.divider { transform-origin: left; animation: scaleInX 0.4s ease-out 0.45s both; }
.bullets li:nth-child(1) { animation: fadeInUp 0.4s ease-out 0.60s both; }
.bullets li:nth-child(2) { animation: fadeInUp 0.4s ease-out 0.72s both; }
.bullets li:nth-child(3) { animation: fadeInUp 0.4s ease-out 0.84s both; }
.bullets li:nth-child(4) { animation: fadeInUp 0.4s ease-out 0.96s both; }
.bullets li:nth-child(5) { animation: fadeInUp 0.4s ease-out 1.08s both; }
.bullets li:nth-child(6) { animation: fadeInUp 0.4s ease-out 1.20s both; }
.bullets li:nth-child(7) { animation: fadeInUp 0.4s ease-out 1.32s both; }
.col-title { animation: fadeInUp 0.4s ease-out 0.60s both; }
.quote-text { animation: fadeInUp 0.55s ease-out 0.30s both; }
"""


def _build_html_for_scene(
    scene: dict, idx: int, subtitles: bool = True, animation_level: str = "off",
) -> str:
    """Build the complete HTML string for a single scene slide."""
    theme_id = scene.get("themeId", "dark-ocean")
    theme = THEMES.get(theme_id, THEMES["dark-ocean"])
    layout = scene.get("layoutType", "title-bullets")
    title = scene.get("slideTitle", "")[:60] or f"Slide {idx + 1}"
    body = scene.get("slideBody", "")
    script_text = scene.get("script", "")

    # Parse bullets
    bullets = []
    try:
        parsed = json.loads(body)
        if isinstance(parsed, dict) and "bullets" in parsed:
            bullets = [str(b) for b in parsed["bullets"][:7]]
        elif isinstance(parsed, list):
            bullets = [str(b) for b in parsed[:7]]
    except (json.JSONDecodeError, TypeError):
        pass
    if not bullets:
        bullets = [l.strip() for l in body.split("\n") if l.strip()][:7]

    bullets_html = "".join(f"<li>{b}</li>" for b in bullets)

    # Background image
    bg_img_html = ""
    slide_mode = scene.get("slideMode", "theme")
    if slide_mode == "image" and scene.get("customImagePath"):
        data_uri = _img_to_data_uri(scene["customImagePath"])
        if data_uri:
            bg_img_html = f'<div class="bg-img"><img src="{data_uri}"/></div>'

    # Layout embedded image (image-left / image-right / image-top)
    layout_img = scene.get("layoutImagePath", "")
    if layout_img:
        layout_data_uri = _img_to_data_uri(layout_img)
        img_tag = f'<img src="{layout_data_uri}"/>' if layout_data_uri else '<div style="font-size:64px;opacity:.2">📷</div>'
    else:
        img_tag = '<div style="font-size:64px;opacity:.2">📷</div>'

    # Build inner HTML based on layout type
    if layout == "title-bullets":
        inner = (
            f'<div class="layout-title-bullets">'
            f'<div class="accent-bar"></div>'
            f'<h1>{title}</h1><div class="divider"></div>'
            f'<ul class="bullets">{bullets_html}</ul></div>'
        )
    elif layout == "image-left":
        inner = (
            f'<div class="layout-image-lr">'
            f'<div class="img-panel">{img_tag}</div>'
            f'<div class="text-panel"><h1>{title}</h1><div class="divider"></div>'
            f'<ul class="bullets">{bullets_html}</ul></div></div>'
        )
    elif layout == "image-right":
        inner = (
            f'<div class="layout-image-lr">'
            f'<div class="text-panel"><h1>{title}</h1><div class="divider"></div>'
            f'<ul class="bullets">{bullets_html}</ul></div>'
            f'<div class="img-panel">{img_tag}</div></div>'
        )
    elif layout == "image-top":
        inner = (
            f'<div class="layout-image-top">'
            f'<div class="img-panel">{img_tag}</div>'
            f'<div class="text-panel"><h1>{title}</h1><div class="divider"></div>'
            f'<ul class="bullets">{bullets_html}</ul></div></div>'
        )
    elif layout == "big-quote":
        quote = scene.get("quoteText", title)[:100]
        inner = (
            f'<div class="layout-big-quote">'
            f'<div class="quote-mark">❝</div>'
            f'<div class="quote-text">{quote}</div>'
            f'<div class="quote-attr">── {title} ──</div></div>'
        )
    elif layout == "two-column":
        c1t = scene.get("col1Title", "左栏")[:40]
        c1b = scene.get("col1Bullets", [])
        c2t = scene.get("col2Title", "右栏")[:40]
        c2b = scene.get("col2Bullets", [])
        c1_html = "".join(f"<li>{b}</li>" for b in (c1b[:5] if c1b else bullets[:3]))
        c2_html = "".join(f"<li>{b}</li>" for b in (c2b[:5] if c2b else bullets[3:6]))
        inner = (
            f'<div class="layout-two-column">'
            f'<h1>{title}</h1><div class="divider"></div>'
            f'<div class="cols">'
            f'<div class="col"><div class="col-title">{c1t}</div><ul>{c1_html}</ul></div>'
            f'<div class="col-divider"></div>'
            f'<div class="col"><div class="col-title">{c2t}</div><ul>{c2_html}</ul></div>'
            f'</div></div>'
        )
    elif layout == "bar-chart":
        # chartData: [{label, value}] or [{label, value, maxValue}]
        chart_data = scene.get("chartData", [])
        if not chart_data and bullets:
            # auto-generate from bullets: treat each as a label with sequential values
            chart_data = [{"label": b, "value": (len(bullets) - i) * 10} for i, b in enumerate(bullets[:6])]
        # Normalise to 0-100 range
        raw_vals = [float(d.get("value", 0)) for d in chart_data[:7]]
        max_val = max(raw_vals) if raw_vals else 1
        bars_html = "".join(
            f'<div class="bar-row">'
            f'<div class="bar-label">{chart_data[i].get("label", "")[:24]}</div>'
            f'<div class="bar-track">'
            f'<div class="bar-fill" style="width:{min(100, v / max_val * 100):.1f}%"></div>'
            f'<div class="bar-value">{v:.0f}</div>'
            f'</div></div>'
            for i, v in enumerate(raw_vals)
        )
        inner = (
            f'<div class="layout-bar-chart">'
            f'<h1>{title}</h1><div class="divider"></div>'
            f'<div class="chart-area">{bars_html}</div></div>'
        )
    elif layout == "flowchart":
        # flowSteps: [str] or use bullets
        steps = scene.get("flowSteps", bullets[:6]) or bullets[:6]
        nodes_html = ""
        for i, step in enumerate(steps[:6]):
            arrow = '<div class="flow-arrow">→</div>' if i < len(steps) - 1 else ""
            nodes_html += (
                f'<div class="flow-node">'
                f'<div class="flow-node-index">0{i+1}</div>'
                f'<div class="flow-node-text">{str(step)[:40]}</div>'
                f'</div>{arrow}'
            )
        inner = (
            f'<div class="layout-flowchart">'
            f'<h1>{title}</h1><div class="divider"></div>'
            f'<div class="flow-area">{nodes_html}</div></div>'
        )
    elif layout == "code":
        # codeSnippet: str, codeLanguage: str
        import html as _html
        code_text = scene.get("codeSnippet", body)[:1200]
        code_lang = scene.get("codeLanguage", "")[:20] or "code"
        escaped = _html.escape(code_text)
        inner = (
            f'<div class="layout-code">'
            f'<h1>{title}</h1><div class="divider"></div>'
            f'<div class="code-block">'
            f'<div class="lang-badge">{code_lang}</div>'
            f'<pre>{escaped}</pre>'
            f'</div></div>'
        )
    else:
        inner = f'<div class="layout-title-bullets"><h1>{title}</h1><ul class="bullets">{bullets_html}</ul></div>'

    subtitle_html = ""
    if subtitles and script_text:
        subtitle_html = f'<div class="subtitle-strip">{script_text[:150]}</div>'

    return _HTML_TEMPLATE.format(
        bg=theme["bg"], title=theme["title"], body=theme["body"], accent=theme["accent"],
        bg_img_html=bg_img_html, inner_html=inner, page_num=idx + 1,
        subtitle_html=subtitle_html,
        animation_css=_build_animation_css(animation_level),
    )


# ── Playwright render entry ──

import os as _os

# URL of the React frontend renderer page (served by vite dev or vite preview)
_FRONTEND_RENDER_URL = _os.environ.get(
    "SLIDE_RENDERER_URL",
    "http://127.0.0.1:5173/slide-renderer",
)
# Production: set env SLIDE_RENDERER_URL=http://edge-nginx:8080/slide-renderer

# ── Singleton browser instance to avoid cold-start on every generation ──
_pw_singleton_browser = None
_pw_singleton_context_mgr = None

_PLAYWRIGHT_AVAILABLE: Optional[bool] = None


def _check_playwright() -> bool:
    global _PLAYWRIGHT_AVAILABLE
    if _PLAYWRIGHT_AVAILABLE is not None:
        return _PLAYWRIGHT_AVAILABLE
    try:
        from playwright.sync_api import sync_playwright
        # Quick check that chromium is installed
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            browser.close()
        _PLAYWRIGHT_AVAILABLE = True
    except Exception:
        _PLAYWRIGHT_AVAILABLE = False
        logger.info("Playwright not available, will use Pillow fallback for rendering")
    return _PLAYWRIGHT_AVAILABLE


def _get_browser():
    """Return a reusable Chromium browser instance (singleton pattern).

    Avoids the ~1-2s chromium.launch() overhead on each generation.
    If the browser crashes, a new one is started automatically.
    """
    global _pw_singleton_browser, _pw_singleton_context_mgr
    from playwright.sync_api import sync_playwright

    if _pw_singleton_browser is not None:
        try:
            # Probe liveness — raises if browser process died
            _pw_singleton_browser.contexts  # noqa: B018
            return _pw_singleton_browser
        except Exception:
            _pw_singleton_browser = None
            try:
                _pw_singleton_context_mgr.__exit__(None, None, None)
            except Exception:
                pass
            _pw_singleton_context_mgr = None

    _pw_singleton_context_mgr = sync_playwright()
    pw = _pw_singleton_context_mgr.__enter__()
    _pw_singleton_browser = pw.chromium.launch(
        headless=True,
        args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    )
    logger.info("Playwright Chromium launched (singleton) targeting %s", _FRONTEND_RENDER_URL)
    return _pw_singleton_browser


def _render_html_playwright(
    scenes: list[dict], work_dir: Path, subtitles: bool,
    animation_level: str = "off",
) -> list[Path]:
    """Render all scenes by navigating to the React headless renderer (/slide-renderer).

    This is the V3 implementation. It delegates ALL visual rendering to React/CSS,
    eliminating the _HTML_TEMPLATE Python string entirely.

    Falls back to Pillow automatically if the frontend is unreachable.
    """
    import json as _json

    paths: list[Path] = []

    try:
        browser = _get_browser()
        ctx_kwargs: dict = {"viewport": {"width": 1920, "height": 1080}}
        context = browser.new_context(**ctx_kwargs)
        page = context.new_page()

        # Navigate to the renderer page once — reuse for all scenes
        try:
            page.goto(_FRONTEND_RENDER_URL, wait_until="networkidle", timeout=12000)
            logger.info("Connected to React renderer at %s", _FRONTEND_RENDER_URL)
        except Exception as nav_err:
            logger.warning(
                "Cannot reach React renderer at %s: %s — falling back to Pillow. "
                "Start the frontend (npm run dev) or set SLIDE_RENDERER_URL.",
                _FRONTEND_RENDER_URL, nav_err,
            )
            context.close()
            return render_scene_slides(scenes, work_dir, subtitles)

        for i, scene in enumerate(scenes):
            # Build the SlidePayload that matches the frontend SlidePayload interface
            payload = {
                "scene": {
                    "id": scene.get("id", f"scene_{i}"),
                    "layoutType": scene.get("layoutType", "title-bullets"),
                    "themeId": scene.get("themeId", "dark-ocean"),
                    "slideMode": scene.get("slideMode", "theme"),
                    "slideTitle": scene.get("slideTitle", ""),
                    "slideBody": scene.get("slideBody", ""),
                    "script": scene.get("script", ""),
                    "toneMode": scene.get("toneMode", "lecture"),
                    # Layout-specific pre-parsed fields (from Phase 1)
                    "quoteText": scene.get("quoteText"),
                    "col1Title": scene.get("col1Title"),
                    "col1Bullets": scene.get("col1Bullets") or [],
                    "col2Title": scene.get("col2Title"),
                    "col2Bullets": scene.get("col2Bullets") or [],
                    "chartData": scene.get("chartData") or [],
                    "flowSteps": scene.get("flowSteps") or [],
                    "codeSnippet": scene.get("codeSnippet"),
                    "codeLanguage": scene.get("codeLanguage"),
                    # Convert file:// image paths to base64 data URIs
                    # (browser cannot access local file:// from http:// context)
                    "_imagePreviewUrl": (
                        _img_to_data_uri(scene["customImagePath"])
                        if scene.get("customImagePath") else None
                    ),
                    "_layoutImagePreviewUrl": (
                        _img_to_data_uri(scene["layoutImagePath"])
                        if scene.get("layoutImagePath") else None
                    ),
                },
                "idx": i,
                "renderSubtitles": subtitles,
            }

            payload_json = _json.dumps(payload, ensure_ascii=False)

            # Clear ready flag from previous iteration
            page.evaluate("window.clearRenderReady && window.clearRenderReady()")

            # Inject scene data into the React page
            page.evaluate(f"window.setSlideData({payload_json})")

            # Wait for React to commit and paint (signaled by body[data-render-ready])
            try:
                page.wait_for_selector('body[data-render-ready="true"]', timeout=5000)
            except Exception:
                logger.warning("Slide %d/%d: render ready timeout — taking screenshot anyway", i + 1, len(scenes))

            out = work_dir / f"slide_{i:03d}.png"
            page.screenshot(
                path=str(out),
                clip={"x": 0, "y": 0, "width": 1920, "height": 1080},
            )
            paths.append(out)
            logger.debug("Captured slide %d/%d -> %s", i + 1, len(scenes), out.name)

        page.close()
        context.close()
        logger.info("React renderer: %d slides captured successfully", len(paths))
        return paths

    except Exception as exc:
        logger.error(
            "React renderer failed (%s) — falling back to Pillow for all %d slides",
            exc, len(scenes), exc_info=True,
        )
        return render_scene_slides(scenes, work_dir, subtitles)


