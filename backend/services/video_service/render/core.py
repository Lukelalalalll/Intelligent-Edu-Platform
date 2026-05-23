"""Step D — Slide image rendering (Playwright HTML + Pillow fallback)."""
from __future__ import annotations

import base64
import json
import mimetypes
import textwrap
from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw, ImageFont

from ..extract import pdf_to_images
from ..types import logger
from .subtitle_renderer import _get_font, _img_to_data_uri, render_subtitle_strip
from .html_renderer import _check_playwright, _render_html_playwright, _build_html_for_scene, _build_animation_css, _get_browser


def _load_themes_from_json() -> dict[str, dict[str, str]]:
    """Load theme palette from data/slide_themes.json (shared with frontend)."""
    import json as _json
    json_path = Path(__file__).parent.parent.parent.parent / "data" / "slide_themes.json"
    if json_path.exists():
        data = _json.loads(json_path.read_text(encoding="utf-8"))
        return {t["id"]: t["colors"] for t in data.get("themes", [])}
    logger.warning("slide_themes.json not found at %s, using hardcoded THEMES", json_path)
    return {}


SLIDE_W, SLIDE_H = 1920, 1080  # upgraded to Full HD
BG_COLORS = ["#1e3a5f", "#1a3a2f", "#3a1e1e", "#2d1e3a", "#1e2d3a", "#2a1e3f", "#1e3a3a", "#3a2e1e"]

# ── 10 preset themes (loaded from data/slide_themes.json, shared with frontend) ──
THEMES: dict[str, dict[str, str]] = _load_themes_from_json() or {
    # Emergency fallback only
    "dark-ocean": {"bg": "#0f2744", "title": "#60a5fa", "body": "#e2e8f0", "accent": "#1e40af"},
}



def render_themed_slide(
    scene: dict, idx: int, out_path: Path, subtitles: bool = True,
) -> None:
    """Render a single slide from a Scene dict using the theme's Pillow palette."""
    theme_id = scene.get("themeId", "dark-ocean")
    theme = THEMES.get(theme_id, THEMES["dark-ocean"])

    # Custom image mode — load user-uploaded image as background
    slide_mode = scene.get("slideMode", "theme")
    layout_type = scene.get("layoutType", "title-bullets")
    if slide_mode == "image" and scene.get("customImagePath"):
        try:
            img = Image.open(scene["customImagePath"]).convert("RGB")
            img = img.resize((SLIDE_W, SLIDE_H), Image.LANCZOS)
        except Exception:
            img = Image.new("RGB", (SLIDE_W, SLIDE_H), theme["bg"])
    else:
        img = Image.new("RGB", (SLIDE_W, SLIDE_H), theme["bg"])

    draw = ImageDraw.Draw(img)
    title = scene.get("slideTitle", "")[:60]
    body = scene.get("slideBody", "")

    # ── Parse bullets once ──
    body_lines: list[str] = []
    try:
        parsed = json.loads(body)
        if isinstance(parsed, dict) and "bullets" in parsed:
            body_lines = [f"• {b}" for b in parsed["bullets"][:7]]
        elif isinstance(parsed, list):
            body_lines = [f"• {str(b)[:50]}" for b in parsed[:7]]
    except (json.JSONDecodeError, TypeError):
        pass
    if not body_lines:
        raw_lines = [l.strip() for l in body.split("\n") if l.strip()]
        for rl in raw_lines[:7]:
            wrapped = textwrap.wrap(rl, width=50)
            body_lines.extend(wrapped)
            if len(body_lines) >= 7:
                break
        body_lines = body_lines[:7]

    # ── Layout image embedding for image-left / image-right / image-top ──
    layout_img_path = scene.get("layoutImagePath", "")
    layout_img: Image.Image | None = None
    if layout_img_path and layout_type in ("image-left", "image-right", "image-top"):
        try:
            layout_img = Image.open(layout_img_path).convert("RGB")
        except Exception:
            layout_img = None

    if layout_type in ("image-left", "image-right") and layout_img:
        # ── Side-by-side: 45% image panel + 55% text panel ──
        img_panel_w = int(SLIDE_W * 0.45)
        text_panel_w = SLIDE_W - img_panel_w
        layout_img_resized = layout_img.resize((img_panel_w, SLIDE_H), Image.LANCZOS)
        if layout_type == "image-left":
            img.paste(layout_img_resized, (0, 0))
            text_x = img_panel_w + 50
        else:
            img.paste(layout_img_resized, (text_panel_w, 0))
            text_x = 80
        draw = ImageDraw.Draw(img)  # refresh after paste
        title_font = _get_font(48)
        draw.text((text_x, 70), title, font=title_font, fill=theme["title"])
        draw.line([(text_x, 140), (text_x + text_panel_w - 120, 140)], fill=theme["accent"], width=3)
        body_font = _get_font(32)
        body_text = "\n".join(body_lines) if body_lines else textwrap.fill(body[:400], width=40)
        draw.multiline_text((text_x, 165), body_text, font=body_font, fill=theme["body"], spacing=16)
        num_font = _get_font(28)
        draw.text((SLIDE_W - 90, SLIDE_H - 55), f"{idx + 1}", font=num_font, fill=theme["body"])

    elif layout_type == "image-top" and layout_img:
        # ── Top image (45%) + bottom text (55%) ──
        img_panel_h = int(SLIDE_H * 0.45)
        layout_img_resized = layout_img.resize((SLIDE_W, img_panel_h), Image.LANCZOS)
        img.paste(layout_img_resized, (0, 0))
        draw = ImageDraw.Draw(img)
        text_y = img_panel_h + 30
        title_font = _get_font(44)
        draw.text((100, text_y), title, font=title_font, fill=theme["title"])
        draw.line([(100, text_y + 55), (SLIDE_W - 100, text_y + 55)], fill=theme["accent"], width=3)
        body_font = _get_font(30)
        body_text = "\n".join(body_lines) if body_lines else textwrap.fill(body[:400], width=50)
        draw.multiline_text((100, text_y + 75), body_text, font=body_font, fill=theme["body"], spacing=14)
        num_font = _get_font(28)
        draw.text((SLIDE_W - 90, SLIDE_H - 55), f"{idx + 1}", font=num_font, fill=theme["body"])

    elif slide_mode != "image" or not scene.get("customImagePath"):
        # ── Standard text-only rendering (title-bullets, big-quote, two-column, etc.) ──
        draw.rectangle([(0, 0), (12, SLIDE_H)], fill=theme["accent"])
        title_font = _get_font(56)
        draw.text((100, 70), title, font=title_font, fill=theme["title"])
        draw.line([(100, 150), (SLIDE_W - 100, 150)], fill=theme["accent"], width=3)
        body_font = _get_font(36)
        body_text = "\n".join(body_lines) if body_lines else textwrap.fill(body[:400], width=50)
        draw.multiline_text((100, 180), body_text, font=body_font, fill=theme["body"], spacing=18)
        num_font = _get_font(28)
        draw.text((SLIDE_W - 90, SLIDE_H - 55), f"{idx + 1}", font=num_font, fill=theme["body"])

    # Burn-in subtitles
    if subtitles and scene.get("script"):
        img = render_subtitle_strip(img, scene["script"][:200])

    img.save(str(out_path))


def render_text_slide(title: str, body: str, slide_idx: int, out_path: Path):
    """Legacy: render a simple text slide (fallback/compat)."""
    bg = BG_COLORS[slide_idx % len(BG_COLORS)]
    img = Image.new("RGB", (SLIDE_W, SLIDE_H), bg)
    draw = ImageDraw.Draw(img)

    title_font = _get_font(42)
    draw.text((80, 50), title[:60], font=title_font, fill="#ffffff")

    # Divider line
    draw.line([(80, 110), (SLIDE_W - 80, 110)], fill="#ffffff40", width=2)

    body_font = _get_font(28)
    wrapped = textwrap.fill(body, width=50)
    draw.multiline_text((80, 130), wrapped[:600], font=body_font, fill="#e2e8f0", spacing=14)

    # Page number
    num_font = _get_font(22)
    draw.text((SLIDE_W - 70, SLIDE_H - 45), f"{slide_idx + 1}", font=num_font, fill="#94a3b8")

    img.save(str(out_path))


def render_text_slides(chunks: list[str], work_dir: Path) -> list[Path]:
    paths: list[Path] = []
    for i, chunk in enumerate(chunks):
        lines = chunk.strip().split("\n", 1)
        title = lines[0][:60]
        body = lines[1] if len(lines) > 1 else chunk
        out = work_dir / f"slide_{i:03d}.png"
        render_text_slide(title, body, i, out)
        paths.append(out)
    return paths


def render_scene_slides(
    scenes: list[dict], work_dir: Path, subtitles: bool = True,
) -> list[Path]:
    """Render all Scene dicts into slide PNGs with theme + optional subtitles."""
    paths: list[Path] = []
    for i, scene in enumerate(scenes):
        out = work_dir / f"slide_{i:03d}.png"
        render_themed_slide(scene, i, out, subtitles)
        paths.append(out)
    return paths


def get_slide_images(
    chunks: list[str],
    uploaded_file_path: Optional[str],
    file_type: Optional[str],
    work_dir: Path,
) -> list[Path]:
    """PDF → use original page screenshots; text/md → render Pillow slides."""
    if uploaded_file_path and file_type == "pdf":
        return pdf_to_images(uploaded_file_path, work_dir)
    return render_text_slides(chunks, work_dir)


# ═════════════════════════════════════════════════════════════════════
# Playwright-based HTML renderer for 6 layout types (V2)
# Falls back to Pillow if Playwright is not installed.
# ═════════════════════════════════════════════════════════════════════

_HTML_TEMPLATE = """<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{width:1920px;height:1080px;overflow:hidden;font-family:"PingFang SC","Noto Sans CJK SC","Segoe UI",Arial,sans-serif}}
.slide{{width:1920px;height:1080px;position:relative;display:flex;flex-direction:column;
  background:{bg};color:{body}}}

/* ── title-bullets ── */
.layout-title-bullets {{padding:80px 120px;display:flex;flex-direction:column}}
.layout-title-bullets .accent-bar {{position:absolute;left:0;top:0;width:10px;height:100%;background:{accent}}}
.layout-title-bullets h1 {{font-size:56px;color:{title};margin-bottom:16px;letter-spacing:.02em}}
.layout-title-bullets .divider {{height:3px;background:{accent};margin:12px 0 32px;opacity:.6}}
.layout-title-bullets .bullets {{flex:1;display:flex;flex-direction:column;gap:18px}}
.layout-title-bullets .bullets li {{font-size:36px;line-height:1.6;list-style:none}}
.layout-title-bullets .bullets li::before {{content:"•";color:{accent};margin-right:16px;font-weight:bold}}

/* ── image-left / image-right ── */
.layout-image-lr {{display:flex;flex-direction:row;height:100%}}
.layout-image-lr .img-panel {{width:45%;height:100%;display:flex;align-items:center;justify-content:center;
  background:rgba(0,0,0,.15);overflow:hidden}}
.layout-image-lr .img-panel img {{width:100%;height:100%;object-fit:cover}}
.layout-image-lr .text-panel {{flex:1;padding:80px 70px;display:flex;flex-direction:column}}
.layout-image-lr h1 {{font-size:48px;color:{title};margin-bottom:12px}}
.layout-image-lr .divider {{height:3px;background:{accent};margin:8px 0 28px;opacity:.6}}
.layout-image-lr .bullets {{flex:1;display:flex;flex-direction:column;gap:16px}}
.layout-image-lr li {{font-size:32px;line-height:1.5;list-style:none}}
.layout-image-lr li::before {{content:"•";color:{accent};margin-right:14px;font-weight:bold}}

/* ── image-top ── */
.layout-image-top {{display:flex;flex-direction:column;height:100%}}
.layout-image-top .img-panel {{height:45%;width:100%;overflow:hidden;display:flex;align-items:center;justify-content:center;
  background:rgba(0,0,0,.15)}}
.layout-image-top .img-panel img {{width:100%;height:100%;object-fit:cover}}
.layout-image-top .text-panel {{flex:1;padding:40px 100px;display:flex;flex-direction:column}}
.layout-image-top h1 {{font-size:44px;color:{title};margin-bottom:8px}}
.layout-image-top .divider {{height:3px;background:{accent};margin:6px 0 20px;opacity:.6}}
.layout-image-top .bullets {{flex:1;display:flex;flex-direction:column;gap:12px}}
.layout-image-top li {{font-size:30px;line-height:1.5;list-style:none}}
.layout-image-top li::before {{content:"•";color:{accent};margin-right:12px}}

/* ── big-quote ── */
.layout-big-quote {{display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:100px 160px;text-align:center}}
.layout-big-quote .quote-mark {{font-size:120px;color:{accent};opacity:.3;font-family:serif;line-height:1}}
.layout-big-quote .quote-text {{font-size:52px;color:{title};font-weight:700;line-height:1.6;margin:20px 0 40px}}
.layout-big-quote .quote-attr {{font-size:28px;color:{body};opacity:.6}}

/* ── two-column ── */
.layout-two-column {{padding:80px 100px;display:flex;flex-direction:column;height:100%}}
.layout-two-column h1 {{font-size:50px;color:{title};margin-bottom:12px;text-align:center}}
.layout-two-column .divider {{height:3px;background:{accent};margin:8px 0 36px;opacity:.6}}
.layout-two-column .cols {{display:flex;flex:1;gap:60px}}
.layout-two-column .col {{flex:1;display:flex;flex-direction:column}}
.layout-two-column .col-title {{font-size:34px;color:{accent};font-weight:700;margin-bottom:16px}}
.layout-two-column .col li {{font-size:28px;line-height:1.6;list-style:none;margin-bottom:8px}}
.layout-two-column .col li::before {{content:"•";color:{accent};margin-right:12px}}
.layout-two-column .col-divider {{width:2px;background:{accent};opacity:.25;flex-shrink:0}}

/* ── page number ── */
.page-num {{position:absolute;bottom:24px;right:40px;font-size:22px;color:{body};opacity:.5}}

/* ── subtitle strip ── */
.subtitle-strip {{position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.72);
  color:#fff;text-align:center;padding:14px 40px;font-size:24px;line-height:1.5}}

/* background image overlay */
.bg-img {{position:absolute;inset:0;z-index:0}}
.bg-img img {{width:100%;height:100%;object-fit:cover}}
.slide-content {{position:relative;z-index:1;display:flex;flex-direction:column;width:100%;height:100%}}

/* ── bar-chart ── */
.layout-bar-chart {{padding:70px 120px;display:flex;flex-direction:column;height:100%}}
.layout-bar-chart h1 {{font-size:50px;color:{title};margin-bottom:8px}}
.layout-bar-chart .divider {{height:3px;background:{accent};margin:8px 0 32px;opacity:.6}}
.layout-bar-chart .chart-area {{flex:1;display:flex;flex-direction:column;justify-content:space-around;gap:14px}}
.layout-bar-chart .bar-row {{display:flex;align-items:center;gap:24px}}
.layout-bar-chart .bar-label {{width:280px;font-size:26px;color:{body};text-align:right;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
.layout-bar-chart .bar-track {{flex:1;height:52px;background:rgba(255,255,255,.08);border-radius:6px;overflow:hidden;position:relative}}
.layout-bar-chart .bar-fill {{height:100%;background:{accent};border-radius:6px;transition:width .4s ease}}
.layout-bar-chart .bar-value {{position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:26px;font-weight:700;color:{title}}}

/* ── flowchart ── */
.layout-flowchart {{padding:70px 80px;display:flex;flex-direction:column;height:100%}}
.layout-flowchart h1 {{font-size:50px;color:{title};margin-bottom:8px}}
.layout-flowchart .divider {{height:3px;background:{accent};margin:8px 0 32px;opacity:.6}}
.layout-flowchart .flow-area {{flex:1;display:flex;flex-direction:row;align-items:center;justify-content:center;gap:0}}
.layout-flowchart .flow-node {{display:flex;flex-direction:column;align-items:center;justify-content:center;
  min-width:200px;max-width:260px;padding:24px 20px;
  border:2.5px solid {accent};border-radius:14px;
  background:rgba(255,255,255,.05);text-align:center}}
.layout-flowchart .flow-node-index {{font-size:22px;color:{accent};font-weight:700;margin-bottom:6px;opacity:.7}}
.layout-flowchart .flow-node-text {{font-size:24px;color:{body};line-height:1.5}}
.layout-flowchart .flow-arrow {{font-size:40px;color:{accent};opacity:.6;margin:0 8px;flex-shrink:0}}

/* ── code ── */
.layout-code {{padding:60px 100px;display:flex;flex-direction:column;height:100%}}
.layout-code h1 {{font-size:46px;color:{title};margin-bottom:8px}}
.layout-code .divider {{height:3px;background:{accent};margin:8px 0 24px;opacity:.6}}
.layout-code .code-block {{flex:1;background:rgba(0,0,0,.45);border-radius:12px;padding:36px 44px;
  overflow:hidden;border:1px solid rgba(255,255,255,.1)}}
.layout-code pre {{font-family:"Fira Code","Cascadia Code","Menlo","Courier New",monospace;
  font-size:26px;line-height:1.7;color:#e2e8f0;white-space:pre-wrap;word-break:break-all}}
.layout-code .lang-badge {{display:inline-block;background:{accent};color:#fff;
  font-size:18px;font-family:monospace;padding:4px 14px;border-radius:6px;margin-bottom:14px;opacity:.85}}

{animation_css}</style></head><body>
<div class="slide" id="slide">{bg_img_html}
<div class="slide-content">{inner_html}</div>
<div class="page-num">{page_num}</div>
{subtitle_html}
</div></body></html>"""


def render_scene_slides_v2(
    scenes: list[dict], work_dir: Path, subtitles: bool = True,
    animation_level: str = "off",
) -> list[Path]:
    """V2 renderer: tries Playwright first, falls back to Pillow.

    animation_level: "off" (default) | "basic" (CSS polish) | "high" (animated webm)
    """
    if _check_playwright():
        try:
            result = _render_html_playwright(scenes, work_dir, subtitles, animation_level)
            logger.info("render_scene_slides_v2: React renderer succeeded (%d slides)", len(result))
            return result
        except Exception as exc:
            logger.error(
                "render_scene_slides_v2: React renderer failed — falling back to Pillow. Error: %s",
                exc, exc_info=True,
            )
    else:
        logger.info("render_scene_slides_v2: Playwright not available, using Pillow fallback")
    return render_scene_slides(scenes, work_dir, subtitles)
