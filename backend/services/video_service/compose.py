"""Step E — FFmpeg compositing."""
from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Optional

from .types import logger

# Per-clip timeout in seconds.  Even a 60-second clip should encode in < 2 min.
_CLIP_TIMEOUT = 300


def _probe_duration(audio_path: Path) -> float:
    """Return audio duration (seconds) via ffprobe."""
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(audio_path),
        ],
        capture_output=True, text=True, timeout=30,
    )
    try:
        return float(result.stdout.strip()) + 0.5
    except ValueError:
        return 5.0  # safe fallback


def _make_clip(
    img_path: Path,
    audio_path: Path,
    out_path: Path,
    srt_path: Optional[Path] = None,
    slide_is_video: bool = False,
) -> None:
    """Compose one slide image (or animated webm) + audio into an MP4 clip.

    slide_is_video=True  — img_path is a short animated .webm (Phase 2.1 high).
      The animation plays once, then the last frame is held for the remainder
      of the audio duration.
    slide_is_video=False — img_path is a static PNG (default behaviour).
    """
    duration = _probe_duration(audio_path)
    fade_dur = 0.8
    fade_out_start = max(0.0, duration - fade_dur)

    # Shared audio fade filter
    af = (
        f"afade=type=in:start_time=0:duration=0.3,"
        f"afade=type=out:start_time={max(0.0, duration - 0.6):.3f}:duration=0.5"
    )

    # ── Animated-video branch (Phase 2.1 high) ───────────────────────────────
    if slide_is_video:
        # Probe webm duration so we know how long to freeze the last frame
        probe = subprocess.run(
            ["ffprobe", "-v", "error",
             "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1",
             str(img_path)],
            capture_output=True, text=True, timeout=30,
        )
        try:
            webm_dur = float(probe.stdout.strip())
        except ValueError:
            webm_dur = 1.4

        hold_dur = max(0.0, duration - webm_dur)

        vf_chain = (
            f"tpad=stop_mode=clone:stop_duration={hold_dur:.3f},"
            f"fade=type=out:start_time={fade_out_start:.3f}:duration={fade_dur}"
        )
        if srt_path and srt_path.exists():
            srt_escaped = str(srt_path).replace("'", "\\'").replace(":", "\\:")
            vf_chain += (
                f",subtitles='{srt_escaped}':"
                "force_style='FontSize=28,PrimaryColour=&HFFFFFF&,"
                "OutlineColour=&H40000000&,BorderStyle=4,"
                "BackColour=&HB0000000&,Outline=1,"
                "MarginV=30,Alignment=2'"
            )

        cmd = [
            "ffmpeg", "-y",
            "-i", str(img_path),
            "-i", str(audio_path),
            "-filter_complex", f"[0:v]{vf_chain}[vout]",
            "-map", "[vout]",
            "-map", "1:a",
            "-af", af,
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
            "-pix_fmt", "yuv420p",
            "-shortest",
            "-movflags", "+faststart",
            "-loglevel", "error",
            str(out_path),
        ]
        logger.debug("Compositing animated clip: %s", out_path.name)
        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=_CLIP_TIMEOUT,
            )
            if result.returncode != 0:
                raise RuntimeError(
                    f"ffmpeg error for {out_path.name} (exit {result.returncode}): "
                    f"{result.stderr[:800]}"
                )
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(
                f"ffmpeg timed out after {_CLIP_TIMEOUT}s compositing {out_path.name}"
            ) from exc
        return

    # ── Static-image branch (default) ────────────────────────────────────────
    # Build video filter chain — no zoompan
    vf_parts = [
        # Scale to fill 1920x1080, preserve aspect ratio, black padding
        "scale=1920:1080:force_original_aspect_ratio=decrease,"
        "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1",
        # Ensure even dimensions required by libx264
        "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        # Fade in / out
        f"fade=type=in:start_time=0:duration={fade_dur}",
        f"fade=type=out:start_time={fade_out_start:.3f}:duration={fade_dur}",
    ]

    # SRT subtitle burn-in
    if srt_path and srt_path.exists():
        srt_escaped = str(srt_path).replace("'", "\\'").replace(":", "\\:")
        vf_parts.append(
            f"subtitles='{srt_escaped}':"
            "force_style='FontSize=28,PrimaryColour=&HFFFFFF&,"
            "OutlineColour=&H40000000&,BorderStyle=4,"
            "BackColour=&HB0000000&,Outline=1,"
            "MarginV=30,Alignment=2'"
        )

    vf = ",".join(vf_parts)

    cmd = [
        "ffmpeg", "-y",
        "-loop", "1", "-framerate", "24",
        "-t", f"{duration:.3f}",
        "-i", str(img_path),
        "-i", str(audio_path),
        "-vf", vf,
        "-af", af,
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
        "-pix_fmt", "yuv420p",
        "-shortest",
        "-movflags", "+faststart",
        "-loglevel", "error",
        str(out_path),
    ]

    logger.debug("Compositing clip: %s", out_path.name)
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=_CLIP_TIMEOUT,
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"ffmpeg error for {out_path.name} (exit {result.returncode}): "
                f"{result.stderr[:800]}"
            )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(
            f"ffmpeg timed out after {_CLIP_TIMEOUT}s compositing {out_path.name}"
        ) from exc


def _concat_video(
    clip_paths: list[Path],
    final_path: Path,
    bgm_path: Optional[Path] = None,
) -> None:
    """Concatenate MP4 clips into the final video via an ffmpeg concat demuxer."""
    list_file = final_path.parent / "concat_list.txt"
    list_file.write_text("\n".join(f"file '{p}'" for p in clip_paths))

    if bgm_path and bgm_path.exists():
        # ── Two-pass: concat first, then mix BGM ──
        concat_tmp = final_path.parent / "concat_tmp.mp4"

        subprocess.run(
            [
                "ffmpeg", "-y",
                "-f", "concat", "-safe", "0",
                "-i", str(list_file),
                "-c", "copy",
                "-loglevel", "error",
                str(concat_tmp),
            ],
            check=True, capture_output=True, text=True, timeout=600,
        )

        # Probe duration for BGM loop truncation
        probe = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                str(concat_tmp),
            ],
            capture_output=True, text=True, timeout=30,
        )
        try:
            vid_dur = float(probe.stdout.strip())
        except ValueError:
            vid_dur = 600.0

        subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", str(concat_tmp),
                "-stream_loop", "-1", "-t", f"{vid_dur:.3f}", "-i", str(bgm_path),
                "-filter_complex",
                "[1:a]volume=0.10[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]",
                "-map", "0:v", "-map", "[aout]",
                "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                "-loglevel", "error",
                str(final_path),
            ],
            check=True, capture_output=True, text=True, timeout=600,
        )
        concat_tmp.unlink(missing_ok=True)
    else:
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-f", "concat", "-safe", "0",
                "-i", str(list_file),
                "-c", "copy",
                "-loglevel", "error",
                str(final_path),
            ],
            check=True, capture_output=True, text=True, timeout=600,
        )

    list_file.unlink(missing_ok=True)
