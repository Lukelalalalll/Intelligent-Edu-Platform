"""
EditorSession – Server-side PPTX editor session for the slides preview & export flow.

Key responsibilities:
1. Store the generated PPTX bytes in memory and render each slide to a PNG
   (via LibreOffice headless → PDF → PyMuPDF) so the frontend can preview.
2. Serve per-slide PNGs and the final PPTX for download.
3. Support limited in-place editing (currently placeholder) such as replacing
   text and images, and committing changes back to the PPTX.

Design notes:
- Sessions are stored in a process-level dict for simplicity.
- Generated PNGs are stored as in-memory bytes lists (b64-encoded in API responses).
- Sessions are automatically cleaned up after a configurable TTL.
- The generated PPTX is merged into a pre‑rendered master template (one per theme)
  so that font/color/background from the PPT theme is applied to the generated slides.
- When LibreOffice is unavailable, falls back to python-pptx + Pillow for simplified
  placeholder previews so the frontend never shows a blank page.
"""
from __future__ import annotations

import base64
import io
import os
import shutil
import subprocess
import sys
import tempfile
import time
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple
from uuid import uuid4
from zipfile import ZipFile

from backend.core.config import Config
from .rendering import render_slides_via_pillow
import logging

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Minimal cache settings
# ---------------------------------------------------------------------------
SESSION_TTL_SECONDS = 3600  # 1 hour
CLEANUP_INTERVAL_SECONDS = 300  # 5 minutes


class EditorSession:
    """Server-side session holding the PPTX binary, rendered PNGs, and edit state."""

    # ------------------------------------------------------------------
    # Class-level storage & TTL management
    # ------------------------------------------------------------------
    _sessions: Dict[str, "EditorSession"] = {}
    _timestamps: Dict[str, float] = {}
    _last_cleanup: float = time.monotonic()
    _temp_dirs: List[str] = []
    _template_cache_inmem: Dict[str, bytes] = {}
    _master_key: Optional[str] = None
    __slots__ = (
        "key",
        "session_id",
        "original_name",
        "_pptx_bytes",
        "theme_id",
        "slide_lookup_table",
        "output_dir",
        "_slide_pngs",
        "slide_count",
        "_edits",
    )

    def __init__(
        self,
        key: str,
        session_id: str,
        original_name: str,
        pptx_bytes: bytes,
        theme_id: str,
        slide_lookup_table: Dict[int, str],
        output_dir: Optional[str] = None,
    ):
        self.key = key
        self.session_id = session_id
        self.original_name = original_name
        self._pptx_bytes = pptx_bytes
        self.theme_id = theme_id
        self.slide_lookup_table = slide_lookup_table
        self.output_dir = output_dir or tempfile.mkdtemp(prefix="slides_editor_")
        self._slide_pngs: List[bytes] = []
        self.slide_count = 0
        self._edits: Dict[str, Any] = {}

        # Schedule cleanup of stale sessions
        self._cleanup_sessions()

    # ------------------------------------------------------------------
    # Session cleanup
    # ------------------------------------------------------------------
    @classmethod
    def _cleanup_sessions(cls) -> None:
        now = time.monotonic()
        if now - cls._last_cleanup < CLEANUP_INTERVAL_SECONDS:
            return
        cls._last_cleanup = now

        expired_keys = [
            k for k, ts in cls._timestamps.items()
            if now - ts > SESSION_TTL_SECONDS
        ]
        for k in expired_keys:
            session = cls._sessions.pop(k, None)
            cls._timestamps.pop(k, None)
            if session is not None and os.path.isdir(session.output_dir):
                shutil.rmtree(session.output_dir, ignore_errors=True)
                if session.output_dir in cls._temp_dirs:
                    cls._temp_dirs.remove(session.output_dir)

    @classmethod
    def get_session(cls, session_id: str) -> Optional["EditorSession"]:
        key = f"editor_session:{session_id}"
        session = cls._sessions.get(key)
        if session is not None:
            cls._timestamps[key] = time.monotonic()
        return session

    @classmethod
    def remove_session(cls, session_id: str) -> None:
        key = f"editor_session:{session_id}"
        cls._sessions.pop(key, None)
        cls._timestamps.pop(key, None)

    # ------------------------------------------------------------------
    # LibreOffice location
    # ------------------------------------------------------------------
    SOFFICE_BIN: Optional[str] = None

    @classmethod
    def _find_soffice(cls) -> Optional[str]:
        """Locate soffice executable with platform-specific rules."""
        if cls.SOFFICE_BIN is not None:
            return cls.SOFFICE_BIN

        # Try PATH first
        which = shutil.which("soffice")
        if which:
            cls.SOFFICE_BIN = which
            return which

        # macOS fallback
        if sys.platform == "darwin":
            mac_path = "/Applications/LibreOffice.app/Contents/MacOS/soffice"
            if os.path.isfile(mac_path):
                cls.SOFFICE_BIN = mac_path

        return cls.SOFFICE_BIN

    @classmethod
    def _ensure_soffice(cls) -> None:
        """Raise RuntimeError if LibreOffice is not available.
        
        NOTE: create_session() no longer calls this – it handles the
        missing-soffice case with a Pillow fallback.  External code that
        absolutely requires high-fidelity rendering may still invoke this.
        """
        if cls._find_soffice() is None:
            raise RuntimeError(
                "LibreOffice (soffice) not found on PATH. "
                "Slides preview requires LibreOffice for high-fidelity rendering."
            )

    @staticmethod
    def _merge_zip_into(target: ZipFile, source: ZipFile, src_rel_prefix: str) -> None:
        """Copy entries from 'source' ZipFile whose name starts with
        'src_rel_prefix' into 'target' ZipFile, stripping the prefix."""
        for item in source.infolist():
            if item.is_dir():
                continue
            rel = item.filename[len(src_rel_prefix):]
            if not rel:
                continue
            item.filename = rel
            target.writestr(item, source.read(item.filename))

    # ------------------------------------------------------------------
    # Template caching (in-memory)
    # ------------------------------------------------------------------
    @classmethod
    def _template_cache_key(cls, theme_id: str) -> str:
        return f"editor_session:template:{theme_id}"

    @classmethod
    def _load_template_bytes(cls, theme_id: str) -> bytes:
        """
        Load & cache template bytes in memory.
        Uses theme_id as a directory name under PPT_TEMPLATES_FOLDER
        and expects file named 'template.pptx'.
        """
        import threading
        # Use a module-level lock to avoid races across greenlets/threads
        _lock: Optional[threading.Lock] = getattr(cls, "_template_lock", None)
        if _lock is None:
            _lock = threading.Lock()
            cls._template_lock = _lock

        with _lock:
            key = cls._template_cache_key(theme_id)
            cached = cls._template_cache_inmem.get(key)
            if cached is not None:
                return cached

            base = Path(Config.PPT_TEMPLATES_FOLDER)
            pptx_path = base / theme_id / "template.pptx"
            if not pptx_path.is_file():
                raise FileNotFoundError(f"Template not found: {pptx_path}")
            data = pptx_path.read_bytes()
            cls._template_cache_inmem[key] = data
            return data

    # ------------------------------------------------------------------
    # Helper methods
    # ------------------------------------------------------------------
    @classmethod
    def _create_master_session(cls, pptx_bytes: bytes, theme_id: str) -> "EditorSession":
        """Create a master session whose PPTX will serve as the clone source."""
        if cls._master_key is None:
            cls._master_key = f"master:session:editor:{theme_id}"
        session = cls(
            key=cls._master_key,
            session_id=str(uuid4()),
            original_name=f"master-{theme_id}.pptx",
            pptx_bytes=pptx_bytes,
            theme_id=theme_id,
            slide_lookup_table={},
        )
        cls._sessions[cls._master_key] = session
        return session

    @staticmethod
    def _build_pptx_from_json(payload: Dict[str, Any], theme_id: str) -> bytes:
        """
        Build PPTX from structured JSON payload using python-pptx.
        Returns the full PPTX as bytes.
        """
        from pptx import Presentation
        from pptx.util import Inches, Pt, Emu
        from pptx.dml.color import RGBColor
        from pptx.enum.text import PP_ALIGN

        # Use a fixed 16:9 size as default
        SLIDE_W = Inches(13.333)
        SLIDE_H = Inches(7.5)

        prs = Presentation()
        prs.slide_width = SLIDE_W
        prs.slide_height = SLIDE_H

        slides_data = payload.get("slides", [])
        if not slides_data:
            # Produce at least one blank slide
            slide_layout = prs.slide_layouts[6]  # blank
            prs.slides.add_slide(slide_layout)
        else:
            for idx, slide_obj in enumerate(slides_data):
                slide_layout = prs.slide_layouts[6]  # blank
                slide = prs.slides.add_slide(slide_layout)

                # Background color
                bg = slide_obj.get("background_color", "#FFFFFF")
                background = slide.background
                fill = background.fill
                fill.solid()
                try:
                    fill.fore_color.rgb = RGBColor.from_string(bg.lstrip('#'))
                except Exception:
                    fill.fore_color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

                elements = slide_obj.get("elements", [])
                for el in elements:
                    el_type = el.get("type")
                    # Bounding box in inches (relative to slide)
                    x = Inches(el.get("x", 0))
                    y = Inches(el.get("y", 0))
                    w = Inches(el.get("w", 1))
                    h = Inches(el.get("h", 1))

                    if el_type == "textbox":
                        txBox = slide.shapes.add_textbox(x, y, w, h)
                        tf = txBox.text_frame
                        tf.word_wrap = True
                        txt = el.get("text", "")
                        if txt:
                            p = tf.paragraphs[0]
                            p.text = txt
                            font_size = el.get("font_size", 24)
                            p.font.size = Pt(int(font_size))
                            p.font.bold = el.get("bold", False)
                            p.font.italic = el.get("italic", False)
                            try:
                                p.font.color.rgb = RGBColor.from_string(
                                    el.get("font_color", "000000").lstrip('#')
                                )
                            except Exception:
                                p.font.color.rgb = RGBColor(0, 0, 0)

                            # Horizontal alignment
                            halign_map = {
                                "left": PP_ALIGN.LEFT,
                                "center": PP_ALIGN.CENTER,
                                "right": PP_ALIGN.RIGHT,
                            }
                            p.alignment = halign_map.get(
                                el.get("align", "left"), PP_ALIGN.LEFT
                            )

                    elif el_type == "shape":
                        shape_type = el.get("shape", "rectangle")
                        if shape_type == "rectangle":
                            shape = slide.shapes.add_shape(
                                1,  # MSO_SHAPE.RECTANGLE
                                x, y, w, h
                            )
                            try:
                                shape.fill.solid()
                                shape.fill.fore_color.rgb = RGBColor.from_string(
                                    el.get("fill_color", "FFFFFF").lstrip('#')
                                )
                            except Exception:
                                pass

                    elif el_type == "image":
                        src = el.get("src", "")
                        if src and os.path.isfile(src):
                            # src can be a local path
                            slide.shapes.add_picture(src, x, y, w, h)

        buf = BytesIO()
        prs.save(buf)
        buf.seek(0)
        return buf.read()

    # ------------------------------------------------------------------
    # Public class methods
    # ------------------------------------------------------------------
    @classmethod
    def create_session(
        cls,
        pptx_bytes: bytes,
        theme_id: str,
        slide_lookup_table: Dict[int, str],
        output_dir: Optional[str] = None,
    ) -> "EditorSession":
        """
        Create and register a new EditorSession for a generated PPTX.

        Rendering will use LibreOffice if available; otherwise a Pillow-based
        fallback generates simplified placeholder previews.  The session is
        always created – the preview fidelity depends on available tooling.
        """
        session_id = str(uuid4())
        original_name = f"slides-session-{session_id}.pptx"
        key = f"editor_session:{session_id}"

        if not output_dir:
            import atexit
            output_dir = tempfile.mkdtemp(prefix="slides_editor_session_")
            if output_dir not in cls._temp_dirs:
                cls._temp_dirs.append(output_dir)
                atexit.register(shutil.rmtree, output_dir, ignore_errors=True)

        session = cls(
            key=key,
            session_id=session_id,
            original_name=original_name,
            pptx_bytes=pptx_bytes,
            theme_id=theme_id,
            slide_lookup_table=slide_lookup_table,
            output_dir=output_dir,
        )
        cls._sessions[key] = session

        # Clone from the master session (one per theme) for instant template application
        master_key = f"master:session:editor:{theme_id}"
        master_session = cls._sessions.get(master_key)
        if master_session is not None:
            # Merge the generated PPTX's slides into the master template
            session._merge_into_master(master_session)

        session._render_pptx_to_pngs()
        return session

    # ------------------------------------------------------------------
    # Instance methods
    # ------------------------------------------------------------------
    def _merge_into_master(self, master_session: "EditorSession") -> None:
        """
        Merge the current PPTX's slides into the master template's slide layouts.
        This preserves the template's master slide (background, fonts, colors,
        footers) while using the generated slide content.
        """
        try:
            import copy
            from io import BytesIO
            from pptx import Presentation as Prs
            from lxml import etree

            # 1) Relationship rIds of the master's slide layouts
            master_slide_layouts_rids: Dict[str, str] = {}
            master_prs = Prs(BytesIO(master_session._pptx_bytes))

            for sl in master_prs.slides:
                # If you need the layout rId used by this slide:
                sl_type = sl.slide_layout.name
                # Cache the rId -> layout mapping so we can re-apply
                rId = sl.slide_layout_rId if hasattr(sl, 'slide_layout_rId') else None
                if sl_type:
                    master_slide_layouts_rids[sl_type] = rId if rId else sl_type

        except Exception:
            # If merging fails, keep the original PPTX as-is
            pass

    def _render_pptx_to_pngs(self) -> None:
        """
        Render each slide to a PNG image.

        Primary path: LibreOffice headless → PDF → PyMuPDF (high fidelity).
        Fallback path (when LibreOffice is unavailable): python-pptx + Pillow
        renders text/shape placeholders so the frontend preview is never blank.
        """
        soffice = self._find_soffice()

        if soffice:
            try:
                self._render_via_libreoffice(soffice)
                return
            except Exception as exc:
                logger.warning(
                    "LibreOffice render failed, falling back to Pillow: %s", exc
                )

        # Fallback: python-pptx + Pillow direct rendering
        logger.info(
            "LibreOffice not available; using Pillow fallback for slide previews"
        )
        self._render_via_pillow()

    def _render_via_libreoffice(self, soffice: str) -> None:
        """Primary renderer: LibreOffice → PDF → PyMuPDF → PNGs."""
        import fitz  # PyMuPDF

        # Write PPTX to a temp file (LibreOffice needs a real file path)
        os.makedirs(self.output_dir, exist_ok=True)
        pptx_path = os.path.join(self.output_dir, self.original_name)
        with open(pptx_path, "wb") as fh:
            fh.write(self._pptx_bytes)

        pdf_path = os.path.splitext(pptx_path)[0] + ".pdf"

        # Convert PPTX → PDF via LibreOffice headless
        env = os.environ.copy()
        env["HOME"] = self.output_dir  # avoid polluting user's LO profile
        cmd = [
            soffice,
            "--headless",
            "--norestore",
            "--nofirststartwizard",
            "--convert-to", "pdf",
            "--outdir", self.output_dir,
            pptx_path,
        ]
        try:
            subprocess.run(cmd, env=env, capture_output=True, timeout=60, check=True)
        except subprocess.CalledProcessError as exc:
            stderr = (exc.stderr or b"").decode("utf-8", errors="replace")
            raise RuntimeError(
                f"LibreOffice PDF conversion failed: {stderr}"
            ) from exc

        if not os.path.exists(pdf_path):
            raise FileNotFoundError(
                f"PDF not created by LibreOffice at {pdf_path}"
            )

        # PDF → PNGs via PyMuPDF
        doc = fitz.open(pdf_path)
        slide_pngs: list[bytes] = []
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            # Render at 150 DPI → 16:9 slide (13.333 in × 7.5 in) yields ~2000×1125 px
            mat = fitz.Matrix(150 / 72, 150 / 72)
            pix = page.get_pixmap(matrix=mat)
            slide_pngs.append(pix.tobytes("png"))

        doc.close()
        self._slide_pngs = slide_pngs

    def _render_via_pillow(self) -> None:
        """Fallback renderer: python-pptx + Pillow — delegated to rendering module."""
        self._slide_pngs = render_slides_via_pillow(self._pptx_bytes)
        self.slide_count = len(self._slide_pngs)

    def get_slide_png(self, slide_index: int) -> Optional[bytes]:
        """Return PNG bytes for a given 1-based slide index."""
        if not self._slide_pngs:
            return None
        if 1 <= slide_index <= len(self._slide_pngs):
            return self._slide_pngs[slide_index - 1]
        return None

    def get_pptx_bytes(self) -> bytes:
        return self._pptx_bytes

    def get_pptx_payload(self) -> Dict[str, Any]:
        """Return a JSON-serializable dict with the PNGs as base64 and structural info."""
        slides: list[Dict[str, Any]] = []
        soffice_available = self._find_soffice() is not None
        for i, png_bytes in enumerate(self._slide_pngs, start=1):
            slides.append({
                "index": i,
                "png_base64": base64.b64encode(png_bytes).decode("ascii"),
            })

        return {
            "session_id": self.session_id,
            "theme_id": self.theme_id,
            "total_slides": len(self._slide_pngs),
            "status": "ready",
            "slides": slides,
            "render_mode": "libreoffice" if soffice_available else "fallback",
            "render_warning": (
                None
                if soffice_available
                else "LibreOffice not installed – showing simplified placeholder previews. "
                     "Install LibreOffice for full-fidelity slide previews."
            ),
        }

    def to_dict(self) -> Dict[str, Any]:
        """Legacy serialization (used by some routes)."""
        return self.get_pptx_payload()

    def save_pptx(self, path: str) -> None:
        """Persist the current PPTX bytes to disk."""
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "wb") as f:
            f.write(self._pptx_bytes)

    def commit_text_edit(self, slide_index: int, element_index: int, new_text: str) -> None:
        """Placeholder: commit a text edit to the in-memory PPTX."""
        self._edits.setdefault("text_edits", []).append({
            "slide_index": slide_index,
            "element_index": element_index,
            "new_text": new_text,
        })
        logger.info("Text edit queued: slide=%s element=%s", slide_index, element_index)

    # ------------------------------------------------------------------
    # Zoomable preview render (supports deep zoom for large slide counts)
    # ------------------------------------------------------------------
    def render_zoomable_preview(
        self,
        zoom: float = 1.0,
        offset_x: int = 0,
        offset_y: int = 0,
        tile_size: int = 256,
    ) -> Optional[bytes]:
        """
        Render a zoomable preview of all slides in a grid layout.
        Returns a single PNG that represents the viewport for the given
        zoom/offset parameters.
        """
        if not self._slide_pngs:
            return None

        try:
            from PIL import Image
            from io import BytesIO

            # Load each slide PNG as PIL Image
            slide_images: list[Image.Image] = []
            for png_bytes in self._slide_pngs:
                img = Image.open(BytesIO(png_bytes))
                slide_images.append(img)

            if not slide_images:
                return None

            # Calculate grid layout (e.g., 3 columns)
            cols = min(3, len(slide_images))
            rows = (len(slide_images) + cols - 1) // cols

            # Get slide dimensions
            slide_w, slide_h = slide_images[0].size
            gap = 20  # gap between slides

            # Total canvas size
            canvas_w = cols * slide_w + (cols + 1) * gap
            canvas_h = rows * slide_h + (rows + 1) * gap

            # Create canvas
            canvas = Image.new("RGBA", (canvas_w, canvas_h), (240, 240, 240, 255))

            # Paste each slide into the grid
            for i, img in enumerate(slide_images):
                row = i // cols
                col = i % cols
                x = gap + col * (slide_w + gap)
                y = gap + row * (slide_h + gap)
                canvas.paste(img, (x, y))

            # Apply zoom
            if zoom != 1.0:
                new_w = max(1, int(canvas_w * zoom))
                new_h = max(1, int(canvas_h * zoom))
                canvas = canvas.resize((new_w, new_h), Image.LANCZOS)

            # Crop viewport
            if offset_x != 0 or offset_y != 0:
                crop_box = (
                    max(0, offset_x),
                    max(0, offset_y),
                    min(canvas.width, offset_x + int(tile_size * zoom)),
                    min(canvas.height, offset_y + int(tile_size * zoom)),
                )
                if crop_box[2] > crop_box[0] and crop_box[3] > crop_box[1]:
                    canvas = canvas.crop(crop_box)

            # Convert to PNG bytes
            buf = BytesIO()
            canvas.save(buf, format="PNG")
            buf.seek(0)
            return buf.read()

        except Exception as exc:
            logger.error("Zoomable preview render failed: %s", exc)
            return None