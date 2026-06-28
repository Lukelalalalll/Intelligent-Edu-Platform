from __future__ import annotations

import asyncio
from functools import lru_cache
from importlib import import_module
from types import SimpleNamespace

from .paths import (
    configure_ppt_generator_env_defaults,
    ensure_ppt_generator_static_assets,
    ensure_ppt_generator_sys_path,
)

_PPT_GENERATOR_READY = False
_PPT_GENERATOR_READY_LOCK = asyncio.Lock()


@lru_cache(maxsize=1)
def load_ppt_generator_runtime() -> SimpleNamespace:
    configure_ppt_generator_env_defaults()
    ensure_ppt_generator_sys_path()
    return SimpleNamespace(
        API_V1_PPT_ROUTER=import_module("api.v1.ppt.router").API_V1_PPT_ROUTER,
        PresentationWithSlides=import_module("models.presentation_with_slides").PresentationWithSlides,
        PresentationModel=import_module("models.sql.presentation").PresentationModel,
        SlideModel=import_module("models.sql.slide").SlideModel,
        _resolve_presentation_fonts=import_module("api.v1.ppt.endpoints.presentation")._resolve_presentation_fonts,
        create_db_and_tables=import_module("services.database").create_db_and_tables,
        get_async_session=import_module("services.database").get_async_session,
        TEMP_FILE_SERVICE=import_module("services.temp_file_service").TEMP_FILE_SERVICE,
        get_exports_directory=import_module("utils.asset_directory_utils").get_exports_directory,
        export_presentation=import_module("utils.export_utils").export_presentation,
        resolve_web_origin=import_module("utils.export_utils").resolve_web_origin,
        reset_request_env_overrides=import_module("utils.request_overrides").reset_request_env_overrides,
        set_request_env_overrides=import_module("utils.request_overrides").set_request_env_overrides,
    )


async def ensure_ppt_generator_ready() -> None:
    global _PPT_GENERATOR_READY
    if _PPT_GENERATOR_READY:
        return
    runtime = load_ppt_generator_runtime()
    async with _PPT_GENERATOR_READY_LOCK:
        if _PPT_GENERATOR_READY:
            return
        ensure_ppt_generator_static_assets()
        await runtime.create_db_and_tables()
        _PPT_GENERATOR_READY = True


load_presenton_runtime = load_ppt_generator_runtime
ensure_presenton_ready = ensure_ppt_generator_ready
_PRESENTON_READY = _PPT_GENERATOR_READY
_PRESENTON_READY_LOCK = _PPT_GENERATOR_READY_LOCK
