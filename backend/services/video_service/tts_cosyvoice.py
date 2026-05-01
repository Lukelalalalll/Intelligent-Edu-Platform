"""Phase 2.2 — CosyVoice TTS adapter.

Strategy:
  1. Check if a local CosyVoice-WebUI HTTP API is reachable
     (default: http://localhost:50000 — standard CosyVoice-WebUI port).
  2. If reachable, POST the text and stream back PCM/WAV, convert to MP3 with FFmpeg.
  3. On ANY failure (import error, network, model error), return False so the
     caller can fall back to edge-tts silently.

The caller (tts.py) never raises; it only checks the boolean return value.
"""
from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Optional

from .types import logger

# Local CosyVoice-WebUI API endpoint (user-configurable via env var)
import os
_COSYVOICE_API = os.getenv("COSYVOICE_API_URL", "http://127.0.0.1:50000")

# CosyVoice voice model names (Chinese/English)
_COSY_VOICES: dict[str, str] = {
    "zh": "中文女",
    "en": "English Female",
}

_AVAILABLE: Optional[bool] = None  # cached probe result


def is_cosyvoice_available() -> bool:
    """Return True if the local CosyVoice API is reachable (cached after first call)."""
    global _AVAILABLE
    if _AVAILABLE is not None:
        return _AVAILABLE
    try:
        from backend.core.safe_requests import safe_get
        resp = safe_get(f"{_COSYVOICE_API}/", timeout=2)
        _AVAILABLE = resp.status_code < 500
    except Exception:
        _AVAILABLE = False
    logger.info("CosyVoice availability: %s (endpoint: %s)", _AVAILABLE, _COSYVOICE_API)
    return _AVAILABLE


def _wav_bytes_to_mp3(wav_bytes: bytes, out_path: Path) -> None:
    """Convert raw WAV bytes to MP3 using FFmpeg via stdin pipe."""
    result = subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "wav", "-i", "pipe:0",
            "-c:a", "libmp3lame", "-b:a", "128k", "-ar", "44100",
            "-loglevel", "error",
            str(out_path),
        ],
        input=wav_bytes,
        capture_output=True,
        timeout=60,
    )
    if result.returncode != 0:
        raise RuntimeError(f"WAV→MP3 conversion failed: {result.stderr[:400]}")


async def synth_cosyvoice(
    text: str,
    lang: str,
    out_path: Path,
    speaker: Optional[str] = None,
) -> bool:
    """Try to synthesise `text` with CosyVoice and write MP3 to `out_path`.

    Returns True on success, False on any failure (caller should fall back).
    Does NOT raise.
    """
    if not is_cosyvoice_available():
        return False

    voice = speaker or _COSY_VOICES.get(lang, _COSY_VOICES["zh"])

    try:
        import asyncio
        import httpx

        payload = {
            "tts_text": text,
            "spk_id": voice,
            "speed": 1.0,
        }

        loop = asyncio.get_running_loop()

        def _post() -> bytes:
            with httpx.Client(timeout=120) as client:
                resp = client.post(
                    f"{_COSYVOICE_API}/inference_sft",
                    json=payload,
                    headers={"Accept": "audio/wav"},
                )
                resp.raise_for_status()
                return resp.content

        wav_bytes = await loop.run_in_executor(None, _post)

        if len(wav_bytes) < 1000:
            logger.warning("CosyVoice returned suspiciously small audio (%d bytes)", len(wav_bytes))
            return False

        await loop.run_in_executor(None, _wav_bytes_to_mp3, wav_bytes, out_path)
        logger.info("CosyVoice synthesis OK: %s (%d bytes)", out_path.name, len(wav_bytes))
        return True

    except Exception as exc:
        logger.warning("CosyVoice synthesis failed (%s), caller will fall back to edge-tts", exc)
        return False
