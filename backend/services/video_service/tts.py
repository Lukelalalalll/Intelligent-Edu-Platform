"""Step C — TTS synthesis (edge-tts, free, no API key)."""
from __future__ import annotations

import re
from pathlib import Path
from typing import Optional

from .types import TTS_VOICES, logger

# ── SSML prosody presets by tone mode ──
TONE_PROSODY: dict[str, dict[str, str]] = {
    "lecture":  {"rate": "-5%",  "pitch": "+0Hz",  "volume": "+0%"},
    "inspire":  {"rate": "+8%",  "pitch": "+2Hz",  "volume": "+5%"},
    "poetry":   {"rate": "-15%", "pitch": "-3Hz",  "volume": "-5%"},
}


def build_ssml(text: str, voice: str, tone_mode: str = "lecture") -> str:
    """Build an SSML document with prosody tags based on tone_mode.

    Adds sentence-level <break> tags after punctuation for more natural pauses,
    and wraps the whole text in a <prosody> envelope matching the tone.
    """
    prosody = TONE_PROSODY.get(tone_mode, TONE_PROSODY["lecture"])

    # Insert explicit SSML breaks after sentence-ending punctuation
    processed = text.strip()
    # Chinese sentence endings
    processed = re.sub(r'([。！？])\s*', r'\1<break time="350ms"/>', processed)
    # English sentence endings
    processed = re.sub(r'([.!?])\s+', r'\1<break time="300ms"/> ', processed)
    # Comma pauses
    processed = re.sub(r'([，,])\s*', r'\1<break time="150ms"/>', processed)

    # For "inspire" tone, wrap keywords (text in 【】 or *text*) with <emphasis>
    if tone_mode == "inspire":
        processed = re.sub(r'【(.+?)】', r'<emphasis level="strong">\1</emphasis>', processed)
        processed = re.sub(r'\*(.+?)\*', r'<emphasis level="moderate">\1</emphasis>', processed)

    ssml = (
        f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">'
        f'<voice name="{voice}">'
        f'<prosody rate="{prosody["rate"]}" pitch="{prosody["pitch"]}" volume="{prosody["volume"]}">'
        f'{processed}'
        f'</prosody></voice></speak>'
    )
    return ssml


def _fmt_srt(sec: float) -> str:
    """Format a float number of seconds as an SRT timestamp HH:MM:SS,mmm."""
    h = int(sec // 3600)
    m = int(sec % 3600 // 60)
    s = sec % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}".replace(".", ",")


def _events_to_srt(word_events: list[dict], srt_out: Path) -> None:
    """Convert edge-tts WordBoundary events to an SRT file."""
    if not word_events:
        return

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


async def synth_subtitles_only(script: str, voice: str, srt_out: Path) -> None:
    """Generate subtitles from edge-tts WordBoundary events without writing audio."""
    import edge_tts
    communicate = edge_tts.Communicate(script, voice)
    word_events: list[dict] = []

    async for event in communicate.stream():
        if event["type"] == "WordBoundary":
            word_events.append(event)

    _events_to_srt(word_events, srt_out)


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
    _events_to_srt(word_events, srt_out)


async def scripts_to_audio(
    scripts: list[str],
    work_dir: Path,
    lang: str = "zh",
    subtitles: bool = False,
    tone_modes: Optional[list[str]] = None,
    tts_engine: str = "edge_tts",
) -> tuple[list[Path], list[Optional[Path]]]:
    """Concurrently synthesise TTS for all segments.

    Returns ``(audio_paths, srt_paths)``.
    ``srt_paths`` entries are ``None`` when ``subtitles=False``.
    When ``tone_modes`` is provided, uses SSML with prosody for each segment.
    ``tts_engine`` can be ``"edge_tts"`` (default) or ``"cosyvoice"``
    (automatically falls back to edge_tts if CosyVoice is unavailable).
    """
    import asyncio
    import edge_tts
    from .tts_cosyvoice import synth_cosyvoice
    voice = TTS_VOICES.get(lang, TTS_VOICES["en"])

    async def _one(i: int, text: str) -> tuple[Path, Optional[Path]]:
        audio_out = work_dir / f"audio_{i:03d}.mp3"
        tone = (tone_modes[i] if tone_modes and i < len(tone_modes) else "lecture")

        # ── CosyVoice branch (with silent fallback) ──────────────────────
        if tts_engine == "cosyvoice":
            ok = await synth_cosyvoice(text, lang, audio_out)
            if ok:
                # CosyVoice has no WordBoundary events; generate SRT via re-synthesis
                # with edge-tts only when subtitles are requested. Keep CosyVoice audio.
                if subtitles:
                    srt_out = work_dir / f"sub_{i:03d}.srt"
                    try:
                        await synth_subtitles_only(text, voice, srt_out)
                    except Exception:
                        pass
                    return audio_out, srt_out if subtitles else None
                return audio_out, None
            # CosyVoice failed → fall through to edge-tts below
            logger.info("Segment %d: falling back to edge-tts", i)

        # ── edge-tts branch (default) ─────────────────────────────────────
        if subtitles:
            srt_out = work_dir / f"sub_{i:03d}.srt"
            try:
                await synth_with_subtitles(text, voice, audio_out, srt_out)
            except Exception:
                logger.warning("SSML TTS failed for segment %d, falling back to plain text", i)
                await synth_with_subtitles(text, voice, audio_out, srt_out)
            return audio_out, srt_out

        # Non-subtitle mode: try SSML, fall back to plain text
        try:
            ssml = build_ssml(text, voice, tone)
            communicate = edge_tts.Communicate(ssml, voice)
            await communicate.save(str(audio_out))
        except Exception:
            logger.warning("SSML TTS failed for segment %d, falling back to plain text", i)
            await edge_tts.Communicate(text, voice).save(str(audio_out))
        return audio_out, None

    results = list(await asyncio.gather(*[_one(i, s) for i, s in enumerate(scripts)]))
    audio_paths = [r[0] for r in results]
    srt_paths: list[Optional[Path]] = [r[1] for r in results]
    return audio_paths, srt_paths
