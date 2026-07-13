from __future__ import annotations

import base64
import time


def test_editor_session_facade_exports_core_class():
    from backend.services.slides.output import editor_session as editor_session_package
    from backend.services.slides.output.editor_session.core import EditorSession

    assert editor_session_package.EditorSession is EditorSession


def test_editor_session_create_session_builds_stable_payload(monkeypatch, tmp_path):
    from backend.services.slides.output.editor_session import core

    EditorSession = core.EditorSession

    monkeypatch.setattr(EditorSession, "_sessions", {})
    monkeypatch.setattr(EditorSession, "_timestamps", {})
    monkeypatch.setattr(EditorSession, "_temp_dirs", [])
    monkeypatch.setattr(EditorSession, "_master_key", None)
    monkeypatch.setattr(EditorSession, "_last_cleanup", time.monotonic())
    monkeypatch.setattr(core, "find_soffice", lambda _cls: None)

    def fake_render(session):
        session._slide_pngs = [b"png-1", b"png-2"]
        session.slide_count = 2

    monkeypatch.setattr(core, "render_pptx_to_pngs", fake_render)

    session = EditorSession.create_session(
        pptx_bytes=b"fake-pptx",
        theme_id="theme-1",
        slide_lookup_table={1: "slide-1"},
        output_dir=str(tmp_path),
    )

    payload = session.get_pptx_payload()

    assert payload["session_id"] == session.session_id
    assert payload["theme_id"] == "theme-1"
    assert payload["status"] == "ready"
    assert payload["render_mode"] == "fallback"
    assert payload["total_slides"] == 2
    assert len(payload["slides"]) == 2
    assert base64.b64decode(payload["slides"][0]["png_base64"]) == b"png-1"
    assert session.get_pptx_bytes() == b"fake-pptx"
