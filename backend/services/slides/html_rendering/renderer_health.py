from __future__ import annotations

import asyncio
import os
import time

from .constants import PLAYWRIGHT_LAUNCH_ARGS, RENDERER_CACHE_TTL_SECONDS, RENDERER_ERROR_CODE


class BrowserRendererUnavailableError(RuntimeError):
    def __init__(
        self,
        *,
        stage: str,
        summary: str,
        renderer: dict | None = None,
        suggestion: str | None = None,
    ) -> None:
        super().__init__(summary)
        self.stage = stage
        self.summary = summary
        self.renderer = renderer or renderer_status_payload(
            {
                "available": False,
                "mode": "unavailable",
                "message": summary,
                "stage": stage,
            }
        )
        self.suggestion = suggestion or default_renderer_suggestion()

    def to_payload(self) -> dict:
        return build_renderer_error_payload(
            stage=self.stage,
            summary=self.summary,
            renderer=self.renderer,
            suggestion=self.suggestion,
        )


def default_renderer_suggestion() -> str:
    return (
        "Verify that Playwright is installed and Chromium can launch on the backend host, "
        "then retry the export. If needed, run `python -m playwright install chromium`."
    )


def renderer_status_payload(status: dict | None) -> dict:
    payload = {
        "available": bool(status and status.get("available")),
        "mode": "browser" if status and status.get("available") else "unavailable",
    }
    message = status.get("message") if status else None
    if message:
        payload["message"] = str(message)
    return payload


def build_renderer_error_payload(
    *,
    stage: str,
    summary: str,
    renderer: dict | None = None,
    suggestion: str | None = None,
) -> dict:
    return {
        "status": "error",
        "error_code": RENDERER_ERROR_CODE,
        "failed_stage": stage,
        "message": f"Browser rendering failed during {stage}.",
        "details": summary,
        "suggestion": suggestion or default_renderer_suggestion(),
        "renderer": renderer
        or renderer_status_payload(
            {
                "available": False,
                "mode": "unavailable",
                "message": summary,
                "stage": stage,
            }
        ),
    }


def format_exception(exc: Exception) -> str:
    message = str(exc).strip()
    return message or exc.__class__.__name__


def renderer_unavailable(stage: str, message: str) -> dict:
    return {
        "available": False,
        "mode": "unavailable",
        "message": message,
        "stage": stage,
    }


def should_use_threaded_playwright() -> bool:
    if os.name != "nt":
        return False
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return False
    selector_loop_type = getattr(asyncio, "SelectorEventLoop", None)
    return bool(selector_loop_type and isinstance(loop, selector_loop_type))


def should_retry_playwright_in_thread(exc: Exception) -> bool:
    return os.name == "nt" and isinstance(exc, NotImplementedError)


def check_browser_renderer_sync(
    smoke_test: bool,
    *,
    launch_args: list[str] | None = None,
    format_exception_fn=format_exception,
    renderer_unavailable_fn=renderer_unavailable,
) -> dict:
    launch_args = launch_args or PLAYWRIGHT_LAUNCH_ARGS
    try:
        from playwright.sync_api import sync_playwright
    except Exception as exc:
        return renderer_unavailable_fn(
            "playwright_import",
            f"Playwright import failed: {format_exception_fn(exc)}",
        )

    try:
        with sync_playwright() as playwright:
            try:
                browser = playwright.chromium.launch(args=launch_args)
            except Exception as exc:
                return renderer_unavailable_fn(
                    "chromium_launch",
                    f"Chromium launch failed: {format_exception_fn(exc)}",
                )

            try:
                if smoke_test:
                    page = browser.new_page(viewport={"width": 320, "height": 180})
                    page.set_content(
                        "<!DOCTYPE html><html><body><div style='width:100px;height:60px;background:#0f766e;color:white'>ok</div></body></html>",
                        wait_until="load",
                        timeout=30000,
                    )
                    page.screenshot(type="png")
            except Exception as exc:
                return renderer_unavailable_fn(
                    "screenshot_smoke_test",
                    f"Chromium screenshot smoke test failed: {format_exception_fn(exc)}",
                )
            finally:
                browser.close()
    except Exception as exc:
        return renderer_unavailable_fn(
            "renderer_check",
            f"Browser renderer health check failed: {format_exception_fn(exc)}",
        )

    return {
        "available": True,
        "mode": "browser",
        "stage": "ready",
    }


def renderer_cache_key(smoke_test: bool) -> str:
    return "smoke_test" if smoke_test else "launch"


def read_renderer_cache(
    cache: dict[str, tuple[float, dict]],
    smoke_test: bool,
    *,
    now_fn=time.monotonic,
    ttl_seconds: float = RENDERER_CACHE_TTL_SECONDS,
) -> dict | None:
    now = now_fn()
    keys = [renderer_cache_key(smoke_test)]
    if not smoke_test:
        keys.append(renderer_cache_key(True))
    for key in keys:
        cached = cache.get(key)
        if not cached:
            continue
        cached_at, status = cached
        if now - cached_at <= ttl_seconds:
            return dict(status)
    return None


def write_renderer_cache(
    cache: dict[str, tuple[float, dict]],
    smoke_test: bool,
    status: dict,
    *,
    now_fn=time.monotonic,
) -> dict:
    stored = dict(status)
    cache[renderer_cache_key(smoke_test)] = (now_fn(), stored)
    return stored


async def check_browser_renderer_impl(
    *,
    smoke_test: bool,
    use_cache: bool,
    cache: dict[str, tuple[float, dict]],
    read_renderer_cache_fn,
    write_renderer_cache_fn,
    should_use_threaded_playwright_fn,
    check_browser_renderer_sync_fn,
    should_retry_playwright_in_thread_fn,
    renderer_unavailable_fn,
    format_exception_fn,
    asyncio_module,
    logger,
    launch_args: list[str] | None = None,
) -> dict:
    launch_args = launch_args or PLAYWRIGHT_LAUNCH_ARGS
    if use_cache:
        cached = read_renderer_cache_fn(cache, smoke_test)
        if cached is not None:
            return cached

    if should_use_threaded_playwright_fn():
        logger.info(
            "Using threaded Playwright renderer check because the current event loop cannot spawn subprocesses."
        )
        status = await asyncio_module.to_thread(check_browser_renderer_sync_fn, smoke_test)
        return write_renderer_cache_fn(cache, smoke_test, status)

    try:
        from playwright.async_api import async_playwright
    except Exception as exc:
        return write_renderer_cache_fn(
            cache,
            smoke_test,
            renderer_unavailable_fn(
                "playwright_import",
                f"Playwright import failed: {format_exception_fn(exc)}",
            ),
        )

    try:
        async with async_playwright() as playwright:
            try:
                browser = await playwright.chromium.launch(args=launch_args)
            except Exception as exc:
                return write_renderer_cache_fn(
                    cache,
                    smoke_test,
                    renderer_unavailable_fn(
                        "chromium_launch",
                        f"Chromium launch failed: {format_exception_fn(exc)}",
                    ),
                )

            try:
                if smoke_test:
                    page = await browser.new_page(viewport={"width": 320, "height": 180})
                    await page.set_content(
                        "<!DOCTYPE html><html><body><div style='width:100px;height:60px;background:#0f766e;color:white'>ok</div></body></html>",
                        wait_until="load",
                        timeout=30000,
                    )
                    await page.screenshot(type="png")
            except Exception as exc:
                return write_renderer_cache_fn(
                    cache,
                    smoke_test,
                    renderer_unavailable_fn(
                        "screenshot_smoke_test",
                        f"Chromium screenshot smoke test failed: {format_exception_fn(exc)}",
                    ),
                )
            finally:
                await browser.close()
    except Exception as exc:
        if should_retry_playwright_in_thread_fn(exc):
            logger.warning(
                "Async Playwright renderer check hit an unsupported subprocess loop; retrying in a worker thread."
            )
            status = await asyncio_module.to_thread(check_browser_renderer_sync_fn, smoke_test)
            return write_renderer_cache_fn(cache, smoke_test, status)
        return write_renderer_cache_fn(
            cache,
            smoke_test,
            renderer_unavailable_fn(
                "renderer_check",
                f"Browser renderer health check failed: {format_exception_fn(exc)}",
            ),
        )

    return write_renderer_cache_fn(
        cache,
        smoke_test,
        {
            "available": True,
            "mode": "browser",
            "stage": "ready",
        },
    )


async def ensure_browser_renderer_impl(
    *,
    smoke_test: bool,
    use_cache: bool,
    check_browser_renderer_fn,
) -> dict:
    status = await check_browser_renderer_fn(smoke_test=smoke_test, use_cache=use_cache)
    if status.get("available"):
        return renderer_status_payload(status)
    raise BrowserRendererUnavailableError(
        stage=str(status.get("stage") or "browser_renderer"),
        summary=str(status.get("message") or "Browser renderer is unavailable."),
        renderer=renderer_status_payload(status),
    )
