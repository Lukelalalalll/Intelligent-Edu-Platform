from __future__ import annotations

import os
import shutil
import tempfile
import time
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .core import EditorSession

SESSION_TTL_SECONDS = 3600
CLEANUP_INTERVAL_SECONDS = 300


def cleanup_sessions(session_cls: type["EditorSession"]) -> None:
    now = time.monotonic()
    if now - session_cls._last_cleanup < CLEANUP_INTERVAL_SECONDS:
        return
    session_cls._last_cleanup = now
    expired_keys = [
        key
        for key, timestamp in session_cls._timestamps.items()
        if now - timestamp > SESSION_TTL_SECONDS
    ]
    for key in expired_keys:
        session = session_cls._sessions.pop(key, None)
        session_cls._timestamps.pop(key, None)
        if session is not None and os.path.isdir(session.output_dir):
            shutil.rmtree(session.output_dir, ignore_errors=True)
            if session.output_dir in session_cls._temp_dirs:
                session_cls._temp_dirs.remove(session.output_dir)


def touch_session(session_cls: type["EditorSession"], session_id: str) -> "EditorSession" | None:
    key = f"editor_session:{session_id}"
    session = session_cls._sessions.get(key)
    if session is not None:
        session_cls._timestamps[key] = time.monotonic()
    return session


def remove_session(session_cls: type["EditorSession"], session_id: str) -> None:
    key = f"editor_session:{session_id}"
    session_cls._sessions.pop(key, None)
    session_cls._timestamps.pop(key, None)


def ensure_output_dir(session_cls: type["EditorSession"], output_dir: str | None) -> str:
    if output_dir:
        return output_dir
    import atexit

    generated_dir = tempfile.mkdtemp(prefix="slides_editor_session_")
    if generated_dir not in session_cls._temp_dirs:
        session_cls._temp_dirs.append(generated_dir)
        atexit.register(shutil.rmtree, generated_dir, ignore_errors=True)
    return generated_dir
