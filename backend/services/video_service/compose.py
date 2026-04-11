"""Step E — FFmpeg compositing."""
from __future__ import annotations

from pathlib import Path


def _make_clip(
    img_path: Path,
    audio_path: Path,
    out_path: Path,
) -> None:
    """Compose one slide image + audio into an MP4 clip.

    Subtitles are already burnt into the slide PNG by Pillow, so ffmpeg
    only needs basic image→video + audio muxing (no libass required).
    """
    import ffmpeg as ffmpeg_lib
    probe = ffmpeg_lib.probe(str(audio_path))
    duration = float(probe["format"]["duration"]) + 0.5
    video = (
        ffmpeg_lib
        .input(str(img_path), loop=1, t=duration, framerate=1)
        .filter("scale", "trunc(iw/2)*2", "trunc(ih/2)*2")
    )
    (
        video
        .output(
            ffmpeg_lib.input(str(audio_path)),
            str(out_path),
            vcodec="libx264", acodec="aac",
            pix_fmt="yuv420p", shortest=None,
            loglevel="error",
        )
        .overwrite_output()
        .run()
    )


def _concat_video(clip_paths: list[Path], final_path: Path):
    import ffmpeg as ffmpeg_lib
    list_file = final_path.parent / "concat_list.txt"
    list_file.write_text("\n".join(f"file '{p}'" for p in clip_paths))
    (
        ffmpeg_lib
        .input(str(list_file), format="concat", safe=0)
        .output(str(final_path), c="copy", loglevel="error")
        .overwrite_output()
        .run()
    )
    list_file.unlink(missing_ok=True)
