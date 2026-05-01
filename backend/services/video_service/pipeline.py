"""Main video pipeline (runs as background task)."""
from __future__ import annotations

import asyncio
import functools
import logging
import os
from pathlib import Path
from typing import Literal, Optional

from .types import _tasks, VIDEO_DIR
from .extract import extract_text_from_pdf_by_page, extract_text_from_md_txt
from .script import generate_scripts, optimize_full_script
from .tts import scripts_to_audio
from .render import render_scene_slides, render_scene_slides_v2, get_slide_images
from .compose import _make_clip, _concat_video
from .brand import build_brand_assets
from .avatar import apply_avatar
from .quiz_generator import (
    compute_scene_offsets,
    generate_chapters,
    generate_quiz_markers,
    probe_duration,
    save_quiz_data,
)

logger = logging.getLogger(__name__)

SubtitleMode = Literal["hard_srt", "image_strip", "none"]


def _clip_semaphore(pair_count: int) -> asyncio.Semaphore:
    """Return a semaphore sized to prevent CPU/RAM exhaustion.

    - Base limit: min(4, cpu_count)
    - When segments > 10: cap at 2 to avoid thrashing
    """
    base = min(4, os.cpu_count() or 2)
    if pair_count > 10:
        base = min(base, 2)
    return asyncio.Semaphore(base)


async def _run_clip_with_sem(
    sem: asyncio.Semaphore,
    loop: asyncio.AbstractEventLoop,
    *args,
) -> None:
    async with sem:
        return await loop.run_in_executor(None, _make_clip, *args)


async def run_video_pipeline(
    task_id: str,
    lang: str = "zh",
    provider: str = "local_ollama",
    source_text: Optional[str] = None,
    uploaded_file_path: Optional[str] = None,
    file_type: Optional[str] = None,
    scripts_override: Optional[list[str]] = None,
    scenes: Optional[list[dict]] = None,
    subtitles: bool = True,
    subtitle_mode: SubtitleMode = "hard_srt",
    max_segments: int = 8,
    audience: str = "student",
    brand_kit: str = "none",
    animation_level: str = "basic",
    tts_engine: str = "edge_tts",
    avatar_mode: str = "none",
    avatar_img_path: Optional[str] = None,
    quiz_enabled: bool = False,
):
    """Run the full video generation pipeline.

    subtitle_mode controls where subtitles are rendered:
      "hard_srt"    — FFmpeg SRT burn-in only; slides rendered without strip  (default)
      "image_strip" — Pillow/HTML strip in slide image; no SRT burn-in
      "none"        — No subtitles at all

    brand_kit: "none" (no branding) | "default" (intro + outro + thumbnail)
    animation_level: "off" | "basic" (CSS polish) | "high" (animated webm per slide)
    tts_engine: "edge_tts" (default, always available) | "cosyvoice" (falls back to edge_tts)

    The legacy `subtitles` bool is kept for backwards compat:
      subtitles=False overrides subtitle_mode → "none"
    """
    # Backwards-compat: subtitles=False disables everything
    if not subtitles:
        subtitle_mode = "none"

    task = _tasks[task_id]
    work_dir = VIDEO_DIR / task_id
    work_dir.mkdir(parents=True, exist_ok=True)

    try:
        # ── Scene-based pipeline (V2) ───────────────────────────
        if scenes and len(scenes) > 0:
            task.update({"status": "running", "progress": 10, "message": "Processing scenes..."})
            scene_scripts = [s.get("script", "") for s in scenes]
            tone_modes = [s.get("toneMode", "lecture") for s in scenes]

            # TTS (concurrent) — always generate SRT; we decide below whether to use it
            generate_srt = subtitle_mode in ("hard_srt",)
            task.update({"progress": 25, "message": "Synthesizing voice (parallel)..."})
            audio_paths, srt_paths = await scripts_to_audio(
                scene_scripts, work_dir, lang, generate_srt, tone_modes, tts_engine,
            )

            # Render themed slides (Playwright HTML → fallback Pillow)
            # Pass subtitles=True only for image_strip mode
            render_with_strip = subtitle_mode == "image_strip"
            task.update({"progress": 50, "message": "Rendering themed slides..."})
            slide_paths = render_scene_slides_v2(
                scenes, work_dir, render_with_strip, animation_level,
            )

            # Detect animated-webm output (animation_level=high)
            slide_is_video = animation_level == "high" and bool(
                slide_paths and slide_paths[0].suffix == ".webm"
            )

            pair_count = min(len(slide_paths), len(audio_paths))
            slide_paths = slide_paths[:pair_count]
            audio_paths = audio_paths[:pair_count]

            # ── Brand kit: generate intro / outro / thumbnail (Phase 1.3) ──
            intro_path = outro_path = thumbnail_path = None
            if brand_kit != "none":
                task.update({"progress": 60, "message": "Generating brand assets..."})
                video_title = (
                    (scenes[0].get("slideTitle", "") if scenes else "")
                    or "Teaching Video"
                )
                first_slide = slide_paths[0] if slide_paths else None
                loop = asyncio.get_running_loop()
                intro_path, outro_path, thumbnail_path = await loop.run_in_executor(
                    None,
                    functools.partial(
                        build_brand_assets, brand_kit, video_title, first_slide, work_dir,
                    ),
                )
                if thumbnail_path:
                    task["thumbnailPath"] = f"generated/videos/{task_id}/thumbnail.jpg"

            # FFmpeg clips — semaphore-controlled concurrency
            task.update({"progress": 65, "message": f"Compositing {pair_count} clips..."})
            loop = asyncio.get_running_loop()
            sem = _clip_semaphore(pair_count)
            clip_jobs = [
                _run_clip_with_sem(
                    sem, loop,
                    slide_paths[i],
                    audio_paths[i],
                    work_dir / f"clip_{i:03d}.mp4",
                    # Only pass srt_path when using hard_srt mode
                    srt_paths[i] if (subtitle_mode == "hard_srt" and srt_paths and i < len(srt_paths)) else None,
                    slide_is_video,
                )
                for i in range(pair_count)
            ]
            results = await asyncio.gather(*clip_jobs, return_exceptions=True)

            # ── Structured error collection ──────────────────────
            clip_errors: list[dict] = []
            for i, r in enumerate(results):
                if isinstance(r, Exception):
                    reason = str(r)
                    logger.error("Clip %d failed: %s", i, reason)
                    clip_errors.append({
                        "clip_index": i,
                        "stage": "compose",
                        "reason": reason[:300],
                    })
            if clip_errors:
                task["errors"] = clip_errors
                logger.warning("Task %s: %d/%d clips failed", task_id, len(clip_errors), pair_count)

            # Skip any clips that failed to render
            clip_paths = [p for p in [work_dir / f"clip_{i:03d}.mp4" for i in range(pair_count)] if p.exists()]
            if not clip_paths:
                failed_reasons = "; ".join(e["reason"][:100] for e in clip_errors[:3])
                raise RuntimeError(
                    f"All {pair_count} clip(s) failed — stage=compose. "
                    f"First failure: {failed_reasons}"
                )

            # ── Prepend intro / append outro (Phase 1.3) ──────────────────
            if intro_path and intro_path.exists():
                clip_paths.insert(0, intro_path)
            if outro_path and outro_path.exists():
                clip_paths.append(outro_path)

            task.update({"progress": 88, "message": f"Merging {len(clip_paths)} clips..."})
            final_mp4 = VIDEO_DIR / f"{task_id}.mp4"
            await loop.run_in_executor(None, _concat_video, clip_paths, final_mp4)

            # ── Avatar overlay (Phase 3.1) ─────────────────────────────────
            if avatar_mode != "none" and avatar_img_path:
                task.update({"progress": 92, "message": "Applying avatar overlay..."})
                avatar_out = VIDEO_DIR / f"{task_id}_avatar.mp4"
                avatar_img = Path(avatar_img_path)
                ok = await loop.run_in_executor(
                    None,
                    functools.partial(apply_avatar, final_mp4, avatar_img, avatar_out, avatar_mode),
                )
                if ok and avatar_out.exists():
                    final_mp4 = avatar_out
                    logger.info("Avatar applied: %s", final_mp4)
                else:
                    logger.warning("Avatar overlay skipped/failed — keeping original video")

            # ── Quiz markers + chapter metadata (Phase 3.2) ───────────────
            if quiz_enabled and scenes:
                task.update({"progress": 95, "message": "Generating quiz markers..."})
                # Only scene clips (exclude brand intro/outro)
                scene_clip_paths = [
                    work_dir / f"clip_{i:03d}.mp4" for i in range(pair_count)
                    if (work_dir / f"clip_{i:03d}.mp4").exists()
                ]
                intro_dur = probe_duration(intro_path) if (intro_path and intro_path.exists()) else 0.0
                offsets = compute_scene_offsets(scene_clip_paths, intro_dur)
                chapters = generate_chapters(scenes[:pair_count], offsets)
                try:
                    quiz_markers = await generate_quiz_markers(
                        scenes[:pair_count],
                        scene_scripts[:pair_count],
                        offsets,
                        lang,
                        provider,
                    )
                except Exception:
                    logger.warning("Quiz generation failed — skipping quiz markers", exc_info=True)
                    quiz_markers = []
                chapters_path, quiz_path = save_quiz_data(work_dir, chapters, quiz_markers)
                task["chaptersPath"] = f"generated/videos/{task_id}/chapters.json"
                task["quizPath"] = f"generated/videos/{task_id}/quiz_markers.json"

            done_msg = "Video ready!"
            if clip_errors:
                done_msg = f"Video ready! ({len(clip_errors)} clip(s) skipped due to errors)"
            task.update({
                "status": "done", "progress": 100,
                "message": done_msg,
                "videoPath": f"generated/videos/{task_id}.mp4",
            })
            logger.info("Video pipeline (scenes) complete: %s (%d segments)", task_id, pair_count)
            return

        # ── Legacy pipeline (compat) ────────────────────────────
        task.update({"status": "running", "progress": 10, "message": "Extracting content..."})
        if uploaded_file_path:
            if file_type == "pdf":
                chunks = extract_text_from_pdf_by_page(uploaded_file_path)
            else:
                chunks = extract_text_from_md_txt(uploaded_file_path)
        elif source_text:
            chunks = await optimize_full_script(source_text, lang, provider, max_segments, audience)
        else:
            chunks = scripts_override or []

        if not chunks:
            task.update({"status": "error", "error": "No content extracted from input."})
            return

        task.update({"progress": 20, "message": f"Generating narration scripts with AI ({provider})..."})
        if scripts_override:
            scripts = scripts_override
        elif uploaded_file_path:
            scripts = await generate_scripts(chunks, lang, provider, audience)
        else:
            scripts = chunks

        task.update({"progress": 40, "message": "Synthesizing voice (parallel)..."})
        audio_paths, _ = await scripts_to_audio(scripts, work_dir, lang, False)

        task.update({"progress": 55, "message": "Rendering slides..."})
        slide_paths = get_slide_images(chunks, uploaded_file_path, file_type, work_dir)

        pair_count = min(len(slide_paths), len(audio_paths))
        slide_paths = slide_paths[:pair_count]
        audio_paths = audio_paths[:pair_count]

        task.update({"progress": 70, "message": f"Compositing {pair_count} clips in parallel..."})
        loop = asyncio.get_running_loop()
        sem = _clip_semaphore(pair_count)
        clip_jobs = [
            _run_clip_with_sem(
                sem, loop,
                slide_paths[i], audio_paths[i],
                work_dir / f"clip_{i:03d}.mp4",
                None,  # legacy pipeline never burns SRT
            )
            for i in range(pair_count)
        ]
        results = await asyncio.gather(*clip_jobs, return_exceptions=True)

        # ── Structured error collection ──────────────────────────
        clip_errors = []
        for i, r in enumerate(results):
            if isinstance(r, Exception):
                reason = str(r)
                logger.error("Clip %d failed: %s", i, reason)
                clip_errors.append({"clip_index": i, "stage": "compose", "reason": reason[:300]})
        if clip_errors:
            task["errors"] = clip_errors

        clip_paths = [p for p in [work_dir / f"clip_{i:03d}.mp4" for i in range(pair_count)] if p.exists()]
        if not clip_paths:
            failed_reasons = "; ".join(e["reason"][:100] for e in clip_errors[:3])
            raise RuntimeError(
                f"All {pair_count} clip(s) failed — stage=compose. "
                f"First failure: {failed_reasons}"
            )

        task.update({"progress": 88, "message": "Clips done, merging..."})
        task.update({"progress": 92, "message": "Merging final video..."})
        final_mp4 = VIDEO_DIR / f"{task_id}.mp4"
        await loop.run_in_executor(None, _concat_video, clip_paths, final_mp4)

        done_msg = "Video ready!"
        if clip_errors:
            done_msg = f"Video ready! ({len(clip_errors)} clip(s) skipped)"
        task.update({
            "status": "done", "progress": 100,
            "message": done_msg,
            "videoPath": f"generated/videos/{task_id}.mp4",
        })
        logger.info("Video pipeline complete: %s (%d segments)", task_id, pair_count)

    except Exception as exc:
        logger.exception("Video pipeline failed for task %s", task_id)
        task.update({"status": "error", "error": str(exc)})

