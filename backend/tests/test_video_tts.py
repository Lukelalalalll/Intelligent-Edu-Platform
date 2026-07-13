from __future__ import annotations

from pathlib import Path

import pytest

from backend.services.video_service import tts


@pytest.mark.asyncio
async def test_scripts_to_audio_falls_back_to_cosyvoice_when_edge_tts_missing(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(tts, "_load_edge_tts", lambda: None)

    async def _fake_synth_cosyvoice(text: str, lang: str, out_path: Path, speaker=None):
        out_path.write_bytes(b"fake-mp3")
        return True

    monkeypatch.setattr(
        "backend.services.video_service.tts_cosyvoice.synth_cosyvoice",
        _fake_synth_cosyvoice,
    )

    audio_paths, srt_paths = await tts.scripts_to_audio(
        ["hello video"],
        tmp_path,
        lang="en",
        subtitles=False,
        tts_engine="edge_tts",
    )

    assert len(audio_paths) == 1
    assert audio_paths[0].exists()
    assert srt_paths == [None]
