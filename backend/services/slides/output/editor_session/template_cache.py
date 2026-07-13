from __future__ import annotations

import threading
from pathlib import Path

from backend.core.config import Config


def template_cache_key(theme_id: str) -> str:
    return f"editor_session:template:{theme_id}"


def load_template_bytes(session_cls, theme_id: str) -> bytes:
    lock = getattr(session_cls, "_template_lock", None)
    if lock is None:
        lock = threading.Lock()
        session_cls._template_lock = lock
    with lock:
        key = template_cache_key(theme_id)
        cached = session_cls._template_cache_inmem.get(key)
        if cached is not None:
            return cached
        pptx_path = Path(Config.PPT_TEMPLATES_FOLDER) / theme_id / "template.pptx"
        if not pptx_path.is_file():
            raise FileNotFoundError(f"Template not found: {pptx_path}")
        data = pptx_path.read_bytes()
        session_cls._template_cache_inmem[key] = data
        return data
