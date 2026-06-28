from __future__ import annotations

import asyncio
import base64
import html
import mimetypes
import os
import re
import tempfile
import urllib.parse
from pathlib import Path
from typing import List, Set, Tuple

from fastapi import HTTPException

from ..pptx_font_utils_support.font_metadata import get_font_details
from ..pptx_fallback import (
    extract_slide_htmls_from_pptx,
    render_fallback_slide_pngs_from_pptx,
)
try:
    from utils.asset_directory_utils import (
        absolute_fastapi_asset_url,
        resolve_app_path_to_filesystem,
    )
except ModuleNotFoundError:  # pragma: no cover - backend test import path
    from backend.presenton_runtime.utils.asset_directory_utils import (
        absolute_fastapi_asset_url,
        resolve_app_path_to_filesystem,
    )

from .font_mapping import actual_uploaded_font_name, font_detail_variant

PREVIEW_WIDTH = 1280
PREVIEW_HEIGHT = 720
EXPORT_TASK_SERVICE = None


def _log_preview_warning(logger, message: str) -> None:
    warning = getattr(logger, "warning", None)
    if callable(warning):
        warning(message)
        return
    info = getattr(logger, "info", None)
    if callable(info):
        info(message)


async def _render_pptx_slides_with_python_fallback(
    *,
    modified_pptx_path: str,
    max_slides,
    logger,
    export_task_service,
    local_font_css: str = "",
    extra_font_css: str = "",
) -> List[str]:
    _log_preview_warning(
        logger,
        "PPTX-to-HTML export is unavailable for this PPTX; using simplified python-pptx "
        "fallback previews so template creation can continue.",
    )
    try:
        slide_htmls = await asyncio.to_thread(
            extract_slide_htmls_from_pptx,
            modified_pptx_path,
            max_slides=max_slides,
            width=PREVIEW_WIDTH,
            height=PREVIEW_HEIGHT,
        )
    except Exception as exc:
        slide_htmls = []
        _log_preview_warning(
            logger,
            f"Python fallback HTML extraction failed; falling back to Pillow previews. detail={exc}",
        )

    if slide_htmls:
        localized_font_css = _localize_preview_asset_urls(
            "\n".join(css for css in (local_font_css, extra_font_css) if css)
        )
        localized_slide_htmls = [
            _build_slide_preview_html(
                slide_html,
                localized_font_css,
                width=PREVIEW_WIDTH,
                height=PREVIEW_HEIGHT,
            )
            for slide_html in slide_htmls
        ]
        try:
            rendered = await export_task_service.render_htmls_to_images(
                htmls=localized_slide_htmls,
                width=PREVIEW_WIDTH,
                height=PREVIEW_HEIGHT,
            )
            logger.info(
                "Rendered %d fallback HTML slide previews in one Chromium task",
                len(rendered.paths),
            )
            return rendered.paths
        except Exception as exc:
            _log_preview_warning(
                logger,
                f"Fallback HTML preview rendering failed; falling back to Pillow previews. detail={exc}",
            )

    slide_pngs = await asyncio.to_thread(
        render_fallback_slide_pngs_from_pptx,
        modified_pptx_path,
        max_slides=max_slides,
    )
    if not slide_pngs:
        raise RuntimeError("Fallback PPTX preview renderer returned no slides")

    temp_dir = tempfile.mkdtemp(prefix="pptx-preview-fallback-")
    screenshot_paths: List[str] = []
    for index, slide_png in enumerate(slide_pngs, start=1):
        output_path = os.path.join(temp_dir, f"slide-{index}.png")
        await asyncio.to_thread(Path(output_path).write_bytes, slide_png)
        screenshot_paths.append(output_path)
    return screenshot_paths


def _get_export_task_service():
    global EXPORT_TASK_SERVICE
    if EXPORT_TASK_SERVICE is not None:
        return EXPORT_TASK_SERVICE
    try:
        from services.export_task_service import EXPORT_TASK_SERVICE as runtime_service
    except ModuleNotFoundError:  # pragma: no cover - backend test import path
        from backend.presenton_runtime.services.export_task_service import (
            EXPORT_TASK_SERVICE as runtime_service,
        )
    EXPORT_TASK_SERVICE = runtime_service
    return EXPORT_TASK_SERVICE


def preview_dimensions_from_document(width: float, height: float) -> Tuple[int, int]:
    try:
        resolved_width = int(round(float(width)))
        resolved_height = int(round(float(height)))
    except (TypeError, ValueError):
        return PREVIEW_WIDTH, PREVIEW_HEIGHT
    return (resolved_width, resolved_height) if resolved_width > 0 and resolved_height > 0 else (PREVIEW_WIDTH, PREVIEW_HEIGHT)


def _css_string(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _font_weight_for_css(font_detail, variant: str) -> int:
    return int(font_detail.weight_class) if font_detail.weight_class is not None else 700 if "bold" in variant else 400


def _font_style_for_css(variant: str) -> str:
    return "italic" if "italic" in variant else "normal"


def _font_face_css_for_local_fonts(font_paths: List[str]) -> str:
    rules: List[str] = []
    seen: Set[Tuple[str, str]] = set()
    for font_path in font_paths:
        if not os.path.isfile(font_path):
            continue
        font_detail = get_font_details(font_path)
        if font_detail.error:
            continue
        variant = font_detail_variant(font_detail, os.path.basename(font_path))
        variant = "regular" if variant == "unsupported" else variant
        family_names = {name for name in (font_detail.family_name, font_detail.full_name, font_detail.postscript_name, actual_uploaded_font_name(font_detail, variant, font_path)) if name}
        font_url = Path(font_path).resolve().as_uri()
        for family_name in sorted(family_names):
            key = (family_name, font_url)
            if key in seen:
                continue
            seen.add(key)
            rules.append('@font-face { ' f'font-family: "{_css_string(family_name)}"; ' f'src: url("{font_url}"); ' f"font-weight: {_font_weight_for_css(font_detail, variant)}; " f"font-style: {_font_style_for_css(variant)}; " "font-display: block; }")
    return "\n".join(rules)


def _preview_asset_url_to_data_uri(url: str) -> str:
    parsed = urllib.parse.urlparse(url or "")
    if parsed.scheme in ("http", "https"):
        if not parsed.path.startswith(("/app_data/", "/static/")):
            return url
        candidate = urllib.parse.unquote(parsed.path)
    elif parsed.scheme == "file":
        candidate = urllib.parse.unquote(parsed.path)
    elif str(url).startswith(("/app_data/", "/static/")):
        candidate = url
    else:
        return url
    resolved = resolve_app_path_to_filesystem(candidate)
    if not resolved:
        return url
    try:
        data = Path(resolved).read_bytes()
    except OSError:
        return url
    mime_type = mimetypes.guess_type(resolved)[0] or "application/octet-stream"
    return f"data:{mime_type};base64,{base64.b64encode(data).decode('ascii')}"


def _localize_preview_asset_urls(raw_html: str) -> str:
    raw_html = re.sub(r"(?P<prefix>\b(?:src|href|xlink:href)=['\"])(?P<url>[^'\"]+)(?P<suffix>['\"])", lambda match: f"{match.group('prefix')}{_preview_asset_url_to_data_uri(match.group('url'))}{match.group('suffix')}", raw_html, flags=re.IGNORECASE)
    return re.sub(r"url\((?P<quote>['\"]?)(?P<url>[^)'\"]+)(?P=quote)\)", lambda match: f"url({match.group('quote') or ''}{_preview_asset_url_to_data_uri(match.group('url'))}{match.group('quote') or ''})", raw_html, flags=re.IGNORECASE)


def _font_stylesheet_links_for_slide_html(slide_html: str, declared_font_css: str = "") -> str:
    from ..pptx_font_utils_support.google_fonts import build_google_fonts_stylesheet_url

    declared_font_names = {" ".join(font_name.replace("_", " ").split()).casefold() for font_name in re.findall(r"font-family\s*:\s*['\"]?([^;'\"}]+)", declared_font_css, flags=re.IGNORECASE) if font_name.strip()}
    font_names = sorted({font_name.replace("_", " ").strip() for font_name in re.findall(r"font-\[\s*['\"]([^'\"]+)['\"]\s*\]", slide_html) if font_name.strip() and " ".join(font_name.replace("_", " ").split()).casefold() not in declared_font_names})
    return "\n".join(f'<link href="{html.escape(build_google_fonts_stylesheet_url(font_name), quote=True)}" rel="stylesheet">' for font_name in font_names)


def _build_slide_preview_html(slide_html: str, font_css: str, font_links: str = "", width: int = PREVIEW_WIDTH, height: int = PREVIEW_HEIGHT) -> str:
    fastapi_base = absolute_fastapi_asset_url("/").rstrip("/") + "/"
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <base href="{fastapi_base}" />
  <script src="https://cdn.tailwindcss.com"></script>
  {font_links}
  <style>
    html, body, #slide-preview-root, .slide-container, .slide-content {{ width: {width}px; height: {height}px; margin: 0; overflow: hidden; background: #ffffff; }}
    *, *::before, *::after {{ box-sizing: border-box; }}
    .slide-container {{ display: flex; align-items: flex-start; justify-content: center; }}
    .slide-content {{ position: relative; flex: 0 0 auto; box-shadow: none; }}
    img, svg, video, canvas {{ max-width: none; }}
    {font_css or ""}
  </style>
</head>
<body>
  <div id="slide-preview-root">{slide_html}</div>
</body>
</html>"""


async def render_pptx_slides_to_images(
    modified_pptx_path: str,
    font_paths_for_install: List[str],
    max_slides,
    logger,
    extra_font_css: str = "",
) -> List[str]:
    export_task_service = _get_export_task_service()
    local_font_css = await asyncio.to_thread(_font_face_css_for_local_fonts, font_paths_for_install) if font_paths_for_install else ""
    if local_font_css:
        logger.info("Prepared custom font CSS for HTML preview rendering")
    if extra_font_css:
        logger.info("Prepared replacement font CSS for HTML preview rendering")
    try:
        pptx_document = await export_task_service.convert_pptx_to_html(
            modified_pptx_path,
            get_fonts=True,
        )
    except HTTPException as exc:
        _log_preview_warning(
            logger,
            "PPTX-to-HTML font extraction failed for preview generation; retrying without "
            f"runtime font extraction. detail={exc.detail}",
        )
        try:
            pptx_document = await export_task_service.convert_pptx_to_html(
                modified_pptx_path,
                get_fonts=False,
            )
        except HTTPException:
            return await _render_pptx_slides_with_python_fallback(
                modified_pptx_path=modified_pptx_path,
                max_slides=max_slides,
                logger=logger,
                export_task_service=export_task_service,
                local_font_css=local_font_css,
                extra_font_css=extra_font_css,
            )
    if not pptx_document.slides:
        raise RuntimeError("PPTX-to-HTML returned no slides")
    slide_htmls = pptx_document.slides[:max_slides] if max_slides else pptx_document.slides
    width, height = preview_dimensions_from_document(pptx_document.width, pptx_document.height)
    logger.info(f"Rendering {len(slide_htmls)} slide previews from PPTX-to-HTML at {width}x{height}")
    localized_font_css = _localize_preview_asset_urls(
        "\n".join(css for css in (pptx_document.font_css, local_font_css, extra_font_css) if css)
    )
    localized_slide_htmls = [
        _build_slide_preview_html(
            _localize_preview_asset_urls(slide_html),
            localized_font_css,
            font_links=_font_stylesheet_links_for_slide_html(_localize_preview_asset_urls(slide_html), localized_font_css),
            width=width,
            height=height,
        )
        for slide_html in slide_htmls
    ]
    rendered = await export_task_service.render_htmls_to_images(htmls=localized_slide_htmls, width=width, height=height)
    logger.info(f"Rendered {len(rendered.paths)} HTML slide previews in one Chromium task")
    return rendered.paths
