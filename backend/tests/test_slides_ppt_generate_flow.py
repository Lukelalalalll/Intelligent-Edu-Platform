from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.responses import Response


class _FakeEditorSession:
    _sessions = {}

    def __init__(self, *, session_id: str, theme_id: str, pptx_bytes: bytes):
        self.session_id = session_id
        self.theme_id = theme_id
        self._pptx_bytes = pptx_bytes
        self._slide_pngs = [b"png-slide-1", b"png-slide-2"]
        self.slide_count = 2
        self._edits = {}

    @classmethod
    def _load_template_bytes(cls, theme_id: str) -> bytes:
        return b"template"

    @classmethod
    def create_session(cls, *, pptx_bytes: bytes, theme_id: str, slide_lookup_table: dict):
        session = cls(session_id="session-1", theme_id=theme_id, pptx_bytes=pptx_bytes)
        cls._sessions[session.session_id] = session
        return session

    @classmethod
    def get_session(cls, session_id: str):
        return cls._sessions.get(session_id)

    def get_slide_png(self, slide_index: int):
        return self._slide_pngs[slide_index - 1]

    def get_pptx_bytes(self):
        return self._pptx_bytes


@pytest.mark.asyncio
async def test_editor_auto_assign_render_session_and_export_contract(monkeypatch, tmp_path):
    from backend.routes.slides_routes import editor

    monkeypatch.setattr(editor.Config, "PPT_RESULTS_FOLDER", str(tmp_path))
    monkeypatch.setattr(editor, "EditorSession", _FakeEditorSession)

    def fake_create_ppt(schema):
        assert schema["theme"] == "Dark"
        assert schema["slides"][0]["layout"]["name"] == "Title and Content"
        filename = "presentation_test.pptx"
        (tmp_path / filename).write_bytes(b"fake-pptx-bytes")
        return filename

    monkeypatch.setattr(editor, "create_ppt", fake_create_ppt)

    ppt_schema = {
        "presentation_title": "Demo",
        "slides": [{"title": "One", "content": ["A"]}, {"title": "Two", "content": ["B"]}],
    }
    assigned = await editor.auto_assign_layouts(
        editor.AutoAssignLayoutsRequest(provider="local_ollama", theme="Dark", ppt_schema=ppt_schema),
        user={"id": "u1"},
    )
    assert assigned == {"ppt_schema": ppt_schema}

    session = await editor.render_editor_session(
        editor.RenderEditorSessionRequest(theme="Dark", ppt_schema=ppt_schema),
        user={"id": "u1"},
    )
    assert session["session_id"] == "session-1"
    assert session["theme"] == "Dark"
    assert session["slides"][0]["index"] == 0
    assert session["slides"][0]["preview_url"] == "/api/slides/editor/sessions/session-1/slides/1.png"

    rerendered = await editor.re_render_session(
        editor.ReRenderSessionRequest(session_id="session-1", edits=[{"element_id": "x"}]),
        user={"id": "u1"},
    )
    assert rerendered["session_id"] == "session-1"

    exported = await editor.export_pptx_post(
        editor.ExportPptxRequest(session_id="session-1"),
        user={"id": "u1"},
    )
    assert isinstance(exported, Response)
    assert exported.body == b"fake-pptx-bytes"
    assert exported.media_type == "application/vnd.openxmlformats-officedocument.presentationml.presentation"


def test_generate_v2_pptx_export_is_written_to_deck_manifest(monkeypatch, tmp_path):
    from backend.routes.slides_routes import delivery

    monkeypatch.setattr(delivery.Config, "PPT_RESULTS_FOLDER", str(tmp_path))
    deck_dir = tmp_path / "svg_decks" / "deck-1"
    deck_dir.mkdir(parents=True)
    manifest = {
        "deck_id": "deck-1",
        "title": "Demo",
        "slides": [],
        "exports": {},
    }
    (deck_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")

    exports = delivery._attach_pptx_export(manifest, "presentation_test.pptx")

    assert exports["pptx"]["download_url"] == "/api/slides/download_ppt/presentation_test.pptx"
    persisted = json.loads((deck_dir / "manifest.json").read_text(encoding="utf-8"))
    assert persisted["exports"]["pptx"]["filename"] == "presentation_test.pptx"
    assert persisted["exports"]["pptx"]["source"] == "ppt_schema"


def test_pptx_download_route_serves_generated_file(monkeypatch, tmp_path):
    from backend.routes.slides_routes import artifacts

    monkeypatch.setattr(artifacts.Config, "PPT_RESULTS_FOLDER", str(tmp_path))
    filename = "presentation_test.pptx"
    (tmp_path / filename).write_bytes(b"pptx")

    response = artifacts.download_ppt(filename)

    assert response.media_type == "application/vnd.openxmlformats-officedocument.presentationml.presentation"
