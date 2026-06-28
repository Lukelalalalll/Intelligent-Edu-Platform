from __future__ import annotations

from backend.ppt_generator_integration import (
    BACKEND_ROOT,
    BACKEND_STATIC_ROOT,
    CONFIGURED_SENTINEL,
    EXPORT_RUNTIME_ROOT,
    PPT_GENERATOR_APP_DATA_ROOT,
    PPT_GENERATOR_DB_PATH,
    PPT_GENERATOR_HOST_ROUTER,
    PPT_GENERATOR_RUNTIME_ROOT,
    PPT_GENERATOR_STATIC_ROOT,
    PPT_GENERATOR_TEMP_ROOT,
    PPT_GENERATOR_USER_CONFIG_PATH,
    PptGeneratorAppExportRequest,
    REPO_ROOT,
    authenticate_ppt_generator_export_user as _authenticate_ppt_generator_export_user,
    build_ppt_generator_user_config_summary as _build_ppt_generator_user_config_summary,
    configure_ppt_generator_env_defaults as _configure_ppt_generator_env_defaults,
    content_disposition as _content_disposition,
    copy_tree as _copy_tree,
    ensure_ppt_generator_ready,
    ensure_ppt_generator_static_assets as _ensure_ppt_generator_static_assets,
    ensure_ppt_generator_sys_path as _ensure_ppt_generator_sys_path,
    extract_cookie_value as _extract_cookie_value,
    get_ppt_generator_current_user,
    get_safe_ppt_generator_export_file_path as _get_safe_ppt_generator_export_file_path,
    load_ppt_generator_host_config as _load_ppt_generator_host_config,
    load_ppt_generator_runtime,
    mount_ppt_generator,
    ppt_generator_bootstrap,
    ppt_generator_export,
    ppt_generator_export_file,
    ppt_generator_export_presentation_data,
    ppt_generator_read_file,
    ppt_generator_request_context,
    ppt_generator_user_config,
    ppt_generator_user_config_update,
    resolve_ppt_generator_public_origin as _resolve_ppt_generator_public_origin,
)

PRESENTON_RUNTIME_ROOT = PPT_GENERATOR_RUNTIME_ROOT
PRESENTON_APP_DATA_ROOT = PPT_GENERATOR_APP_DATA_ROOT
PRESENTON_TEMP_ROOT = PPT_GENERATOR_TEMP_ROOT
PRESENTON_DB_PATH = PPT_GENERATOR_DB_PATH
PRESENTON_USER_CONFIG_PATH = PPT_GENERATOR_USER_CONFIG_PATH
PRESENTON_STATIC_ROOT = PPT_GENERATOR_STATIC_ROOT
PresentonAppExportRequest = PptGeneratorAppExportRequest
PRESENTON_HOST_ROUTER = PPT_GENERATOR_HOST_ROUTER
ensure_presenton_ready = ensure_ppt_generator_ready
load_presenton_runtime = load_ppt_generator_runtime
presenton_request_context = ppt_generator_request_context
get_presenton_current_user = get_ppt_generator_current_user
presenton_bootstrap = ppt_generator_bootstrap
presenton_user_config = ppt_generator_user_config
presenton_user_config_update = ppt_generator_user_config_update
presenton_export = ppt_generator_export
presenton_export_file = ppt_generator_export_file
presenton_read_file = ppt_generator_read_file
presenton_export_presentation_data = ppt_generator_export_presentation_data
mount_presenton = mount_ppt_generator

__all__ = [
    "BACKEND_ROOT",
    "REPO_ROOT",
    "PRESENTON_RUNTIME_ROOT",
    "PRESENTON_APP_DATA_ROOT",
    "PRESENTON_TEMP_ROOT",
    "PRESENTON_DB_PATH",
    "PRESENTON_USER_CONFIG_PATH",
    "PRESENTON_STATIC_ROOT",
    "BACKEND_STATIC_ROOT",
    "EXPORT_RUNTIME_ROOT",
    "CONFIGURED_SENTINEL",
    "PresentonAppExportRequest",
    "PRESENTON_HOST_ROUTER",
    "ensure_presenton_ready",
    "load_presenton_runtime",
    "presenton_request_context",
    "get_presenton_current_user",
    "presenton_bootstrap",
    "presenton_user_config",
    "presenton_user_config_update",
    "presenton_export",
    "presenton_export_file",
    "presenton_read_file",
    "presenton_export_presentation_data",
    "mount_presenton",
]
