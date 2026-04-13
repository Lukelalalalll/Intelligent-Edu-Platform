"""Main video pipeline (runs as background task)."""
from __future__ import annotations

import asyncio
import logging
from typing import Optional

from .types import _tasks, VIDEO_DIR
from .extract import extract_text_from_pdf_by_page, extract_text_from_md_txt
from .script import generate_scripts, optimize_full_script
from .tts import scripts_to_audio
from .render import render_scene_slides, render_scene_slides_v2, get_slide_images
from .compose import _make_clip, _concat_video

logger = logging.getLogger(__name__)


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
    max_segments: int = 8,
    audience: str = "student",
):
    task = _tasks[task_id]
    work_dir = VIDEO_DIR / task_id
    work_dir.mkdir(parents=True, exist_ok=True)

    try:
        # ── Scene-based pipeline (V2) ───────────────────────────
        if scenes and len(scenes) > 0:
            task.update({"status": "running", "progress": 10, "message": "Processing scenes..."})
            scene_scripts = [s.get("script", "") for s in scenes]
            tone_modes = [s.get("toneMode", "lecture") for s in scenes]

            # TTS (concurrent) — with SSML prosody and subtitles
            task.update({"progress": 25, "message": "Synthesizing voice (parallel)..."})
            audio_paths, srt_paths = await scripts_to_audio(
                scene_scripts, work_dir, lang, subtitles, tone_modes,
            )

            # Render themed slides (Playwright HTML → fallback Pillow)
            task.update({"progress": 50, "message": "Rendering themed slides..."})
            slide_paths = render_scene_slides_v2(scenes, work_dir, subtitles)

            pair_count = min(len(slide_paths), len(audio_paths))
            slide_paths = slide_paths[:pair_count]
            audio_paths = audio_paths[:pair_count]

            # FFmpeg clips (concurrent) — scale+fade (no slow zoompan)
            task.update({"progress": 65, "message": f"Compositing {pair_count} clips..."})
            loop = asyncio.get_running_loop()
            clip_jobs = [
                loop.run_in_executor(
                    None, _make_clip,
                    slide_paths[i], audio_paths[i],
                    work_dir / f"clip_{i:03d}.mp4",
                    srt_paths[i] if srt_paths and i < len(srt_paths) else None,
                )
                for i in range(pair_count)
            ]
            results = await asyncio.gather(*clip_jobs, return_exceptions=True)
            for i, r in enumerate(results):
                if isinstance(r, Exception):
                    logger.error("Clip %d failed: %s", i, r)
            task.update({"progress": 88, "message": "Merging..."})
            clip_paths = [work_dir / f"clip_{i:03d}.mp4" for i in range(pair_count)]

            # Skip any clips that failed to render
            clip_paths = [p for p in [work_dir / f"clip_{i:03d}.mp4" for i in range(pair_count)] if p.exists()]
            if not clip_paths:
                raise RuntimeError("All clip compositing jobs failed — check ffmpeg logs above")
            final_mp4 = VIDEO_DIR / f"{task_id}.mp4"
            await loop.run_in_executor(None, _concat_video, clip_paths, final_mp4)

            task.update({
                "status": "done", "progress": 100,
                "message": "Video ready!",
                "videoPath": f"generated/videos/{task_id}.mp4",
            })
            logger.info("Video pipeline (scenes) complete: %s (%d segments)", task_id, pair_count)
            return

        # ── Legacy pipeline (compat) ────────────────────────────
        # 1. Extract content chunks
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

        # 2. Generate narration scripts
        task.update({"progress": 20, "message": f"Generating narration scripts with AI ({provider})..."})
        if scripts_override:
            scripts = scripts_override
        elif uploaded_file_path:
            scripts = await generate_scripts(chunks, lang, provider, audience)
        else:
            scripts = chunks

        # 3. TTS synthesis
        task.update({"progress": 40, "message": "Synthesizing voice (parallel)..."})
        audio_paths, _ = await scripts_to_audio(scripts, work_dir, lang, False)

        # 4. Generate slide images
        task.update({"progress": 55, "message": "Rendering slides..."})
        slide_paths = get_slide_images(
            chunks, uploaded_file_path, file_type, work_dir,
        )

        pair_count = min(len(slide_paths), len(audio_paths))
        slide_paths = slide_paths[:pair_count]
        audio_paths = audio_paths[:pair_count]

        # 5. Compose all clips concurrently
        task.update({"progress": 70, "message": f"Compositing {pair_count} clips in parallel..."})
        loop = asyncio.get_running_loop()
        clip_jobs = [
            loop.run_in_executor(
                None, _make_clip,
                slide_paths[i], audio_paths[i],
                work_dir / f"clip_{i:03d}.mp4",
            )
            for i in range(pair_count)
        ]
        results = await asyncio.gather(*clip_jobs, return_exceptions=True)
        for i, r in enumerate(results):
            if isinstance(r, Exception):
                logger.error("Clip %d failed: %s", i, r)
        task.update({"progress": 88, "message": "Clips done, merging..."})
        clip_paths = [work_dir / f"clip_{i:03d}.mp4" for i in range(pair_count)]

        # 6. Concatenate all clips
        task.update({"progress": 92, "message": "Merging final video..."})
        final_mp4 = VIDEO_DIR / f"{task_id}.mp4"
        await loop.run_in_executor(None, _concat_video, clip_paths, final_mp4)

        task.update({
            "status": "done",
            "progress": 100,
            "message": "Video ready!",
            "videoPath": f"generated/videos/{task_id}.mp4",
        })
        logger.info("Video pipeline complete: %s (%d segments)", task_id, pair_count)

    except Exception as exc:
        logger.exception("Video pipeline failed for task %s", task_id)
        task.update({"status": "error", "error": str(exc)})
