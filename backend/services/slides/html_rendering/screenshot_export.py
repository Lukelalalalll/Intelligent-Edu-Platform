from __future__ import annotations

import time

from .constants import PLAYWRIGHT_LAUNCH_ARGS, SLIDE_HEIGHT, SLIDE_WIDTH


def screenshot_slides_sync(
    html: str,
    slide_count: int,
    *,
    launch_args: list[str] | None = None,
    slide_width: int = SLIDE_WIDTH,
    slide_height: int = SLIDE_HEIGHT,
) -> list[bytes]:
    from playwright.sync_api import sync_playwright

    launch_args = launch_args or PLAYWRIGHT_LAUNCH_ARGS
    screenshots: list[bytes] = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(args=launch_args)
        try:
            page = browser.new_page(viewport={"width": slide_width, "height": slide_height})
            page.set_content(html, wait_until="load", timeout=30000)
            time.sleep(0.5)

            for slide_index in range(slide_count):
                page.evaluate(
                    """
                    (currentSlideIndex) => {
                        document.querySelectorAll('.viewport .slide').forEach((s, i) => {
                            if (i === currentSlideIndex) {
                                s.style.display = 'flex';
                                s.scrollIntoView({ behavior: 'instant', block: 'start' });
                            } else {
                                s.style.display = 'none';
                            }
                        });
                        var nav = document.querySelector('.slide-nav');
                        if (nav) nav.style.display = 'none';
                    }
                    """,
                    slide_index,
                )
                time.sleep(0.4)
                screenshots.append(page.screenshot(type="png", full_page=False))
            return screenshots
        finally:
            browser.close()


async def screenshot_slides_impl(
    *,
    html: str,
    slide_count: int,
    should_use_threaded_playwright_fn,
    screenshot_slides_sync_fn,
    should_retry_playwright_in_thread_fn,
    asyncio_module,
    logger,
    launch_args: list[str] | None = None,
    slide_width: int = SLIDE_WIDTH,
    slide_height: int = SLIDE_HEIGHT,
) -> list[bytes]:
    if should_use_threaded_playwright_fn():
        logger.info(
            "Using threaded Playwright slide capture because the current event loop cannot spawn subprocesses."
        )
        return await asyncio_module.to_thread(screenshot_slides_sync_fn, html, slide_count)

    from playwright.async_api import async_playwright

    launch_args = launch_args or PLAYWRIGHT_LAUNCH_ARGS
    screenshots: list[bytes] = []
    try:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(args=launch_args)
            try:
                page = await browser.new_page(viewport={"width": slide_width, "height": slide_height})
                await page.set_content(html, wait_until="load", timeout=30000)
                await asyncio_module.sleep(0.5)

                for slide_index in range(slide_count):
                    await page.evaluate(
                        f"""
                        () => {{
                            document.querySelectorAll('.viewport .slide').forEach((s, i) => {{
                                if (i === {slide_index}) {{
                                    s.style.display = 'flex';
                                    s.scrollIntoView({{ behavior: 'instant', block: 'start' }});
                                }} else {{
                                    s.style.display = 'none';
                                }}
                            }});
                            var nav = document.querySelector('.slide-nav');
                            if (nav) nav.style.display = 'none';
                        }}
                        """
                    )
                    await asyncio_module.sleep(0.4)
                    screenshots.append(await page.screenshot(type="png", full_page=False))
                return screenshots
            finally:
                await browser.close()
    except Exception as exc:
        if should_retry_playwright_in_thread_fn(exc):
            logger.warning(
                "Async Playwright slide capture hit an unsupported subprocess loop; retrying in a worker thread."
            )
            return await asyncio_module.to_thread(screenshot_slides_sync_fn, html, slide_count)
        raise


async def save_single_slide_screenshots_impl(
    *,
    html: str,
    slide_count: int,
    ensure_browser_renderer_fn,
    screenshot_slides_fn,
    format_exception_fn,
    error_cls,
    logger,
) -> list[bytes]:
    status = await ensure_browser_renderer_fn(smoke_test=True)
    try:
        return await screenshot_slides_fn(html, slide_count)
    except Exception as exc:
        logger.error("Playwright screenshot failed: %s", format_exception_fn(exc))
        raise error_cls(
            stage="slide_screenshot",
            summary=f"Playwright screenshot failed: {format_exception_fn(exc)}",
            renderer=status,
        ) from exc
