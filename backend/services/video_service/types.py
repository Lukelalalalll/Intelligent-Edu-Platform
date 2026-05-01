"""Shared constants, logger, and in-memory task store for the video service."""
from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

BACKEND_ROOT = Path(__file__).resolve().parents[2]
VIDEO_DIR = BACKEND_ROOT / "generated" / "videos"
VIDEO_DIR.mkdir(parents=True, exist_ok=True)

# ── TTS voice mapping ──
TTS_VOICES = {
    "zh": "zh-CN-XiaoxiaoNeural",
    "en": "en-US-JennyNeural",
}

# ── In-memory task store (MVP; sufficient until horizontal scaling is needed) ──
_tasks: dict[str, dict] = {}


def get_task(task_id: str) -> dict | None:
    return _tasks.get(task_id)


def new_task(task_id: str) -> dict:
    _tasks[task_id] = {
        "status": "pending",
        "progress": 0,
        "message": "",
        "videoPath": None,
        "thumbnailPath": None,
        "chaptersPath": None,
        "quizPath": None,
        "error": None,
        "errors": [],   # list of {clip_index, stage, reason} for partial failures
    }
    return _tasks[task_id]
