"""Layout preview image generation endpoint.

GET /api/slides/layout-preview?theme=Business&layout=Section-1
  → Returns a real PNG screenshot of the layout slide from the PPTX template.
  → First call: ~1-2 s (LibreOffice headless render)
  → Subsequent calls: instant (disk-cached at static/img/{theme}/{layout}.png)
"""
from __future__ import annotations

import io
import logging
import os
import shutil
import subprocess
import tempfile
import time
import zipfile
from pathlib import Path

from fastapi import HTTPException, Query
from fastapi.responses import FileResponse

from backend.config import Config
from .router import slides_router, public_slides_router

logger = logging.getLogger(__name__)

STATIC_IMG_ROOT = os.path.join(os.path.dirname(Config.PPT_TEMPLATES_FOLDER), "img")
SOFFICE_BIN = shutil.which("soffice") or shutil.which("libreoffice")

# ── Helpers ───────────────────────────────────────────────────────────────────

def _cache_path(theme: str, layout_name: str) -> str:
    """Return the on-disk cache path for a layout preview PNG."""
    safe_layout = layout_name  # keep unicode; OS handles it fine
    return os.path.join(STATIC_IMG_ROOT, theme, f"{safe_layout}.png")


def _dedup_zip(src_bytes: bytes) -> bytes:
    """Remove duplicate entries from a ZIP/PPTX byte stream.

    python-pptx can produce duplicate ZIP entries when saving a Presentation
    loaded from a template file.  We fix this by re-writing the archive,
    keeping only the first occurrence of each entry name.
    """
    seen: set[str] = set()
    out = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(src_bytes), "r") as zin:
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                if item.filename in seen:
                    continue
                seen.add(item.filename)
                zout.writestr(item, zin.read(item.filename))
    return out.getvalue()


def _render_layout_png(theme: str, layout_name: str) -> str:
    """Generate & cache a layout preview PNG.  Returns the cache path."""
    cache = _cache_path(theme, layout_name)
    if os.path.exists(cache):
        return cache

    if not SOFFICE_BIN:
        raise RuntimeError("LibreOffice (soffice) not found on PATH.")

    template_path = os.path.join(Config.PPT_TEMPLATES_FOLDER, f"{theme}.pptx")
    if not os.path.exists(template_path):
        raise FileNotFoundError(f"Template not found: {template_path}")

    # ── 1. Build a single-slide PPTX in memory ──────────────────────────────
    try:
        from pptx import Presentation  # lazy import — keeps startup fast
        from pptx.util import Pt
    except ImportError as exc:
        raise RuntimeError("python-pptx not installed") from exc

    prs = Presentation(template_path)
    target_layout = next(
        (l for l in prs.slide_layouts if l.name == layout_name), None
    )
    if target_layout is None:
        raise ValueError(f"Layout '{layout_name}' not found in theme '{theme}'.")

    # Add one slide using the target layout (title placeholder filled for context)
    slide = prs.slides.add_slide(target_layout)
    for ph in slide.placeholders:
        try:
            if ph.placeholder_format.type == 1:   # title
                ph.text = layout_name
        except Exception:
            pass

    # ── 2. Save to BytesIO and fix duplicate ZIP entries ────────────────────
    buf = io.BytesIO()
    prs.save(buf)
    fixed_bytes = _dedup_zip(buf.getvalue())

    # ── 3. Write fixed PPTX to temp dir and convert via LibreOffice ─────────
    with tempfile.TemporaryDirectory() as tmp:
        pptx_file = os.path.join(tmp, "slide.pptx")
        with open(pptx_file, "wb") as f:
            f.write(fixed_bytes)

        t0 = time.time()
        result = subprocess.run(
            [
                SOFFICE_BIN,
                "--headless",
                "--convert-to", "png",
                "--outdir", tmp,
                pptx_file,
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )
        elapsed = time.time() - t0
        logger.info(
            "[layout-preview] soffice finished in %.1fs for %s/%s (rc=%d)",
            elapsed, theme, layout_name, result.returncode,
        )

        # LibreOffice outputs one PNG per slide, named like "slide.png"
        # (it may also append page numbers: "slide1.png", "slide2.png" … for
        # multi-page documents — we always want the LAST page which is ours)
        import glob
        pngs = sorted(glob.glob(os.path.join(tmp, "*.png")))
        if not pngs:
            raise RuntimeError(
                f"LibreOffice produced no PNG for {theme}/{layout_name}. "
                f"stderr: {result.stderr[:400]}"
            )

        # Pick the last PNG (= our newly added slide)
        src_png = pngs[-1]

        # ── 4. Resize to thumbnail and save to cache ─────────────────────
        try:
            from PIL import Image
            img = Image.open(src_png).convert("RGB")
            img = img.resize((480, 270), Image.LANCZOS)
            os.makedirs(os.path.dirname(cache), exist_ok=True)
            img.save(cache, "PNG", optimize=True)
        except ImportError:
            # PIL not available — just copy raw PNG at original size
            os.makedirs(os.path.dirname(cache), exist_ok=True)
            shutil.copy2(src_png, cache)

    return cache


# ── Route ─────────────────────────────────────────────────────────────────────

@slides_router.get("/layout-preview")
@public_slides_router.get("/layout-preview", include_in_schema=False)
def get_layout_preview(
    theme: str = Query(..., description="Theme name, e.g. 'Business'"),
    layout: str = Query(..., description="Layout name, e.g. 'Section-1'"),
):
    """Return a real screenshot of the requested PPTX layout slide as PNG.

    Results are cached on first render and served as static files on
    subsequent requests (typically < 10 ms after first call).
    """
    try:
        cache_file = _render_layout_png(theme, layout)
        return FileResponse(
            cache_file,
            media_type="image/png",
            headers={
                "Cache-Control": "public, max-age=86400",
                "X-Layout-Preview-Theme": theme,
                "X-Layout-Preview-Layout": layout,
            },
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        logger.error("[layout-preview] RuntimeError: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.exception("[layout-preview] Unexpected error for %s/%s", theme, layout)
        raise HTTPException(status_code=500, detail="Layout preview generation failed.")
