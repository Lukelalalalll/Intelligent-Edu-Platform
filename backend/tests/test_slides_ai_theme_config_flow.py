from __future__ import annotations

import pytest
from fastapi import HTTPException


@pytest.mark.asyncio
async def test_generate_render_uses_resolved_runtime_and_returns_draft_slides(monkeypatch, tmp_path):
    from backend.routes.slides_routes import generation

    monkeypatch.setattr(generation.Config, "PPT_RESULTS_FOLDER", str(tmp_path))

    runtime = type(
        "Runtime",
        (),
        {
            "provider_id": "openai",
            "requested_provider": "openai",
            "config_source": "user_ai_config",
            "model": "gpt-5.5",
        },
    )()

    class _FakeThemeService:
        def load_base_css(self, theme_name: str) -> str:
            assert theme_name == "neon_tech"
            return ":root { --slide-bg: #000; } .slide { color: #fff; }"

        async def customize_theme(self, *, base_css_content: str, user_custom_theme_prompt: str, provider: str, runtime=None):
            assert provider == "openai"
            assert runtime is not None
            assert runtime.provider_id == "openai"
            assert "contrast" in user_custom_theme_prompt
            return base_css_content + " .slide { border: 1px solid red; }"

    class _FakeRenderer:
        async def render_and_export(self, *, md_content: str, css_content: str, output_dir: str, title: str):
            assert "Hello world" in md_content
            assert title == "Deck"
            assert "border" in css_content
            return {
                "pptx_download_url": "/api/slides/download_ppt/test.pptx",
                "html_preview_url": "/api/slides/download_html/test.html",
                "page_count": 2,
                "draft_slides": [
                    {
                        "id": "slide-1",
                        "heading": "Intro",
                        "body": "Hello world",
                        "bullets": [],
                        "accent_text": "2 slides",
                        "layout": "cover",
                        "align": "left",
                    }
                ],
            }

    async def fake_resolve_provider_runtime(requested: str, *, feature: str, user: dict, require_healthy: bool):
        assert requested == "openai"
        assert feature == "slides.generate_render"
        assert user["id"] == "u1"
        assert require_healthy is True
        return runtime

    monkeypatch.setattr(generation, "resolve_provider_runtime", fake_resolve_provider_runtime)
    monkeypatch.setattr("backend.services.slides.dynamic_theme_service.DynamicThemeService", _FakeThemeService)
    monkeypatch.setattr("backend.services.slides.html_renderer.SlidesHtmlRenderer", _FakeRenderer)
    async def fake_ensure_browser_renderer(*, smoke_test: bool = True, use_cache: bool = True):
        assert smoke_test is True
        return {"available": True, "mode": "browser"}
    monkeypatch.setattr("backend.services.slides.html_renderer.ensure_browser_renderer", fake_ensure_browser_renderer)

    response = await generation.generate_render(
        generation.GenerateRenderRequest(
            md_content="# Intro\nHello world",
            base_style="neon_tech",
            custom_style_prompt="more contrast please",
            provider="openai",
            title="Deck",
        ),
        user={"id": "u1", "username": "demo"},
    )

    assert response["status"] == "success"
    assert response["provider_resolved"] == "openai"
    assert response["provider_source"] == "user_ai_config"
    assert response["provider_model"] == "gpt-5.5"
    assert response["draft_slides"][0]["heading"] == "Intro"


@pytest.mark.asyncio
async def test_generate_render_passes_through_fallback_render_metadata(monkeypatch, tmp_path):
    from backend.routes.slides_routes import generation
    from backend.services.slides.html_renderer import BrowserRendererUnavailableError

    monkeypatch.setattr(generation.Config, "PPT_RESULTS_FOLDER", str(tmp_path))

    class _FakeThemeService:
        def load_base_css(self, theme_name: str) -> str:
            assert theme_name == "neon_tech"
            return ":root { --slide-bg: #000; } .slide { color: #fff; }"

    class _FakeRenderer:
        async def render_and_export(self, *, md_content: str, css_content: str, output_dir: str, title: str):
            assert "Hello world" in md_content
            raise BrowserRendererUnavailableError(
                stage="chromium_launch",
                summary="Chromium launch failed: missing executable",
                renderer={"available": False, "mode": "unavailable", "message": "Chromium launch failed: missing executable"},
            )

    monkeypatch.setattr("backend.services.slides.dynamic_theme_service.DynamicThemeService", _FakeThemeService)
    monkeypatch.setattr("backend.services.slides.html_renderer.SlidesHtmlRenderer", _FakeRenderer)
    async def fake_ensure_browser_renderer(*, smoke_test: bool = True, use_cache: bool = True):
        return {"available": True, "mode": "browser"}
    monkeypatch.setattr("backend.services.slides.html_renderer.ensure_browser_renderer", fake_ensure_browser_renderer)

    with pytest.raises(HTTPException) as exc_info:
        await generation.generate_render(
            generation.GenerateRenderRequest(
                md_content="# Intro\nHello world",
                base_style="neon_tech",
                custom_style_prompt="",
                provider="auto",
                title="Deck",
            ),
            user={"id": "u1", "username": "demo"},
        )

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail["error_code"] == "browser_renderer_unavailable"
    assert exc_info.value.detail["failed_stage"] == "chromium_launch"
    assert "Chromium launch failed" in exc_info.value.detail["details"]


@pytest.mark.asyncio
async def test_export_render_draft_returns_download_contract(monkeypatch, tmp_path):
    from backend.routes.slides_routes import generation
    from backend.schemas.slides import ThemeDraftSlideSchema

    monkeypatch.setattr(generation.Config, "PPT_RESULTS_FOLDER", str(tmp_path))

    async def fake_export_theme_draft(*, slides, css_content: str, output_dir: str, title: str):
        assert title == "Deck"
        assert slides[0]["heading"] == "Intro"
        assert css_content.startswith(":root")
        return {
            "pptx_download_url": "/api/slides/download_ppt/deck.pptx",
            "html_preview_url": "/api/slides/download_html/deck.html",
            "page_count": 1,
            "render_mode": "screenshot_pptx",
        }

    monkeypatch.setattr("backend.services.slides.html_renderer.export_theme_draft", fake_export_theme_draft)
    async def fake_ensure_browser_renderer(*, smoke_test: bool = True, use_cache: bool = True):
        return {"available": True, "mode": "browser"}
    monkeypatch.setattr("backend.services.slides.html_renderer.ensure_browser_renderer", fake_ensure_browser_renderer)

    response = await generation.export_render_draft(
        generation.ExportRenderDraftRequest(
            title="Deck",
            css_content=":root { --slide-bg: #fff; }",
            slides=[
                ThemeDraftSlideSchema(
                    id="slide-1",
                    heading="Intro",
                    body="Hello",
                    bullets=["One"],
                    accent_text="Accent",
                    layout="content",
                    align="left",
                )
            ],
        ),
        user={"id": "u1"},
    )

    assert response["status"] == "success"
    assert response["pptx_download_url"].endswith("deck.pptx")
    assert response["renderer"]["mode"] == "browser"


@pytest.mark.asyncio
async def test_render_draft_preview_returns_backend_html(monkeypatch):
    from backend.routes.slides_routes import generation
    from backend.schemas.slides import ThemeDraftSlideSchema

    def fake_build_theme_draft_preview(*, slides, css_content: str, title: str, selected_slide_id=None, selected_index=None):
        assert title == "Deck"
        assert slides[0]["heading"] == "Intro"
        assert css_content.startswith(":root")
        assert selected_slide_id == "slide-1"
        return {
            "html": "<html><body>preview</body></html>",
            "page_count": 1,
            "selected_index": 0,
            "selected_slide_id": "slide-1",
        }

    async def fake_check_browser_renderer(*, smoke_test: bool = True, use_cache: bool = True):
        assert smoke_test is True
        return {"available": True, "mode": "browser"}

    monkeypatch.setattr("backend.services.slides.html_renderer.build_theme_draft_preview", fake_build_theme_draft_preview)
    monkeypatch.setattr("backend.services.slides.html_renderer.check_browser_renderer", fake_check_browser_renderer)

    response = await generation.render_draft_preview(
        generation.RenderDraftPreviewRequest(
            title="Deck",
            css_content=":root { --slide-bg: #fff; }",
            selected_slide_id="slide-1",
            slides=[
                ThemeDraftSlideSchema(
                    id="slide-1",
                    heading="Intro",
                    body="Hello",
                    bullets=["One"],
                    accent_text="Accent",
                    layout="content",
                    align="left",
                )
            ],
        ),
        user={"id": "u1"},
    )

    assert response["status"] == "success"
    assert response["html"] == "<html><body>preview</body></html>"
    assert response["renderer"]["mode"] == "browser"
