"""Step E — FFmpeg compositing with cinematic effects."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from .types import logger


def _make_clip(
    img_path: Path,
    audio_path: Path,
    out_path: Path,
    srt_path: Optional[Path] = None,
) -> None:
    """Compose one slide image + audio into an MP4 clip.

    Enhancements over base version:
    - Ken Burns zoompan effect (slow zoom-in over the duration)
    - Fade-in/fade-out on both video and audio
    - SRT subtitle overlay via drawtext (if srt_path provided)
    """
    import ffmpeg as ffmpeg_lib
    probe = ffmpeg_lib.probe(str(audio_path))
    duration = float(probe["format"]["duration"]) + 0.5
    fps = 24

    # Build video input: loop the slide image at 24fps
    video = (
        ffmpeg_lib
        .input(str(img_path), loop=1, t=duration, framerate=fps)
    )

    # Ken Burns: slow zoom from 100% → 108% over the clip duration
    total_frames = int(duration * fps)
    zoom_expr = f"min(zoom+0.0003,1.08)"
    video = video.filter(
        "zoompan",
        z=zoom_expr,
        d=total_frames,
        x="iw/2-(iw/zoom/2)",
        y="ih/2-(ih/zoom/2)",
        s="1920x1080",
        fps=fps,
    )

    # Ensure even dimensions for h264
    video = video.filter("scale", "trunc(iw/2)*2", "trunc(ih/2)*2")

    # Fade in (first 0.8s) and fade out (last 0.8s)
    fade_dur = 0.8
    fade_out_start = max(0, duration - fade_dur)
    video = video.filter("fade", type="in", start_time=0, duration=fade_dur)
    video = video.filter("fade", type="out", start_time=fade_out_start, duration=fade_dur)

    # SRT subtitle overlay via drawtext
    if srt_path and srt_path.exists():
        video = video.filter(
            "subtitles",
            str(srt_path),
            force_style="FontSize=28,PrimaryColour=&HFFFFFF&,"
                        "OutlineColour=&H40000000&,BorderStyle=4,"
                        "BackColour=&HB0000000&,Outline=1,"
                        "MarginV=30,Alignment=2",
        )

    # Audio with fade
    audio = ffmpeg_lib.input(str(audio_path))
    audio = audio.filter("afade", type="in", start_time=0, duration=0.3)
    audio = audio.filter("afade", type="out", start_time=max(0, duration - 0.6), duration=0.5)

    (
        video
        .output(
            audio,
            str(out_path),
            vcodec="libx264", acodec="aac",
            pix_fmt="yuv420p", shortest=None,
            loglevel="error",
        )
        .overwrite_output()
        .run()
    )


def _concat_video(clip_paths: list[Path], final_path: Path, bgm_path: Optional[Path] = None):
    """Concatenate clips into final video, optionally mixing in background music."""
    import ffmpeg as ffmpeg_lib

    list_file = final_path.parent / "concat_list.txt"
    list_file.write_text("\n".join(f"file '{p}'" for p in clip_paths))

    if bgm_path and bgm_path.exists():
        # Two-pass: concat then mix BGM at low volume
        concat_tmp = final_path.parent / "concat_tmp.mp4"
        (
            ffmpeg_lib
            .input(str(list_file), format="concat", safe=0)
            .output(str(concat_tmp), c="copy", loglevel="error")
            .overwrite_output()
            .run()
        )

        # Probe video duration for BGM looping
        probe = ffmpeg_lib.probe(str(concat_tmp))
        vid_dur = float(probe["format"]["duration"])

        vid = ffmpeg_lib.input(str(concat_tmp))
        bgm = ffmpeg_lib.input(str(bgm_path), stream_loop=-1, t=vid_dur)
        bgm = bgm.filter("volume", 0.10)  # BGM at 10% volume

        (
            ffmpeg_lib
            .output(
                vid.video, vid.audio, bgm,
                str(final_path),
                vcodec="copy",
                filter_complex="[1:a][2:a]amix=inputs=2:duration=first:dropout_transition=2[aout]",
                map=["0:v", "[aout]"],
                loglevel="error",
            )
            .overwrite_output()
            .run()
        )
        concat_tmp.unlink(missing_ok=True)
    else:
        (
            ffmpeg_lib
            .input(str(list_file), format="concat", safe=0)
            .output(str(final_path), c="copy", loglevel="error")
            .overwrite_output()
            .run()
        )

    list_file.unlink(missing_ok=True)
