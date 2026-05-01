"""Phase 1.3 — Brand kit: intro / outro clips and thumbnail generation.

Uses only Pillow + FFmpeg (no external dependencies).
Brand kits are built-in; future versions can load custom assets from DB.
"""
from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw, ImageFont

from .types import logger

# ── Built-in brand kit definitions ─────────────────────────────────────────────
BRAND_KITS: dict[str, dict] = {
    "default": {
        "primary":     "#0f2744",
        "accent":      "#3b82f6",
        "title_color": "#ffffff",
        "body_color":  "#e2e8f0",
        "org_name":    "EduPlatform",
        "tagline":     "Powered by AI · 智能教学",
    },
}

# Reuse the same CJK font search as render.py
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
        try:
            return ImageFont.truetype(_FONT_PATH, size)
        except Exception:
            pass
    return ImageFont.load_default()


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _get_kit(brand_kit: str) -> dict:
    return BRAND_KITS.get(brand_kit, BRAND_KITS["default"])


# ── Frame renderers ─────────────────────────────────────────────────────────────

def render_intro_frame(brand_kit: str, video_title: str, out_path: Path) -> None:
    """Render a 1920×1080 PNG intro title card using Pillow."""
    kit = _get_kit(brand_kit)
    W, H = 1920, 1080

    bg_r, bg_g, bg_b = _hex_to_rgb(kit["primary"])
    acc_r, acc_g, acc_b = _hex_to_rgb(kit["accent"])

    img = Image.new("RGBA", (W, H), (bg_r, bg_g, bg_b, 255))
    draw = ImageDraw.Draw(img)

    # Left accent bar
    draw.rectangle([(0, 0), (10, H)], fill=kit["accent"])

    # Diagonal accent band (semi-transparent polygon)
    band = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    band_draw = ImageDraw.Draw(band)
    band_draw.polygon(
        [(0, 340), (W, 220), (W, 420), (0, 540)],
        fill=(acc_r, acc_g, acc_b, 28),
    )
    img = Image.alpha_composite(img, band)
    draw = ImageDraw.Draw(img)

    # Org name — top-right
    org_font = _get_font(36)
    draw.text((W - 60, 60), kit["org_name"], font=org_font,
              fill=kit["accent"], anchor="rt")

    # Decorative horizontal line
    draw.line([(100, 420), (W - 100, 420)], fill=(acc_r, acc_g, acc_b, 90), width=2)

    # Main title (centred)
    title_text = (video_title[:44] + "…") if len(video_title) > 44 else (video_title or "Teaching Video")
    title_font = _get_font(78)
    draw.text((W // 2, H // 2 - 30), title_text, font=title_font,
              fill=kit["title_color"], anchor="mm")

    # Tagline
    tagline_font = _get_font(34)
    draw.text((W // 2, H // 2 + 68), kit["tagline"], font=tagline_font,
              fill=kit["body_color"], anchor="mm")

    img.convert("RGB").save(str(out_path))


def render_outro_frame(brand_kit: str, out_path: Path) -> None:
    """Render a 1920×1080 PNG outro card using Pillow."""
    kit = _get_kit(brand_kit)
    W, H = 1920, 1080

    bg_r, bg_g, bg_b = _hex_to_rgb(kit["primary"])
    acc_r, acc_g, acc_b = _hex_to_rgb(kit["accent"])

    img = Image.new("RGBA", (W, H), (bg_r, bg_g, bg_b, 255))
    draw = ImageDraw.Draw(img)

    # Side accent bars
    draw.rectangle([(0, 0), (10, H)], fill=kit["accent"])
    draw.rectangle([(W - 10, 0), (W, H)], fill=kit["accent"])

    # Centre band
    band = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    band_draw = ImageDraw.Draw(band)
    band_draw.rectangle([(0, 390), (W, 690)], fill=(acc_r, acc_g, acc_b, 22))
    img = Image.alpha_composite(img, band)
    draw = ImageDraw.Draw(img)

    # "Thanks for Watching!" (English)
    main_font = _get_font(86)
    draw.text((W // 2, H // 2 - 55), "Thanks for Watching!", font=main_font,
              fill=kit["title_color"], anchor="mm")

    # 感谢观看 (Chinese)
    zh_font = _get_font(62)
    draw.text((W // 2, H // 2 + 58), "感谢观看", font=zh_font,
              fill=kit["accent"], anchor="mm")

    # Org name — bottom centre
    org_font = _get_font(30)
    draw.text((W // 2, H - 80), kit["org_name"], font=org_font,
              fill=kit["body_color"], anchor="mm")

    img.convert("RGB").save(str(out_path))


# ── Clip builder ────────────────────────────────────────────────────────────────

def make_brand_clip(frame_path: Path, out_path: Path, duration: float = 2.5) -> None:
    """Convert a PNG frame to a short MP4 with fade-in/out and silent audio.

    The clip includes a silent AAC audio track at 44100 Hz so it is
    compatible with the concat-demuxer ``-c copy`` used in ``_concat_video``.
    """
    fade_dur = min(0.5, duration / 4)
    fade_out_start = max(0.0, duration - fade_dur)

    vf = (
        "scale=1920:1080:force_original_aspect_ratio=decrease,"
        "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,"
        "scale=trunc(iw/2)*2:trunc(ih/2)*2,"
        f"fade=type=in:start_time=0:duration={fade_dur:.2f},"
        f"fade=type=out:start_time={fade_out_start:.3f}:duration={fade_dur:.2f}"
    )

    cmd = [
        "ffmpeg", "-y",
        # Video: loop static frame
        "-loop", "1", "-framerate", "24",
        "-t", f"{duration:.3f}",
        "-i", str(frame_path),
        # Audio: silent source (must match scene-clip audio stream spec)
        "-f", "lavfi",
        "-t", f"{duration:.3f}",
        "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
        # Filters
        "-vf", vf,
        # Codec
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-loglevel", "error",
        str(out_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(
            f"brand clip FFmpeg error (exit {result.returncode}): {result.stderr[:600]}"
        )


# ── Thumbnail ───────────────────────────────────────────────────────────────────

def make_thumbnail(slide_path: Path, out_path: Path) -> None:
    """Resize the first slide to 1280×720 and save as JPEG thumbnail."""
    img = Image.open(str(slide_path)).convert("RGB")
    img = img.resize((1280, 720), Image.LANCZOS)
    img.save(str(out_path), "JPEG", quality=90, optimize=True)


# ── Public entry point ──────────────────────────────────────────────────────────

def build_brand_assets(
    brand_kit: str,
    video_title: str,
    first_slide_path: Optional[Path],
    work_dir: Path,
) -> tuple[Optional[Path], Optional[Path], Optional[Path]]:
    """Generate intro.mp4, outro.mp4, and thumbnail.jpg.

    Returns (intro_path | None, outro_path | None, thumbnail_path | None).
    Failures are logged but never raised — the main pipeline continues.
    """
    intro_path: Optional[Path] = None
    outro_path: Optional[Path] = None
    thumbnail_path: Optional[Path] = None

    try:
        intro_frame = work_dir / "brand_intro_frame.png"
        render_intro_frame(brand_kit, video_title, intro_frame)
        intro_mp4 = work_dir / "intro.mp4"
        make_brand_clip(intro_frame, intro_mp4, duration=2.5)
        intro_path = intro_mp4
        logger.info("Brand intro generated: %s", intro_mp4.name)
    except Exception as exc:
        logger.warning("Brand intro generation failed: %s", exc)

    try:
        outro_frame = work_dir / "brand_outro_frame.png"
        render_outro_frame(brand_kit, outro_frame)
        outro_mp4 = work_dir / "outro.mp4"
        make_brand_clip(outro_frame, outro_mp4, duration=2.0)
        outro_path = outro_mp4
        logger.info("Brand outro generated: %s", outro_mp4.name)
    except Exception as exc:
        logger.warning("Brand outro generation failed: %s", exc)

    if first_slide_path and first_slide_path.exists():
        try:
            thumb = work_dir / "thumbnail.jpg"
            make_thumbnail(first_slide_path, thumb)
            thumbnail_path = thumb
            logger.info("Thumbnail generated: %s", thumb.name)
        except Exception as exc:
            logger.warning("Thumbnail generation failed: %s", exc)

    return intro_path, outro_path, thumbnail_path
