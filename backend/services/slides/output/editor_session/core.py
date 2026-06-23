from __future__ import annotations

import base64
import logging
import os
import tempfile
import time
from typing import Any, Optional
from uuid import uuid4

from .libreoffice_renderer import ensure_soffice, find_soffice, render_pptx_to_pngs
from .pptx_builder import build_pptx_from_json
from .preview_grid import render_zoomable_preview as render_preview_grid
from .session_store import cleanup_sessions, ensure_output_dir, remove_session, touch_session
from .template_cache import load_template_bytes, template_cache_key

logger = logging.getLogger(__name__)


class EditorSession:
    _sessions: dict[str, "EditorSession"] = {}
    _timestamps: dict[str, float] = {}
    _last_cleanup: float = time.monotonic()
    _temp_dirs: list[str] = []
    _template_cache_inmem: dict[str, bytes] = {}
    _master_key: str | None = None
    SOFFICE_BIN: Optional[str] = None
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

    def __init__(self, key: str, session_id: str, original_name: str, pptx_bytes: bytes, theme_id: str, slide_lookup_table: dict[int, str], output_dir: str | None = None):
        self.key = key
        self.session_id = session_id
        self.original_name = original_name
        self._pptx_bytes = pptx_bytes
        self.theme_id = theme_id
        self.slide_lookup_table = slide_lookup_table
        self.output_dir = output_dir or tempfile.mkdtemp(prefix="slides_editor_")
        self._slide_pngs: list[bytes] = []
        self.slide_count = 0
        self._edits: dict[str, Any] = {}
        cleanup_sessions(type(self))

    @classmethod
    def _cleanup_sessions(cls) -> None:
        cleanup_sessions(cls)

    @classmethod
    def get_session(cls, session_id: str) -> Optional["EditorSession"]:
        return touch_session(cls, session_id)

    @classmethod
    def remove_session(cls, session_id: str) -> None:
        remove_session(cls, session_id)

    @classmethod
    def _find_soffice(cls) -> Optional[str]:
        return find_soffice(cls)

    @classmethod
    def _ensure_soffice(cls) -> None:
        ensure_soffice(cls)

    @classmethod
    def _template_cache_key(cls, theme_id: str) -> str:
        return template_cache_key(theme_id)

    @classmethod
    def _load_template_bytes(cls, theme_id: str) -> bytes:
        return load_template_bytes(cls, theme_id)

    @staticmethod
    def _build_pptx_from_json(payload: dict[str, Any], theme_id: str) -> bytes:
        del theme_id
        return build_pptx_from_json(payload)

    @classmethod
    def _create_master_session(cls, pptx_bytes: bytes, theme_id: str) -> "EditorSession":
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

    @classmethod
    def create_session(cls, pptx_bytes: bytes, theme_id: str, slide_lookup_table: dict[int, str], output_dir: str | None = None) -> "EditorSession":
        session_id = str(uuid4())
        key = f"editor_session:{session_id}"
        session = cls(
            key=key,
            session_id=session_id,
            original_name=f"slides-session-{session_id}.pptx",
            pptx_bytes=pptx_bytes,
            theme_id=theme_id,
            slide_lookup_table=slide_lookup_table,
            output_dir=ensure_output_dir(cls, output_dir),
        )
        cls._sessions[key] = session
        master_key = f"master:session:editor:{theme_id}"
        master_session = cls._sessions.get(master_key)
        if master_session is not None:
            session._merge_into_master(master_session)
        session._render_pptx_to_pngs()
        return session

    def _merge_into_master(self, master_session: "EditorSession") -> None:
        del master_session

    def _render_pptx_to_pngs(self) -> None:
        render_pptx_to_pngs(self)

    def get_slide_png(self, slide_index: int) -> bytes | None:
        if not self._slide_pngs:
            return None
        if 1 <= slide_index <= len(self._slide_pngs):
            return self._slide_pngs[slide_index - 1]
        return None

    def get_pptx_bytes(self) -> bytes:
        return self._pptx_bytes

    def get_pptx_payload(self) -> dict[str, Any]:
        slides = [
            {"index": index, "png_base64": base64.b64encode(png_bytes).decode("ascii")}
            for index, png_bytes in enumerate(self._slide_pngs, start=1)
        ]
        soffice_available = self._find_soffice() is not None
        return {
            "session_id": self.session_id,
            "theme_id": self.theme_id,
            "total_slides": len(self._slide_pngs),
            "status": "ready",
            "slides": slides,
            "render_mode": "libreoffice" if soffice_available else "fallback",
            "render_warning": None
            if soffice_available
            else (
                "LibreOffice not installed - showing simplified placeholder previews. "
                "Install LibreOffice for full-fidelity slide previews."
            ),
        }

    def to_dict(self) -> dict[str, Any]:
        return self.get_pptx_payload()

    def save_pptx(self, path: str) -> None:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "wb") as handle:
            handle.write(self._pptx_bytes)

    def commit_text_edit(self, slide_index: int, element_index: int, new_text: str) -> None:
        self._edits.setdefault("text_edits", []).append(
            {"slide_index": slide_index, "element_index": element_index, "new_text": new_text}
        )
        logger.info("Text edit queued: slide=%s element=%s", slide_index, element_index)

    def render_zoomable_preview(self, zoom: float = 1.0, offset_x: int = 0, offset_y: int = 0, tile_size: int = 256):
        return render_preview_grid(
            slide_pngs=self._slide_pngs,
            zoom=zoom,
            offset_x=offset_x,
            offset_y=offset_y,
            tile_size=tile_size,
        )
