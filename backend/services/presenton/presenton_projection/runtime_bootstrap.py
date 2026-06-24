from __future__ import annotations

import sys
from pathlib import Path


def ensure_presenton_runtime_path() -> None:
    runtime_root = Path(__file__).resolve().parents[3] / "presenton_runtime"
    runtime_root_str = str(runtime_root)
    if runtime_root_str not in sys.path:
        sys.path.insert(0, runtime_root_str)


ensure_presenton_runtime_path()

from models.sql.chat_history_message import ChatHistoryMessageModel  # noqa: E402
from models.sql.presentation import PresentationModel  # noqa: E402
from models.sql.slide import SlideModel  # noqa: E402


def get_async_session_maker():
    from services.database import async_session_maker  # type: ignore[import-not-found]

    return async_session_maker


__all__ = [
    "ChatHistoryMessageModel",
    "PresentationModel",
    "SlideModel",
    "ensure_presenton_runtime_path",
    "get_async_session_maker",
]
