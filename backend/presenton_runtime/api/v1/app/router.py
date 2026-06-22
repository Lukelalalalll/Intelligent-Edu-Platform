from __future__ import annotations

import logging
import os
import mimetypes
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Body, HTTPException, Query, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel

from utils.get_env import (
    get_can_change_keys_env,
    get_openai_api_key_env,
    is_disable_auth_enabled,
)
from utils.export_utils import export_presentation, resolve_web_origin
from utils.parsers import parse_bool_or_none
from utils.simple_auth import get_auth_status, get_session_token_from_request
from utils.user_config import get_user_config, update_env_with_user_config
from utils.user_config_store import read_user_config_file, update_user_config_file
from services.temp_file_service import TEMP_FILE_SERVICE


API_V1_APP_ROUTER = APIRouter(prefix="/api/v1/app", tags=["App"])
LOGGER = logging.getLogger(__name__)

AUTH_FIELDS = {
    "AUTH_USERNAME",
    "AUTH_PASSWORD_HASH",
    "AUTH_SECRET_KEY",
}

PRESERVED_FIELDS = {
    "CODEX_ACCESS_TOKEN",
    "CODEX_REFRESH_TOKEN",
    "CODEX_TOKEN_EXPIRES",
    "CODEX_ACCOUNT_ID",
    "CODEX_USERNAME",
    "CODEX_EMAIL",
    "CODEX_IS_PRO",
}

BOOLEAN_PASSTHROUGH_FIELDS = {
    "DISABLE_IMAGE_GENERATION",
    "DISABLE_THINKING",
    "EXTENDED_REASONING",
    "WEB_GROUNDING",
    "CODEX_IS_PRO",
}

OPTIONAL_BOOLEAN_STRING_FIELDS = {
    "DISABLE_ANONYMOUS_TRACKING",
}


class AppExportRequest(BaseModel):
    id: str
    title: str | None = None
    format: str


def _content_disposition(filename: str) -> str:
    fallback = "".join(
        ch if ch.isalnum() or ch in "._-" else "_" for ch in filename
    ) or "download"
    return (
        f'attachment; filename="{fallback}"; '
        f"filename*=UTF-8''{quote(filename)}"
    )


def _get_exports_directory() -> Path:
    app_data_dir = Path(
        (os.environ.get("APP_DATA_DIRECTORY") or str(Path.cwd() / "app_data"))
    ).resolve()
    exports_dir = (app_data_dir / "exports").resolve()
    exports_dir.mkdir(parents=True, exist_ok=True)
    return exports_dir


def _get_safe_export_file_path(name: str) -> Path:
    file_name = name.strip()
    if not file_name:
        raise HTTPException(status_code=400, detail="Invalid export file name")
    if Path(file_name).name != file_name or "/" in file_name or "\\" in file_name:
        raise HTTPException(status_code=400, detail="Invalid export file name")

    exports_dir = _get_exports_directory()
    candidate = (exports_dir / file_name).resolve()
    try:
        candidate.relative_to(exports_dir)
    except ValueError as exc:
        raise HTTPException(status_code=403, detail="Access denied") from exc
    return candidate


def _build_export_download_url(file_name: str) -> str:
    return f"/api/v1/app/export/file?name={quote(file_name)}"


def _resolve_request_web_origin(request: Request) -> str:
    return resolve_web_origin(
        explicit_origin=request.headers.get("x-presenton-web-origin"),
        forwarded_proto=request.headers.get("x-forwarded-proto"),
        forwarded_host=request.headers.get("x-forwarded-host")
        or request.headers.get("host"),
        origin_header=request.headers.get("origin"),
        referer_header=request.headers.get("referer"),
    )


def _can_change_keys() -> bool:
    return get_can_change_keys_env() != "false"


def _get_user_config_path() -> str:
    user_config_path = (os.environ.get("USER_CONFIG_PATH") or "").strip()
    if not user_config_path:
        raise HTTPException(status_code=500, detail="USER_CONFIG_PATH is not set")
    return user_config_path


def _strip_auth_fields(config: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in config.items()
        if key not in AUTH_FIELDS
    }


def _normalize_incoming_value(key: str, value: Any) -> Any:
    if key in BOOLEAN_PASSTHROUGH_FIELDS and isinstance(value, str):
        parsed = parse_bool_or_none(value)
        return parsed if parsed is not None else value

    if key in OPTIONAL_BOOLEAN_STRING_FIELDS:
        if value is None or value == "":
            return None
        if isinstance(value, bool):
            return "true" if value else "false"
        if isinstance(value, str):
            parsed = parse_bool_or_none(value)
            if parsed is not None:
                return "true" if parsed else "false"
        return value

    return value


def _has_required_key() -> bool:
    user_config_path = (os.environ.get("USER_CONFIG_PATH") or "").strip()
    key_from_file = ""
    if user_config_path:
        try:
            parsed = read_user_config_file(user_config_path)
            key_from_file = str(parsed.get("OPENAI_API_KEY") or "").strip()
        except Exception:
            key_from_file = ""

    key_from_env = (get_openai_api_key_env() or "").strip()
    return bool(key_from_file or key_from_env)


def _telemetry_enabled(config_dict: dict[str, Any] | None = None) -> bool:
    config_dict = config_dict or {}
    from_env = (os.environ.get("DISABLE_ANONYMOUS_TRACKING") or "").strip()
    from_file = str(config_dict.get("DISABLE_ANONYMOUS_TRACKING") or "").strip()
    return not (
        from_env.lower() == "true" or from_file.lower() == "true"
    )


def _build_bootstrap_response(request: Request) -> dict[str, Any]:
    auth_status = (
        {"configured": True, "authenticated": True, "username": "web"}
        if is_disable_auth_enabled()
        else get_auth_status(get_session_token_from_request(request))
    )

    raw_config_dict: dict[str, Any] = {}
    if auth_status.get("authenticated") and _can_change_keys():
        user_config_path = (os.environ.get("USER_CONFIG_PATH") or "").strip()
        if user_config_path:
            try:
                raw_config_dict = read_user_config_file(user_config_path)
            except Exception:
                raw_config_dict = {}

    response: dict[str, Any] = {
        "canChangeKeys": _can_change_keys(),
        "hasRequiredKey": _has_required_key(),
        "telemetryEnabled": _telemetry_enabled(raw_config_dict),
        "auth": auth_status,
        "capabilities": {
            "mode": "web",
            "browserDownload": True,
            "mcpProxy": True,
            "arbitraryLocalRead": False,
        },
        "origins": {
            "publicWebOrigin": (os.environ.get("PUBLIC_WEB_ORIGIN") or "").strip()
            or "http://127.0.0.1:3000",
        },
    }

    if auth_status.get("authenticated") and _can_change_keys():
        response["userConfig"] = get_user_config().model_dump()
    else:
        response["userConfig"] = None

    return response


@API_V1_APP_ROUTER.get("/bootstrap")
async def get_bootstrap(request: Request):
    return _build_bootstrap_response(request)


@API_V1_APP_ROUTER.get("/user-config")
async def get_user_config_endpoint(request: Request):
    auth_status = (
        {"configured": True, "authenticated": True, "username": "web"}
        if is_disable_auth_enabled()
        else get_auth_status(get_session_token_from_request(request))
    )
    if not auth_status.get("authenticated"):
        raise HTTPException(status_code=401, detail="Unauthorized")
    if not _can_change_keys():
        raise HTTPException(status_code=403, detail="You are not allowed to access this resource")

    return get_user_config().model_dump()


@API_V1_APP_ROUTER.put("/user-config")
async def update_user_config_endpoint(
    request: Request,
    body: dict[str, Any] = Body(...),
):
    auth_status = (
        {"configured": True, "authenticated": True, "username": "web"}
        if is_disable_auth_enabled()
        else get_auth_status(get_session_token_from_request(request))
    )
    if not auth_status.get("authenticated"):
        raise HTTPException(status_code=401, detail="Unauthorized")
    if not _can_change_keys():
        raise HTTPException(status_code=403, detail="You are not allowed to modify this resource")

    user_config_path = _get_user_config_path()
    sanitized_incoming = _strip_auth_fields(dict(body))
    defined_entries = {
        key: _normalize_incoming_value(key, value)
        for key, value in sanitized_incoming.items()
        if value is not ... and key not in AUTH_FIELDS
    }

    def merge(existing: dict[str, Any]) -> dict[str, Any]:
        next_config = dict(existing)
        for key, value in defined_entries.items():
            if key in PRESERVED_FIELDS:
                continue
            if value is None:
                next_config.pop(key, None)
            else:
                next_config[key] = value

        for key in PRESERVED_FIELDS:
            if key in existing:
                next_config[key] = existing[key]

        return next_config

    update_user_config_file(user_config_path, merge)
    update_env_with_user_config()
    return get_user_config().model_dump()


@API_V1_APP_ROUTER.post("/export")
async def export_presentation_endpoint(request: Request, body: AppExportRequest):
    export_format = body.format.strip().lower()
    if export_format not in {"pdf", "pptx"}:
        raise HTTPException(status_code=400, detail="Invalid export format")

    try:
        import uuid

        presentation_and_path = await export_presentation(
            uuid.UUID(body.id),
            (body.title or "").strip() or "presentation",
            export_format,  # type: ignore[arg-type]
            cookie_header=request.headers.get("cookie") or None,
            web_origin=_resolve_request_web_origin(request),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid presentation id") from exc
    except HTTPException:
        raise
    except Exception as exc:
        LOGGER.exception(
            "Unhandled app export failure",
            extra={"presentation_id": body.id, "format": export_format},
        )
        raise HTTPException(
            status_code=500,
            detail=f"Export failed: {exc}",
        ) from exc

    output_path = Path(presentation_and_path.path).resolve()
    exports_dir = _get_exports_directory()

    try:
        relative_path = output_path.relative_to(exports_dir)
    except ValueError as exc:
        raise HTTPException(
            status_code=500,
            detail="Export finished outside the configured exports directory",
        ) from exc

    return {
        "success": True,
        "downloadUrl": _build_export_download_url(relative_path.name),
        "path": f"/app_data/exports/{relative_path.as_posix()}",
        "presentationId": body.id,
    }


@API_V1_APP_ROUTER.get("/export/file")
async def download_export_file(name: str = Query(...)):
    file_path = _get_safe_export_file_path(name)
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Export file not found")

    media_type, _ = mimetypes.guess_type(file_path.name)
    return FileResponse(
        path=file_path,
        media_type=media_type or "application/octet-stream",
        headers={
            "Cache-Control": "no-store",
            "Content-Disposition": _content_disposition(file_path.name),
        },
    )


@API_V1_APP_ROUTER.post("/read-file")
async def read_temp_file_endpoint(body: dict[str, Any] = Body(...)):
    file_path = body.get("filePath")
    if not isinstance(file_path, str) or not file_path.strip():
        raise HTTPException(status_code=400, detail="Invalid file path")

    try:
        content = TEMP_FILE_SERVICE.read_temp_file(file_path, binary=False)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to read file") from exc

    return {"content": content}
