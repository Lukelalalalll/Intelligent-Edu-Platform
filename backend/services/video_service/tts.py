"""Step C — TTS synthesis (edge-tts, free, no API key)."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from .types import TTS_VOICES


def _fmt_srt(sec: float) -> str:
    """Format a float number of seconds as an SRT timestamp HH:MM:SS,mmm."""
    h = int(sec // 3600)
    m = int(sec % 3600 // 60)
    s = sec % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}".replace(".", ",")


async def synth_with_subtitles(script: str, voice: str, audio_out: Path, srt_out: Path) -> None:
    """TTS via edge-tts streaming.

    Collects WordBoundary events to produce a per-segment SRT subtitle file.
    Groups tokens into lines capped at 15 CJK chars / 8 Latin words / 3 seconds.
    """
    import edge_tts
    communicate = edge_tts.Communicate(script, voice)
    word_events: list[dict] = []
    audio_chunks: list[bytes] = []

    async for event in communicate.stream():
        if event["type"] == "audio":
            audio_chunks.append(event["data"])
        elif event["type"] == "WordBoundary":
            word_events.append(event)

    audio_out.write_bytes(b"".join(audio_chunks))

    if not word_events:
        return  # No timing data available — skip SRT

    lines: list[tuple[float, float, str]] = []
    window_tokens: list[str] = []
    window_start: float = 0.0
    window_end: float = 0.0

    for w in word_events:
        offset_sec = w["offset"] / 10_000_000
        end_sec = (w["offset"] + w["duration"]) / 10_000_000
        if not window_tokens:
            window_start = offset_sec
        window_tokens.append(w["text"])
        window_end = end_sec
        joined_so_far = "".join(window_tokens)
        is_cjk = any("\u4e00" <= c <= "\u9fff" for c in joined_so_far)
        max_tokens = 15 if is_cjk else 8
        if len(window_tokens) >= max_tokens or (end_sec - window_start) >= 3.0:
            text = joined_so_far if is_cjk else " ".join(window_tokens)
            lines.append((window_start, window_end, text))
            window_tokens = []

    if window_tokens:
        joined = "".join(window_tokens)
        is_cjk = any("\u4e00" <= c <= "\u9fff" for c in joined)
        lines.append((window_start, window_end, joined if is_cjk else " ".join(window_tokens)))

    with open(srt_out, "w", encoding="utf-8") as f:
        for idx, (start, end, text) in enumerate(lines, 1):
            f.write(f"{idx}\n{_fmt_srt(start)} --> {_fmt_srt(end)}\n{text}\n\n")


async def scripts_to_audio(
    scripts: list[str],
    work_dir: Path,
    lang: str = "zh",
    subtitles: bool = False,
) -> tuple[list[Path], list[Optional[Path]]]:
    """Concurrently synthesise TTS for all segments.

    Returns ``(audio_paths, srt_paths)``.
    ``srt_paths`` entries are ``None`` when ``subtitles=False``.
    """
    import asyncio
    import edge_tts
    voice = TTS_VOICES.get(lang, TTS_VOICES["en"])

    async def _one(i: int, text: str) -> tuple[Path, Optional[Path]]:
        audio_out = work_dir / f"audio_{i:03d}.mp3"
        if subtitles:
            srt_out = work_dir / f"sub_{i:03d}.srt"
            await synth_with_subtitles(text, voice, audio_out, srt_out)
            return audio_out, srt_out
        await edge_tts.Communicate(text, voice).save(str(audio_out))
        return audio_out, None

    results = list(await asyncio.gather(*[_one(i, s) for i, s in enumerate(scripts)]))
    audio_paths = [r[0] for r in results]
    srt_paths: list[Optional[Path]] = [r[1] for r in results]
    return audio_paths, srt_paths
