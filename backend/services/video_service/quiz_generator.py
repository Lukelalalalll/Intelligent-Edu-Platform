"""Quiz marker and chapter metadata generation (Phase 3.2).

Outputs two JSON files per task:
  - ``chapters.json``     — chapter list with timestamps  [{time, title}]
  - ``quiz_markers.json`` — MCQ per scene at scene-end    [{time, question, options, answer}]

The ``generate_quiz_markers`` function calls the project's AI gateway to
generate one multiple-choice question per scene.  It is robust: if a
particular scene's LLM call fails, that scene is skipped silently.
"""
from __future__ import annotations

import json
import logging
import re
import subprocess
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

_FFPROBE_TIMEOUT = 15  # seconds


# ── Duration probing ──────────────────────────────────────────────────────────

def probe_duration(path: Path) -> float:
    """Return the duration of a media file in seconds (0.0 on failure)."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            capture_output=True,
            text=True,
            timeout=_FFPROBE_TIMEOUT,
        )
        if result.returncode == 0 and result.stdout.strip():
            return float(result.stdout.strip())
    except Exception as exc:
        logger.debug("probe_duration(%s) failed: %s", path, exc)
    return 0.0


def compute_scene_offsets(
    clip_paths: list[Path],
    intro_duration: float = 0.0,
) -> list[float]:
    """Return the start-time offset of each scene clip in the final video.

    Parameters
    ----------
    clip_paths:
        Ordered list of per-scene MP4 clips (brand intro/outro NOT included).
    intro_duration:
        Duration of the brand intro clip prepended before the first scene.

    Returns
    -------
    List of float start-times (seconds) aligned 1-to-1 with clip_paths.
    """
    offsets: list[float] = []
    t = intro_duration
    for p in clip_paths:
        offsets.append(round(t, 2))
        t += probe_duration(p)
    return offsets


# ── Chapter list ──────────────────────────────────────────────────────────────

def generate_chapters(
    scenes: list[dict],
    offsets: list[float],
) -> list[dict]:
    """Build a chapter list from scene titles and computed offsets.

    Returns
    -------
    List of ``{"time": float, "title": str}`` dicts.
    """
    chapters = []
    for i, (scene, offset) in enumerate(zip(scenes, offsets)):
        title = scene.get("slideTitle") or f"Chapter {i + 1}"
        chapters.append({"time": offset, "title": title})
    return chapters


# ── Quiz question generation ──────────────────────────────────────────────────

_QUIZ_PROMPT_ZH = """你是一位专业教师。根据以下教学视频片段的文字内容，出一道四选一的单项选择题（MCQ），帮助学生检验理解。

片段内容：
{script}

请严格用 JSON 格式回答（不要有任何其他文字）：
{{
  "question": "问题内容",
  "options": ["A. 选项1", "B. 选项2", "C. 选项3", "D. 选项4"],
  "answer": 0
}}
其中 answer 是正确选项的 0-based 索引。"""

_QUIZ_PROMPT_EN = """You are a professional educator. Based on the following teaching video segment, create one multiple-choice question (4 options) to test student comprehension.

Segment content:
{script}

Reply strictly in JSON format (no other text):
{{
  "question": "Question text",
  "options": ["A. Option 1", "B. Option 2", "C. Option 3", "D. Option 4"],
  "answer": 0
}}
Where "answer" is the 0-based index of the correct option."""


def _parse_quiz_json(raw: str) -> Optional[dict]:
    """Extract and validate a quiz JSON object from LLM output."""
    start = raw.find("{")
    end = raw.rfind("}") + 1
    if start == -1 or end <= start:
        return None
    try:
        obj = json.loads(raw[start:end])
    except json.JSONDecodeError:
        # Try fixing invalid escape sequences
        candidate = re.sub(r'\\(?!["\\/bfnrtu])', r'\\\\', raw[start:end])
        try:
            obj = json.loads(candidate)
        except json.JSONDecodeError:
            return None
    # Validate structure
    if not isinstance(obj.get("question"), str):
        return None
    if not isinstance(obj.get("options"), list) or len(obj["options"]) < 2:
        return None
    if not isinstance(obj.get("answer"), int):
        return None
    return obj


async def generate_quiz_markers(
    scenes: list[dict],
    scripts: list[str],
    offsets: list[float],
    lang: str = "zh",
    provider: str = "local_ollama",
) -> list[dict]:
    """Generate one MCQ per scene using the AI gateway.

    Questions are placed at the scene's start timestamp (``time`` field).
    Scenes whose LLM calls fail are skipped.

    Returns
    -------
    List of ``{"time", "question", "options", "answer"}`` dicts.
    """
    import asyncio
    from backend.services.ai_gateway_service import AIGatewayService

    svc = AIGatewayService()
    template = _QUIZ_PROMPT_ZH if lang == "zh" else _QUIZ_PROMPT_EN

    async def _gen_one(i: int, script: str, offset: float) -> Optional[dict]:
        prompt = template.format(script=script[:1500])
        try:
            raw = await svc.chat_with_provider(
                message=prompt,
                context={"system_override": "You are a quiz question generator. Reply in JSON only."},
                provider=provider,
            )
            obj = _parse_quiz_json(raw)
            if obj is None:
                logger.warning("Quiz gen for scene %d returned unparseable JSON", i)
                return None
            return {
                "time": offset,
                "question": obj["question"],
                "options": obj["options"],
                "answer": obj["answer"],
            }
        except Exception as exc:
            logger.warning("Quiz gen failed for scene %d: %s", i, exc)
            return None

    results = await asyncio.gather(*[
        _gen_one(i, scripts[i], offsets[i])
        for i in range(min(len(scenes), len(scripts), len(offsets)))
    ])
    return [r for r in results if r is not None]


# ── Persistence ───────────────────────────────────────────────────────────────

def save_quiz_data(
    work_dir: Path,
    chapters: list[dict],
    quiz_markers: list[dict],
) -> tuple[Path, Path]:
    """Write chapters.json and quiz_markers.json to *work_dir*.

    Returns
    -------
    ``(chapters_path, quiz_path)``
    """
    chapters_path = work_dir / "chapters.json"
    quiz_path = work_dir / "quiz_markers.json"
    chapters_path.write_text(json.dumps(chapters, ensure_ascii=False, indent=2))
    quiz_path.write_text(json.dumps(quiz_markers, ensure_ascii=False, indent=2))
    logger.info("Saved %d chapters + %d quiz markers to %s", len(chapters), len(quiz_markers), work_dir)
    return chapters_path, quiz_path
