from __future__ import annotations

from backend.presenton_host.auth_bridge import (
    authenticate_ppt_generator_export_user,
    extract_cookie_value,
    get_ppt_generator_current_user,
    resolve_ppt_generator_public_origin,
)
from backend.presenton_host.bootstrap import ensure_ppt_generator_ready, load_ppt_generator_runtime
from backend.presenton_host.bootstrap_routes import (
    ppt_generator_bootstrap,
    ppt_generator_user_config,
    ppt_generator_user_config_update,
)
from backend.presenton_host.config_bridge import (
    build_ppt_generator_user_config_summary,
    load_ppt_generator_host_config,
)
from backend.presenton_host.export_routes import (
    PptGeneratorAppExportRequest,
    content_disposition,
    get_ppt_generator_async_session,
    get_safe_ppt_generator_export_file_path,
    ppt_generator_export,
    ppt_generator_export_file,
    ppt_generator_export_presentation_data,
    ppt_generator_read_file,
)
from backend.presenton_host.paths import (
    BACKEND_ROOT,
    BACKEND_STATIC_ROOT,
    CONFIGURED_SENTINEL,
    EXPORT_RUNTIME_ROOT,
    PPT_GENERATOR_APP_DATA_ROOT,
    PPT_GENERATOR_DB_PATH,
    PPT_GENERATOR_RUNTIME_ROOT,
    PPT_GENERATOR_STATIC_ROOT,
    PPT_GENERATOR_TEMP_ROOT,
    PPT_GENERATOR_USER_CONFIG_PATH,
    REPO_ROOT,
    configure_ppt_generator_env_defaults,
    copy_tree,
    ensure_ppt_generator_static_assets,
    ensure_ppt_generator_sys_path,
)
from backend.presenton_host.request_context import ppt_generator_request_context
from backend.presenton_host.runtime_mount import PPT_GENERATOR_HOST_ROUTER, mount_ppt_generator

__all__ = [
    "BACKEND_ROOT",
    "REPO_ROOT",
    "PPT_GENERATOR_RUNTIME_ROOT",
    "PPT_GENERATOR_APP_DATA_ROOT",
    "PPT_GENERATOR_TEMP_ROOT",
    "PPT_GENERATOR_DB_PATH",
    "PPT_GENERATOR_USER_CONFIG_PATH",
    "PPT_GENERATOR_STATIC_ROOT",
    "BACKEND_STATIC_ROOT",
    "EXPORT_RUNTIME_ROOT",
    "CONFIGURED_SENTINEL",
    "PptGeneratorAppExportRequest",
    "PPT_GENERATOR_HOST_ROUTER",
    "ensure_ppt_generator_ready",
    "load_ppt_generator_runtime",
    "ppt_generator_request_context",
    "get_ppt_generator_current_user",
    "authenticate_ppt_generator_export_user",
    "extract_cookie_value",
    "resolve_ppt_generator_public_origin",
    "ppt_generator_bootstrap",
    "ppt_generator_user_config",
    "ppt_generator_user_config_update",
    "build_ppt_generator_user_config_summary",
    "load_ppt_generator_host_config",
    "content_disposition",
    "get_ppt_generator_async_session",
    "get_safe_ppt_generator_export_file_path",
    "ppt_generator_export",
    "ppt_generator_export_file",
    "ppt_generator_read_file",
    "ppt_generator_export_presentation_data",
    "mount_ppt_generator",
    "configure_ppt_generator_env_defaults",
    "ensure_ppt_generator_static_assets",
    "ensure_ppt_generator_sys_path",
    "copy_tree",
]
