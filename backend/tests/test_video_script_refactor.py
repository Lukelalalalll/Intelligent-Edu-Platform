from __future__ import annotations

import pytest

from backend.services.video_service.script import (
    _parse_json_object,
    optimize_full_script,
    smart_extract,
)


def test_parse_json_object_repairs_invalid_escapes():
    parsed = _parse_json_object(
        'preface {"title":"Regex","pattern":"\\d+","bullets":["A","B"]} trailing'
    )

    assert parsed == {
        "title": "Regex",
        "pattern": r"\d+",
        "bullets": ["A", "B"],
    }


@pytest.mark.asyncio
async def test_optimize_full_script_normalizes_mixed_segment_shapes(monkeypatch):
    async def _fake_call_ai(prompt: str, provider: str = "local_ollama", **kwargs) -> str:
        assert "teaching video" in prompt
        return '[{"text":"Alpha"}, {"segment":"Beta"}, "Gamma"]'

    monkeypatch.setattr(
        "backend.services.video_service.script_support.segmentation.call_ai",
        _fake_call_ai,
    )

    segments = await optimize_full_script(
        "Paragraph one.\n\nParagraph two.",
        lang="en",
        max_segments=3,
    )

    assert segments == ["Alpha", "Beta", "Gamma"]


@pytest.mark.asyncio
async def test_optimize_full_script_expands_short_seed_into_multiple_segments(monkeypatch):
    async def _fake_call_ai(prompt: str, provider: str = "local_ollama", **kwargs) -> str:
        assert "brief seed prompt" in prompt
        return '["Opening campus overview", "Student life in motion", "Academic focus in classrooms", "Closing impression of the university"]'

    monkeypatch.setattr(
        "backend.services.video_service.script_support.segmentation.call_ai",
        _fake_call_ai,
    )

    segments = await optimize_full_script(
        "generate a university scene",
        lang="en",
        max_segments=8,
    )

    assert len(segments) == 4
    assert segments[0] == "Opening campus overview"


@pytest.mark.asyncio
async def test_optimize_full_script_uses_multiscene_fallback_when_seed_returns_one_segment(monkeypatch):
    async def _fake_call_ai(prompt: str, provider: str = "local_ollama", **kwargs) -> str:
        return '["generate a university scene"]'

    monkeypatch.setattr(
        "backend.services.video_service.script_support.segmentation.call_ai",
        _fake_call_ai,
    )

    segments = await optimize_full_script(
        "generate a university scene",
        lang="en",
        max_segments=8,
    )

    assert len(segments) >= 3
    assert any("Open the video" in segment for segment in segments)


@pytest.mark.asyncio
async def test_smart_extract_applies_planned_arc(monkeypatch):
    async def _fake_optimize(*args, **kwargs):
        return ["Intro segment", "Closing segment"]

    async def _fake_arc(*args, **kwargs):
        return {
            "opening_hook": "Hook",
            "segments": [{"index": 1, "transition": "Next", "role": "close"}],
            "closing_cta": "CTA",
        }

    monkeypatch.setattr(
        "backend.services.video_service.script_support.extract_orchestration.optimize_full_script",
        _fake_optimize,
    )
    monkeypatch.setattr(
        "backend.services.video_service.script_support.extract_orchestration.plan_narrative_arc",
        _fake_arc,
    )

    segments = await smart_extract(text="raw text", lang="en")

    assert segments == ["Hook — Intro segment", "Next — Closing segment — CTA"]
