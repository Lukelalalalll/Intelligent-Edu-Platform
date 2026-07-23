from __future__ import annotations

import logging
from importlib import import_module

from fastapi import APIRouter

LOGGER = logging.getLogger(__name__)

_ROUTER_SPECS = (
    ("api.v1.ppt.endpoints.files", "FILES_ROUTER"),
    ("api.v1.ppt.endpoints.fonts", "FONTS_ROUTER"),
    ("api.v1.ppt.endpoints.outlines", "OUTLINES_ROUTER"),
    ("api.v1.ppt.endpoints.presentation", "PRESENTATION_ROUTER"),
    ("api.v1.ppt.endpoints.pptx_slides", "PPTX_SLIDES_ROUTER"),
    ("api.v1.ppt.endpoints.slide", "SLIDE_ROUTER"),
    ("api.v1.ppt.endpoints.chat", "CHAT_ROUTER"),
    ("api.v1.ppt.endpoints.slide_to_html", "LAYOUT_MANAGEMENT_ROUTER"),
    ("api.v1.ppt.endpoints.images", "IMAGES_ROUTER"),
    ("api.v1.ppt.endpoints.icons", "ICONS_ROUTER"),
    ("api.v1.ppt.endpoints.ollama", "OLLAMA_ROUTER"),
    ("api.v1.ppt.endpoints.pdf_slides", "PDF_SLIDES_ROUTER"),
    ("api.v1.ppt.endpoints.openai", "OPENAI_ROUTER"),
    ("api.v1.ppt.endpoints.anthropic", "ANTHROPIC_ROUTER"),
    ("api.v1.ppt.endpoints.google", "GOOGLE_ROUTER"),
    ("api.v1.ppt.endpoints.codex_auth", "CODEX_AUTH_ROUTER"),
    ("api.v1.ppt.endpoints.pptx_slides", "PPTX_FONTS_ROUTER"),
    ("api.v1.ppt.endpoints.theme", "THEMES_ROUTER"),
    ("api.v1.ppt.endpoints.theme_generate", "THEME_ROUTER"),
    ("templates.router", "TEMPLATE_ROUTER"),
)


def _include_optional_router(api_router: APIRouter, module_path: str, attribute_name: str) -> None:
    try:
        router = getattr(import_module(module_path), attribute_name)
    except Exception as exc:
        LOGGER.warning(
            "Skipping optional PPT router %s.%s: %s: %s",
            module_path,
            attribute_name,
            type(exc).__name__,
            exc,
        )
        return
    api_router.include_router(router)


def build_api_v1_ppt_router() -> APIRouter:
    api_router = APIRouter(prefix="/api/v1/ppt")
    for module_path, attribute_name in _ROUTER_SPECS:
        _include_optional_router(api_router, module_path, attribute_name)
    return api_router


API_V1_PPT_ROUTER = build_api_v1_ppt_router()
