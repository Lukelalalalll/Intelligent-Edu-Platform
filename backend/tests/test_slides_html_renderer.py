from __future__ import annotations

import asyncio


def test_check_browser_renderer_uses_threaded_fallback_on_selector_loop(monkeypatch):
    from backend.services.slides import html_renderer

    monkeypatch.setattr(html_renderer, "_renderer_health_cache", {})
    monkeypatch.setattr(html_renderer, "_should_use_threaded_playwright", lambda: True)

    calls: list[bool] = []

    def fake_check_browser_renderer_sync(smoke_test: bool) -> dict:
        calls.append(smoke_test)
        return {"available": True, "mode": "browser", "stage": "ready"}

    async def fake_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    monkeypatch.setattr(html_renderer, "_check_browser_renderer_sync", fake_check_browser_renderer_sync)
    monkeypatch.setattr(html_renderer.asyncio, "to_thread", fake_to_thread)

    result = asyncio.run(html_renderer.check_browser_renderer(smoke_test=True, use_cache=False))

    assert result["available"] is True
    assert calls == [True]


def test_screenshot_slides_uses_threaded_fallback_on_selector_loop(monkeypatch):
    from backend.services.slides import html_renderer

    monkeypatch.setattr(html_renderer, "_should_use_threaded_playwright", lambda: True)

    calls: list[tuple[str, int]] = []

    def fake_screenshot_sync(html: str, slide_count: int) -> list[bytes]:
        calls.append((html, slide_count))
        return [b"slide-1"]

    async def fake_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    monkeypatch.setattr(html_renderer, "_screenshot_slides_sync", fake_screenshot_sync)
    monkeypatch.setattr(html_renderer.asyncio, "to_thread", fake_to_thread)

    result = asyncio.run(html_renderer._screenshot_slides("<html></html>", 1))

    assert result == [b"slide-1"]
    assert calls == [("<html></html>", 1)]


def test_format_exception_uses_class_name_when_message_is_empty():
    from backend.services.slides import html_renderer

    assert html_renderer._format_exception(NotImplementedError()) == "NotImplementedError"
