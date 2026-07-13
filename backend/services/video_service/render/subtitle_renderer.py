"""Subtitle rendering helpers — font resolution, image encoding, subtitle strips."""
from __future__ import annotations

import base64
import mimetypes
import textwrap
from pathlib import Path
from typing import Optional

from PIL import Image, ImageFont

from ..types import logger

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
