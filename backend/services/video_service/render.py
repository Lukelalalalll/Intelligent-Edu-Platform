"""Step D — Slide image rendering (Playwright HTML + Pillow fallback)."""
from __future__ import annotations

import base64
import json
import mimetypes
import textwrap
from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw, ImageFont

from .extract import pdf_to_images
from .types import logger


def _load_themes_from_json() -> dict[str, dict[str, str]]:
    """Load theme palette from data/slide_themes.json (shared with frontend)."""
    import json as _json
    json_path = Path(__file__).parent.parent.parent.parent / "data" / "slide_themes.json"
    if json_path.exists():
        data = _json.loads(json_path.read_text(encoding="utf-8"))
        return {t["id"]: t["colors"] for t in data.get("themes", [])}
    logger.warning("slide_themes.json not found at %s, using hardcoded THEMES", json_path)
    return {}


def _img_to_data_uri(img_path: str) -> str:
    """Convert a local image file to a base64 data URI.

    Playwright's ``set_content()`` loads HTML from ``about:blank`` which
    blocks ``file://`` resource loads.  Embedding images as data URIs
    avoids this entirely.
    """
    p = Path(img_path)
    if not p.exists():
        return ""
    mime = mimetypes.guess_type(str(p))[0] or "image/png"
    data = base64.b64encode(p.read_bytes()).decode()
    return f"data:{mime};base64,{data}"

SLIDE_W, SLIDE_H = 1920, 1080  # upgraded to Full HD
BG_COLORS = ["#1e3a5f", "#1a3a2f", "#3a1e1e", "#2d1e3a", "#1e2d3a", "#2a1e3f", "#1e3a3a", "#3a2e1e"]

# ── 10 preset themes (loaded from data/slide_themes.json, shared with frontend) ──
THEMES: dict[str, dict[str, str]] = _load_themes_from_json() or {
    # Emergency fallback only
    "dark-ocean": {"bg": "#0f2744", "title": "#60a5fa", "body": "#e2e8f0", "accent": "#1e40af"},
}

# ── Font resolution: project-local → system → PIL default ──
_FONT_DIR = Path(__file__).parent.parent.parent / "assets" / "fonts"
_FONT_SEARCH = [
    _FONT_DIR / "NotoSansCJK-Regular.otf",
    _FONT_DIR / "NotoSansCJK-Regular.ttf",
    _FONT_DIR / "NotoSansCJK-Regular.ttc",
    _FONT_DIR / "AlibabaPuHuiTi.ttf",
    Path("/usr/share/fonts/truetype/noto/NotoSansCJKsc-Regular.otf"),
    Path("/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf"),
    Path("/System/Library/Fonts/PingFang.ttc"),
    Path("/System/Library/Fonts/STHeiti Medium.ttc"),
]
_FONT_PATH: Optional[Path] = next((p for p in _FONT_SEARCH if p.exists()), None)
if _FONT_PATH is None:
    logger.warning(
        "No CJK font found for Pillow fallback. Place a font file in backend/assets/fonts/. "
        "Pillow will use a non-CJK default which will show tofu for Chinese text."
    )


def _get_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    if _FONT_PATH:
        try:
            return ImageFont.truetype(str(_FONT_PATH), size)
        except Exception:
            pass
    return ImageFont.load_default()


def render_subtitle_strip(img: Image.Image, text: str) -> Image.Image:
    """Burn subtitle text into the bottom 14% of the image using Pillow.

    Pure Pillow — does NOT require ffmpeg libass.
    """
    img = img.convert("RGBA")
    w, h = img.size
    strip_h = int(h * 0.14)
    overlay = Image.new("RGBA", (w, strip_h), (0, 0, 0, 180))
    img.paste(overlay, (0, h - strip_h), overlay)
    draw = ImageDraw.Draw(img)
    font = _get_font(32)
    wrapped = textwrap.fill(text, width=65)
    draw.multiline_text(
        (w // 2, h - strip_h // 2), wrapped,
        font=font, fill="white", anchor="mm", align="center", spacing=6,
    )
    return img.convert("RGB")


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
# Production: set env SLIDE_RENDERER_URL=http://frontend:4173/slide-renderer

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
