from __future__ import annotations

from backend.presenton_host.auth_bridge import (
    authenticate_presenton_export_user as _authenticate_presenton_export_user,
    extract_cookie_value as _extract_cookie_value,
    get_presenton_current_user,
    resolve_request_public_origin as _resolve_request_public_origin,
)
from backend.presenton_host.bootstrap import ensure_presenton_ready, load_presenton_runtime
from backend.presenton_host.bootstrap_routes import (
    presenton_bootstrap,
    presenton_user_config,
    presenton_user_config_update,
)
from backend.presenton_host.config_bridge import (
    build_presenton_user_config_summary as _build_presenton_user_config_summary,
    load_presenton_host_config as _load_presenton_host_config,
)
from backend.presenton_host.export_routes import (
    PresentonAppExportRequest,
    content_disposition as _content_disposition,
    get_safe_export_file_path as _get_safe_export_file_path,
    presenton_export,
    presenton_export_file,
    presenton_export_presentation_data,
    presenton_read_file,
)
from backend.presenton_host.paths import (
    BACKEND_ROOT,
    BACKEND_STATIC_ROOT,
    CONFIGURED_SENTINEL,
    EXPORT_RUNTIME_ROOT,
    PRESENTON_APP_DATA_ROOT,
    PRESENTON_DB_PATH,
    PRESENTON_RUNTIME_ROOT,
    PRESENTON_STATIC_ROOT,
    PRESENTON_TEMP_ROOT,
    PRESENTON_USER_CONFIG_PATH,
    configure_presenton_env_defaults as _configure_presenton_env_defaults,
    copy_tree as _copy_tree,
    ensure_presenton_static_assets as _ensure_presenton_static_assets,
    ensure_presenton_sys_path as _ensure_presenton_sys_path,
    REPO_ROOT,
)
from backend.presenton_host.request_context import presenton_request_context
from backend.presenton_host.runtime_mount import PRESENTON_HOST_ROUTER, mount_presenton

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
