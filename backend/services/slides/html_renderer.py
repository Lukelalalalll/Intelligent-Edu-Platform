"""Compatibility facade for the slides HTML renderer."""

from __future__ import annotations

import asyncio
import logging
import os

from .html_rendering.constants import (
    PLAYWRIGHT_LAUNCH_ARGS as _PLAYWRIGHT_LAUNCH_ARGS,
    RENDERER_CACHE_TTL_SECONDS as _RENDERER_CACHE_TTL_SECONDS,
    RENDERER_ERROR_CODE,
    SLIDE_HEIGHT,
    SLIDE_WIDTH,
    ThemeDraftLayout,
)
from .html_rendering.html_templates import (
    build_jinja_env as _build_jinja_env_impl,
    heading_html_escape,
    render_html_impl,
)
from .html_rendering.markdown_transform import (
    build_output_paths as _build_output_paths,
    build_theme_draft_preview_impl,
    markdown_to_slides,
    split_body_blocks as _split_body_blocks,
    slides_to_theme_draft,
    theme_draft_to_render_slides,
)
from .html_rendering.pptx_export import (
    extract_plain_text_lines as _extract_plain_text_lines,
    export_theme_draft_impl,
    images_to_pptx as _images_to_pptx_impl,
    render_and_export_impl,
    slides_to_basic_pptx as _slides_to_basic_pptx_impl,
)
from .html_rendering.renderer_health import (
    BrowserRendererUnavailableError,
    build_renderer_error_payload,
    check_browser_renderer_impl,
    check_browser_renderer_sync as _check_browser_renderer_sync,
    default_renderer_suggestion,
    ensure_browser_renderer_impl,
    format_exception as _format_exception,
    read_renderer_cache as _read_renderer_cache_impl,
    renderer_status_payload,
    renderer_unavailable as _renderer_unavailable,
    should_retry_playwright_in_thread as _should_retry_playwright_in_thread,
    should_use_threaded_playwright as _should_use_threaded_playwright,
    write_renderer_cache as _write_renderer_cache_impl,
)
from .html_rendering.screenshot_export import (
    save_single_slide_screenshots_impl,
    screenshot_slides_impl,
    screenshot_slides_sync as _screenshot_slides_sync,
)

logger = logging.getLogger(__name__)
_renderer_health_cache: dict[str, tuple[float, dict]] = {}


def _read_renderer_cache(smoke_test: bool) -> dict | None:
    return _read_renderer_cache_impl(_renderer_health_cache, smoke_test)


def _write_renderer_cache(smoke_test: bool, status: dict) -> dict:
    return _write_renderer_cache_impl(_renderer_health_cache, smoke_test, status)


async def check_browser_renderer(*, smoke_test: bool = True, use_cache: bool = True) -> dict:
    return await check_browser_renderer_impl(
        smoke_test=smoke_test,
        use_cache=use_cache,
        cache=_renderer_health_cache,
        read_renderer_cache_fn=_read_renderer_cache_impl,
        write_renderer_cache_fn=_write_renderer_cache_impl,
        should_use_threaded_playwright_fn=_should_use_threaded_playwright,
        check_browser_renderer_sync_fn=_check_browser_renderer_sync,
        should_retry_playwright_in_thread_fn=_should_retry_playwright_in_thread,
        renderer_unavailable_fn=_renderer_unavailable,
        format_exception_fn=_format_exception,
        asyncio_module=asyncio,
        logger=logger,
        launch_args=_PLAYWRIGHT_LAUNCH_ARGS,
    )


async def ensure_browser_renderer(*, smoke_test: bool = True, use_cache: bool = True) -> dict:
    return await ensure_browser_renderer_impl(
        smoke_test=smoke_test,
        use_cache=use_cache,
        check_browser_renderer_fn=check_browser_renderer,
    )


def build_theme_draft_preview(
    *,
    slides: list[dict],
    css_content: str,
    title: str = "Presentation",
    selected_slide_id: str | None = None,
    selected_index: int | None = None,
) -> dict:
    return build_theme_draft_preview_impl(
        slides=slides,
        css_content=css_content,
        title=title,
        selected_slide_id=selected_slide_id,
        selected_index=selected_index,
        theme_draft_to_render_slides_fn=theme_draft_to_render_slides,
        render_html_fn=render_html,
    )


def _build_jinja_env():
    return _build_jinja_env_impl()


def render_html(
    slides: list[dict],
    css_content: str,
    title: str = "Presentation",
) -> str:
    return render_html_impl(
        slides=slides,
        css_content=css_content,
        title=title,
        theme_draft_to_render_slides_fn=theme_draft_to_render_slides,
        build_jinja_env_fn=_build_jinja_env,
        heading_html_escape_fn=heading_html_escape,
    )


async def _screenshot_slides(html: str, slide_count: int) -> list[bytes]:
    return await screenshot_slides_impl(
        html=html,
        slide_count=slide_count,
        should_use_threaded_playwright_fn=_should_use_threaded_playwright,
        screenshot_slides_sync_fn=_screenshot_slides_sync,
        should_retry_playwright_in_thread_fn=_should_retry_playwright_in_thread,
        asyncio_module=asyncio,
        logger=logger,
        launch_args=_PLAYWRIGHT_LAUNCH_ARGS,
        slide_width=SLIDE_WIDTH,
        slide_height=SLIDE_HEIGHT,
    )


def _images_to_pptx(images: list[bytes], output_path: str) -> str:
    return _images_to_pptx_impl(images, output_path, logger=logger)


def _slides_to_basic_pptx(slides: list[dict], output_path: str, deck_title: str) -> str:
    return _slides_to_basic_pptx_impl(slides, output_path, deck_title, logger=logger)


async def _save_single_slide_screenshots(html: str, slide_count: int) -> list[bytes]:
    return await save_single_slide_screenshots_impl(
        html=html,
        slide_count=slide_count,
        ensure_browser_renderer_fn=ensure_browser_renderer,
        screenshot_slides_fn=_screenshot_slides,
        format_exception_fn=_format_exception,
        error_cls=BrowserRendererUnavailableError,
        logger=logger,
    )


class SlidesHtmlRenderer:
    async def render_and_export(
        self,
        md_content: str,
        css_content: str,
        output_dir: str,
        title: str = "Presentation",
    ) -> dict:
        return await render_and_export(md_content, css_content, output_dir, title)


async def render_and_export(
    md_content: str,
    css_content: str,
    output_dir: str,
    title: str = "Presentation",
) -> dict:
    return await render_and_export_impl(
        md_content=md_content,
        css_content=css_content,
        output_dir=output_dir,
        title=title,
        os_module=os,
        logger=logger,
        markdown_to_slides_fn=markdown_to_slides,
        slides_to_theme_draft_fn=slides_to_theme_draft,
        render_html_fn=render_html,
        build_output_paths_fn=_build_output_paths,
        save_single_slide_screenshots_fn=_save_single_slide_screenshots,
        images_to_pptx_fn=_images_to_pptx,
    )


async def export_theme_draft(
    *,
    slides: list[dict],
    css_content: str,
    output_dir: str,
    title: str = "Presentation",
) -> dict:
    return await export_theme_draft_impl(
        slides=slides,
        css_content=css_content,
        output_dir=output_dir,
        title=title,
        os_module=os,
        render_html_fn=render_html,
        build_output_paths_fn=_build_output_paths,
        save_single_slide_screenshots_fn=_save_single_slide_screenshots,
        images_to_pptx_fn=_images_to_pptx,
    )
