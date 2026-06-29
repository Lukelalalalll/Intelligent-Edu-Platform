from __future__ import annotations

import asyncio
import io
import json
from pathlib import Path

import pytest
from fastapi.responses import Response
from starlette.datastructures import UploadFile


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

    response = asyncio.run(artifacts.download_ppt(filename, user={"id": "admin-1", "role": "admin"}))

    assert response.media_type == "application/vnd.openxmlformats-officedocument.presentationml.presentation"


def test_source_download_route_serves_uploaded_file(monkeypatch, tmp_path):
    from backend.routes.slides_routes import artifacts

    monkeypatch.setattr(artifacts.Config, "SUB1_UPLOAD_FOLDER", str(tmp_path))
    filename = "source_lecture.pdf"
    target = tmp_path / filename
    target.write_bytes(b"source")

    response = asyncio.run(artifacts.download_source(filename, user={"id": "admin-1", "role": "admin"}))

    assert Path(response.path) == target


def test_generate_v2_workflow_snapshot_and_result_artifacts():
    from backend.routes.slides_routes import delivery

    task = {
        "task_id": "task-1",
        "request_id": "req-1",
        "status": "completed",
        "created_at": 100.0,
        "updated_at": 104.5,
        "events": [
            {"type": "step_start", "step": "outline", "message": "Generating outline", "ts": 100.5},
            {"type": "step_done", "step": "outline", "message": "Done outline", "ts": 101.5},
            {"type": "step_start", "step": "pptx_export", "message": "Exporting pptx", "ts": 102.0},
            {"type": "step_done", "step": "pptx_export", "message": "Done pptx", "ts": 104.0, "payload": {"filename": "deck.pptx"}},
        ],
    }

    workflow = delivery._build_workflow_snapshot(task)
    artifacts = delivery._build_ppt_generator_result_artifacts(
        title="Deck Title",
        request_id="req-1",
        slides_results=[{"title": "1"}, {"title": "2"}],
        pptx_filename="deck.pptx",
        design_spec_url="/api/slides/decks/deck-1/design-spec",
        script_payload={"word_document": {"filename": "script.docx", "download_url": "/slides/download_script/script.docx"}},
    )

    assert workflow is not None
    assert workflow["request_id"] == "req-1"
    assert workflow["task_type"] == "ppt_generator_generate_v2"
    assert workflow["total_latency_ms"] == 4500
    assert workflow["steps"][0]["step"] == "outline"
    assert workflow["steps"][0]["status"] == "success"
    assert workflow["steps"][1]["metadata"]["filename"] == "deck.pptx"

    assert artifacts["title"] == "Deck Title"
    assert artifacts["page_count"] == 2
    assert artifacts["pptx_download_url"] == "/api/slides/download_ppt/deck.pptx"
    assert artifacts["script_doc_download_url"] == "/slides/download_script/script.docx"


def test_generate_v2_build_ppt_generator_source_uses_download_routes():
    from backend.routes.slides_routes import delivery
    from backend.schemas.slides import SlidesGenerateV2Schema

    req = SlidesGenerateV2Schema(
        theme="PPT Generator Code",
        source_kind="upload",
        source_filename="stored.md",
        source_display_name="Lecture.md",
        combined_markdown_filename="combined.md",
    )
    source = delivery._build_ppt_generator_source(req, title="Deck", request_id="req-1")

    assert source["kind"] == "upload"
    assert source["source_download_url"] == "/api/slides/download_source/stored.md"
    assert source["combined_markdown_download_url"] == "/api/slides/download/combined.md"


def test_generate_v2_history_params_include_theme():
    from backend.routes.slides_routes import delivery
    from backend.schemas.slides import SlidesGenerateV2Schema

    runtime = type(
        "Runtime",
        (),
        {
            "requested_provider": "openai",
            "provider_id": "openai",
            "config_source": "user_ai_config",
            "model": "gpt-5.5",
        },
    )()
    req = SlidesGenerateV2Schema(
        provider="openai",
        theme="PPT Generator Code",
        total_pages=8,
    )

    params = delivery._build_ppt_generator_history_params(
        req=req,
        runtime=runtime,
        request_id="req-1",
        task_id="task-1",
        deck_id="deck-1",
        title="Deck",
    )

    assert params["theme"] == "PPT Generator Code"


def test_ppt_generator_theme_aliases_support_hyphenated_template_families():
    from backend.services.slides.output.theme_catalog import resolve_base_theme

    available = ["Business", "Classic", "Dark", "Light"]

    assert resolve_base_theme("Pitch Deck", available) == "Business"
    assert resolve_base_theme("pitch-deck", available) == "Business"
    assert resolve_base_theme("PPT Generator Pitch Deck", available) == "Business"
    assert resolve_base_theme("Product Overview", available) == "Business"
    assert resolve_base_theme("product-overview", available) == "Business"
    assert resolve_base_theme("PPT Generator Product Overview", available) == "Business"


@pytest.mark.asyncio
async def test_resolve_ppt_generator_runtime_prefers_user_profile_provider(monkeypatch):
    from backend.routes.slides_routes import delivery

    calls: list[tuple[str, bool]] = []

    class _Runtime:
        provider_id = "openai"
        requested_provider = "openai"
        config_source = "user_ai_config"
        model = "gpt-5.5"
        health_status = {"configured": True}

    async def fake_resolve_provider_runtime(requested: str, *, feature: str, user: dict, require_healthy: bool):
        calls.append((requested, require_healthy))
        if requested == "openai":
            return _Runtime()
        raise AssertionError(f"unexpected provider: {requested}")

    async def fake_check_runtime_health(runtime):
        assert runtime.provider_id == "openai"
        return True, "ok"

    monkeypatch.setattr(delivery, "resolve_provider_runtime", fake_resolve_provider_runtime)
    monkeypatch.setattr(delivery, "check_runtime_health", fake_check_runtime_health)

    runtime = await delivery._resolve_ppt_generator_runtime(
        "auto",
        feature="slides.generate_v2",
        user={"id": "u1"},
        require_healthy=True,
    )

    assert runtime.provider_id == "openai"
    assert calls == [("openai", False)]


@pytest.mark.asyncio
async def test_run_generate_v2_task_carries_theme_into_ppt_schema(monkeypatch):
    from backend.routes.slides_routes import delivery
    from backend.schemas.slides import SlidesGenerateV2Schema

    captured_schema: dict = {}

    class _Runtime:
        requested_provider = "openai"
        provider_id = "openai"
        config_source = "user_ai_config"
        model = "gpt-5.5"

        def public_dict(self):
            return {
                "requested_provider": self.requested_provider,
                "provider_id": self.provider_id,
                "config_source": self.config_source,
                "model": self.model,
            }

    class _FakeAdapter:
        def __init__(self, runtime=None):
            self.runtime = runtime

        async def check_provider_health(self):
            return True, "ok"

        async def generate_slides(self, *, outline, num_of_bullets, words_each_bullet):
            assert num_of_bullets == 3
            assert words_each_bullet == 15
            return [{
                "slide_number": 1,
                "title": "Intro",
                "content": ["Point A", "Point B"],
                "layout": {"name": "Title and Content"},
                "tables": [],
            }]

    async def fake_set_status(*_args, **_kwargs):
        return None

    async def fake_add_event(*_args, **_kwargs):
        return None

    async def fake_complete(*_args, **_kwargs):
        return None

    monkeypatch.setattr(delivery, "PptGeneratorAdapterService", _FakeAdapter)
    monkeypatch.setattr(delivery.PptGeneratorTaskService, "set_status", fake_set_status)
    monkeypatch.setattr(delivery.PptGeneratorTaskService, "add_event", fake_add_event)
    monkeypatch.setattr(delivery.PptGeneratorTaskService, "complete", fake_complete)
    monkeypatch.setattr(delivery, "build_svg_deck", lambda **_kwargs: {
        "deck_id": "deck-1",
        "design_spec_url": "/api/slides/decks/deck-1/design-spec",
        "spec_lock": {},
        "quality_report": {"status": "passed", "total_slides": 1, "issues": []},
        "slides": [{"index": 1, "title": "Intro", "svg_url": "/slide.svg", "preview_url": "/preview.png", "quality_status": "passed", "filename": "slide1.svg", "rhythm": "steady"}],
        "exports": {},
    })

    def fake_create_ppt_from_schema(ppt_schema):
        captured_schema.update(ppt_schema)
        return "deck.pptx"

    monkeypatch.setattr(delivery, "create_ppt_from_schema", fake_create_ppt_from_schema)
    monkeypatch.setattr(delivery, "_attach_pptx_export", lambda deck_manifest, pptx_filename: {"pptx": {"filename": pptx_filename}})

    req = SlidesGenerateV2Schema(
        provider="openai",
        theme="PPT Generator Code",
        outlineSlides=[{
            "title": "Intro",
            "objective": "Set the frame",
            "key_points": ["Point A", "Point B"],
            "content": "# Intro\n\n- Point A\n- Point B",
        }],
        total_pages=1,
        num_of_bullets=3,
        words_each_bullet=15,
        presentation_title="Deck",
    )

    await delivery._run_generate_v2_task("task-1", req, _Runtime(), user=None)

    assert captured_schema["theme"] == "PPT Generator Code"
    assert captured_schema["metadata"]["theme"] == "PPT Generator Code"


def test_normalize_outline_slide_builds_structure_from_markdown():
    from backend.routes.slides_routes import delivery

    normalized = delivery._normalize_outline_slide(
        {
            "content": "# Market Overview\n\nObjective: Frame the market\n\n- Growth drivers\n- Risks\n- Next move",
        },
        1,
    )

    assert normalized["title"] == "Market Overview"
    assert normalized["objective"] == "Frame the market"
    assert normalized["key_points"] == ["Growth drivers", "Risks", "Next move"]


@pytest.mark.asyncio
async def test_ppt_generator_outline_route_returns_editable_outline(monkeypatch):
    from backend.routes.slides_routes import delivery
    from backend.schemas.slides import PptGeneratorOutlineRequestSchema

    class _Runtime:
        requested_provider = "openai"
        provider_id = "openai"
        config_source = "user_ai_config"
        model = "gpt-5.5"

    async def fake_resolve_provider_runtime(*_args, **_kwargs):
        return _Runtime()

    class _FakeAdapter:
        def __init__(self, runtime=None):
            self.runtime = runtime

        async def generate_outline(self, *, source_text, total_pages, chapter_data=None):
            assert source_text == "Hello world"
            assert total_pages == 1
            return [{
                "title": "Intro",
                "objective": "Set the frame",
                "key_points": ["Point A", "Point B", "Point C"],
            }]

    monkeypatch.setattr(delivery, "resolve_provider_runtime", fake_resolve_provider_runtime)
    monkeypatch.setattr(delivery, "PptGeneratorAdapterService", _FakeAdapter)

    result = await delivery.generate_ppt_generator_outline(
        PptGeneratorOutlineRequestSchema(
            provider="openai",
            content="Hello world",
            total_pages=1,
            presentation_title="Demo Deck",
        ),
        user={"id": "u1"},
        request=None,
    )

    assert result["success"] is True
    assert result["provider_resolved"] == "openai"
    assert result["slides"][0]["title"] == "Intro"
    assert result["slides"][0]["content"].startswith("# Intro")


@pytest.mark.asyncio
async def test_parse_md_stores_unique_internal_name_and_preserves_display_name(monkeypatch, tmp_path):
    from backend.routes.slides_routes import parse

    monkeypatch.setattr(parse.Config, "SUB1_UPLOAD_FOLDER", str(tmp_path / "uploads"))
    monkeypatch.setattr(parse.Config, "SUB1_MD_FOLDER", str(tmp_path / "markdown"))
    monkeypatch.setattr(parse, "_get_parsed_data_with_cache", lambda *_args: {"headers": [], "tables": []})

    async def fake_save(self):
        return None

    monkeypatch.setattr(parse.TaskTracker, "save", fake_save)

    stored_names = iter(["abc123.md", "def456.md"])
    monkeypatch.setattr(parse, "_build_stored_upload_name", lambda _filename: next(stored_names))

    response_one = await parse.parse_md(
        file=UploadFile(filename="Lecture Notes.md", file=io.BytesIO(b"# Intro")),
        use_llm=False,
        header_llm_provider="local_ollama",
        user={"username": "demo"},
    )
    response_two = await parse.parse_md(
        file=UploadFile(filename="Lecture Notes.md", file=io.BytesIO(b"# Intro")),
        use_llm=False,
        header_llm_provider="local_ollama",
        user={"username": "demo"},
    )

    assert response_one["display_filename"] == "Lecture Notes.md"
    assert response_one["filename"] == "abc123.md"
    assert response_two["filename"] == "def456.md"
    assert response_one["filename"] != response_two["filename"]
    assert (tmp_path / "uploads" / "abc123.md").exists()
    assert (tmp_path / "uploads" / "def456.md").exists()

