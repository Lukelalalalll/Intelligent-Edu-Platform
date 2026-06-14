"""Shared constants, logger, and in-memory task stores for the video service."""
from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

BACKEND_ROOT = Path(__file__).resolve().parents[2]
VIDEO_DIR = BACKEND_ROOT / "generated" / "videos"
VIDEO_DIR.mkdir(parents=True, exist_ok=True)

TTS_VOICES = {
    "zh": "zh-CN-XiaoxiaoNeural",
    "en": "en-US-JennyNeural",
}

_tasks: dict[str, dict] = {}
_script_jobs: dict[str, dict] = {}


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
        "errors": [],
    }
    return _tasks[task_id]


def get_script_job(job_id: str) -> dict | None:
    return _script_jobs.get(job_id)


def new_script_job(job_id: str) -> dict:
    _script_jobs[job_id] = {
        "status": "running",
        "progress": 0,
        "message": "Starting...",
        "scripts": None,
        "slideContents": None,
    }
    return _script_jobs[job_id]
