"""Step D — Slide image rendering (Pillow)."""
from __future__ import annotations

import json
import textwrap
from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw, ImageFont

from .extract import pdf_to_images

SLIDE_W, SLIDE_H = 1280, 720
BG_COLORS = ["#1e3a5f", "#1a3a2f", "#3a1e1e", "#2d1e3a", "#1e2d3a", "#2a1e3f", "#1e3a3a", "#3a2e1e"]

# ── 10 preset themes (shared with frontend themes.ts) ──
THEMES: dict[str, dict[str, str]] = {
    "dark-ocean":    {"bg": "#0f2744", "title": "#60a5fa", "body": "#e2e8f0", "accent": "#1e40af"},
    "forest":        {"bg": "#0d2b1e", "title": "#4ade80", "body": "#d1fae5", "accent": "#166534"},
    "midnight":      {"bg": "#1a0533", "title": "#c084fc", "body": "#f3e8ff", "accent": "#7c3aed"},
    "sunset":        {"bg": "#4a1515", "title": "#fb923c", "body": "#fde8d8", "accent": "#c2410c"},
    "minimal-white": {"bg": "#ffffff", "title": "#1e293b", "body": "#475569", "accent": "#e2e8f0"},
    "corp-blue":     {"bg": "#1e3a5f", "title": "#ffffff", "body": "#bfdbfe", "accent": "#1d4ed8"},
    "chalkboard":    {"bg": "#1a3028", "title": "#fef08a", "body": "#f0fdf4", "accent": "#15803d"},
    "tech-noir":     {"bg": "#111827", "title": "#22d3ee", "body": "#94a3b8", "accent": "#0e7490"},
    "rose-gold":     {"bg": "#3d1525", "title": "#fda4af", "body": "#fce7f3", "accent": "#be185d"},
    "lunar":         {"bg": "#1c1c2e", "title": "#e2e8f0", "body": "#94a3b8", "accent": "#334155"},
}

# Try to load a CJK-capable font on macOS; fall back to PIL default
_FONT_CANDIDATES = [
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/STHeiti Medium.ttc",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
]
_FONT_PATH: Optional[str] = None
for _fp in _FONT_CANDIDATES:
    if Path(_fp).exists():
        _FONT_PATH = _fp
        break


def _get_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    if _FONT_PATH:
        return ImageFont.truetype(_FONT_PATH, size)
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
    font = _get_font(24)
    wrapped = textwrap.fill(text, width=55)
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

    if slide_mode != "image" or not scene.get("customImagePath"):
        # Draw accent bar
        draw.rectangle([(0, 0), (8, SLIDE_H)], fill=theme["accent"])
        # Title
        title_font = _get_font(42)
        draw.text((80, 50), title, font=title_font, fill=theme["title"])
        # Divider
        draw.line([(80, 110), (SLIDE_W - 80, 110)], fill=theme["accent"], width=2)
        # Body — render as bullets, max 7 lines
        body_font = _get_font(28)
        body_lines: list[str] = []
        # If body contains JSON-style bullets, parse them
        try:
            parsed = json.loads(body)
            if isinstance(parsed, dict) and "bullets" in parsed:
                body_lines = [f"• {b}" for b in parsed["bullets"][:7]]
            elif isinstance(parsed, list):
                body_lines = [f"• {str(b)[:50]}" for b in parsed[:7]]
        except (json.JSONDecodeError, TypeError):
            pass
        if not body_lines:
            # Split by newline or create wrapped lines
            raw_lines = [l.strip() for l in body.split("\n") if l.strip()]
            for rl in raw_lines[:7]:
                wrapped = textwrap.wrap(rl, width=42)
                body_lines.extend(wrapped)
                if len(body_lines) >= 7:
                    break
            body_lines = body_lines[:7]
        body_text = "\n".join(body_lines) if body_lines else textwrap.fill(body[:300], width=42)
        draw.multiline_text((80, 135), body_text, font=body_font, fill=theme["body"], spacing=14)
        # Page number
        num_font = _get_font(22)
        draw.text((SLIDE_W - 70, SLIDE_H - 45), f"{idx + 1}", font=num_font, fill=theme["body"])

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
