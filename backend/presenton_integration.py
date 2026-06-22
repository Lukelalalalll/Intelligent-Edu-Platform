from __future__ import annotations

import asyncio
import mimetypes
import os
import shutil
import sys
import uuid
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Body, Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse
from jose import JWTError
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from backend.config import Config
from backend.core.ai_provider import resolve_provider_runtime
from backend.core.security import get_current_user
from backend.repositories import user_repo
from backend.services.auth_session_service import (
    decode_access_token,
    get_active_session_for_access,
)
from backend.services.user_profile_service import (
    load_ai_config,
    load_deepseek_runtime_config,
    load_openai_runtime_config,
)
from backend.presenton_runtime_context import (
    reset_presenton_owner_user_id,
    resolve_presenton_owner_user_id,
    set_presenton_owner_user_id,
)

BACKEND_ROOT = Path(__file__).resolve().parent
REPO_ROOT = BACKEND_ROOT.parent
PRESENTON_RUNTIME_ROOT = BACKEND_ROOT / "presenton_runtime"
PRESENTON_APP_DATA_ROOT = BACKEND_ROOT / "app_data"
PRESENTON_TEMP_ROOT = PRESENTON_APP_DATA_ROOT / "temp"
PRESENTON_DB_PATH = PRESENTON_APP_DATA_ROOT / "presenton.db"
PRESENTON_USER_CONFIG_PATH = PRESENTON_APP_DATA_ROOT / "presenton-user-config.json"
PRESENTON_STATIC_ROOT = PRESENTON_RUNTIME_ROOT / "static"
BACKEND_STATIC_ROOT = BACKEND_ROOT / "static"
EXPORT_RUNTIME_ROOT = REPO_ROOT / "presentation-export"

CONFIGURED_SENTINEL = "__configured__"
_PRESENTON_READY = False
_PRESENTON_READY_LOCK = asyncio.Lock()


def _ensure_presenton_sys_path() -> None:
    runtime_root = str(PRESENTON_RUNTIME_ROOT)
    if runtime_root not in sys.path:
        sys.path.insert(0, runtime_root)


def _configure_presenton_env_defaults() -> None:
    PRESENTON_APP_DATA_ROOT.mkdir(parents=True, exist_ok=True)
    PRESENTON_TEMP_ROOT.mkdir(parents=True, exist_ok=True)
    PRESENTON_USER_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not PRESENTON_USER_CONFIG_PATH.exists():
        PRESENTON_USER_CONFIG_PATH.write_text("{}\n", encoding="utf-8")

    os.environ.setdefault("APP_DATA_DIRECTORY", str(PRESENTON_APP_DATA_ROOT))
    os.environ.setdefault("TEMP_DIRECTORY", str(PRESENTON_TEMP_ROOT))
    os.environ.setdefault("USER_CONFIG_PATH", str(PRESENTON_USER_CONFIG_PATH))
    os.environ.setdefault(
        "DATABASE_URL",
        f"sqlite+aiosqlite:///{PRESENTON_DB_PATH.as_posix()}",
    )
    os.environ.setdefault("EXPORT_RUNTIME_DIR", str(EXPORT_RUNTIME_ROOT))
    os.environ.setdefault("EXPORT_PACKAGE_ROOT", str(EXPORT_RUNTIME_ROOT))
    os.environ.setdefault("CAN_CHANGE_KEYS", "false")
    os.environ.setdefault("DISABLE_AUTH", "true")
    os.environ.setdefault("MEM0_ENABLED", "false")
    os.environ.setdefault("MIGRATE_DATABASE_ON_STARTUP", "false")


def _copy_tree(src: Path, dst: Path) -> None:
    if not src.is_dir():
        return
    dst.mkdir(parents=True, exist_ok=True)
    for item in src.rglob("*"):
        relative = item.relative_to(src)
        target = dst / relative
        if item.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            shutil.copy2(item, target)
        except PermissionError:
            if not target.exists():
                raise


def _ensure_presenton_static_assets() -> None:
    _copy_tree(PRESENTON_STATIC_ROOT / "icons", BACKEND_STATIC_ROOT / "icons")
    _copy_tree(PRESENTON_STATIC_ROOT / "images", BACKEND_STATIC_ROOT / "images")


_configure_presenton_env_defaults()
_ensure_presenton_sys_path()

from api.v1.ppt.endpoints.presentation import _resolve_presentation_fonts  # noqa: E402
from api.v1.ppt.router import API_V1_PPT_ROUTER  # noqa: E402
from models.presentation_with_slides import PresentationWithSlides  # noqa: E402
from models.sql.presentation import PresentationModel  # noqa: E402
from models.sql.slide import SlideModel  # noqa: E402
from services.database import create_db_and_tables, get_async_session  # noqa: E402
from services.temp_file_service import TEMP_FILE_SERVICE  # noqa: E402
from utils.asset_directory_utils import get_exports_directory  # noqa: E402
from utils.export_utils import export_presentation, resolve_web_origin  # noqa: E402
from utils.request_overrides import (  # noqa: E402
    reset_request_env_overrides,
    set_request_env_overrides,
)


class PresentonAppExportRequest(BaseModel):
    id: str
    title: str | None = None
    format: str


def _resolve_request_public_origin(request: Request) -> str:
    return resolve_web_origin(
        explicit_origin=request.headers.get("x-presenton-web-origin"),
        forwarded_proto=request.headers.get("x-forwarded-proto"),
        forwarded_host=request.headers.get("x-forwarded-host")
        or request.headers.get("host"),
        origin_header=request.headers.get("origin"),
        referer_header=request.headers.get("referer"),
    )


def _extract_cookie_value(raw_cookie_header: str, cookie_name: str) -> str:
    try:
        cookie = SimpleCookie()
        cookie.load(raw_cookie_header)
    except Exception:
        return ""
    morsel = cookie.get(cookie_name)
    if morsel is None:
        return ""
    return (morsel.value or "").strip()


async def _authenticate_presenton_export_user(
    request: Request,
    raw_cookie_header: str,
) -> dict:
    token = _extract_cookie_value(raw_cookie_header, Config.JWT_ACCESS_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Please log in first")

    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
        session_id = payload.get("sid")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        if not session_id:
            raise HTTPException(status_code=401, detail="Invalid session")
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Token expired") from exc

    user = await user_repo.find_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    user["id"] = str(user["_id"])

    if str(user.get("status") or "active").lower() != "active":
        raise HTTPException(status_code=403, detail="Account is not active")

    if int(payload.get("token_version") or 0) != int(user.get("token_version") or 0):
        raise HTTPException(status_code=401, detail="Session is no longer valid")

    session = await get_active_session_for_access(
        session_id=str(session_id),
        user_id=str(user["_id"]),
        token_version=int(payload.get("token_version") or 0),
    )

    user["session_id"] = str(session.get("session_id") or "")
    request.state.current_access_payload = payload
    request.state.current_session = session
    request.state.current_user = user
    return user


async def get_presenton_current_user(request: Request) -> dict:
    try:
        return await get_current_user(request)
    except HTTPException as exc:
        export_cookie_header = (request.headers.get("x-export-cookie") or "").strip()
        if not export_cookie_header:
            raise exc
        return await _authenticate_presenton_export_user(request, export_cookie_header)


def _build_presenton_user_config_summary(
    *,
    selected_llm: str,
    openai_runtime: dict,
    deepseek_runtime: dict,
) -> dict:
    has_openai = bool(str(openai_runtime.get("api_key") or "").strip())
    has_deepseek = bool(str(deepseek_runtime.get("api_key") or "").strip())
    return {
        "LLM": selected_llm if selected_llm in {"openai", "deepseek"} else "openai",
        "OPENAI_API_KEY": CONFIGURED_SENTINEL if has_openai else "",
        "OPENAI_MODEL": openai_runtime.get("model") or "gpt-5.5",
        "DEEPSEEK_API_KEY": CONFIGURED_SENTINEL if has_deepseek else "",
        "DEEPSEEK_MODEL": deepseek_runtime.get("model") or "deepseek-v4-pro",
        "DEEPSEEK_BASE_URL": deepseek_runtime.get("base_url")
        or "https://api.deepseek.com",
        "DISABLE_IMAGE_GENERATION": not has_openai,
        "IMAGE_PROVIDER": "gpt-image-1.5" if has_openai else None,
        "WEB_GROUNDING": False,
        "WEB_SEARCH_PROVIDER": "auto",
    }


async def _load_presenton_host_config(
    request: Request,
    current_user: dict,
) -> tuple[dict, dict]:
    openai_runtime = await load_openai_runtime_config(current_user)
    deepseek_runtime = await load_deepseek_runtime_config(current_user)
    public_origin = _resolve_request_public_origin(request)

    has_openai = bool(str(openai_runtime.get("api_key") or "").strip())
    has_deepseek = bool(str(deepseek_runtime.get("api_key") or "").strip())
    supported_providers: list[str] = []
    if has_openai:
        supported_providers.append("openai")
    if has_deepseek:
        supported_providers.append("deepseek")

    preferred_provider = str(getattr(Config, "AI_DEFAULT_PROVIDER", "") or "").strip().lower()
    if preferred_provider not in {"openai", "deepseek"}:
        preferred_provider = ""
    requested_provider = (
        preferred_provider
        if preferred_provider in supported_providers
        else supported_providers[0] if supported_providers
        else "openai"
    )
    resolved_runtime = (
        await resolve_provider_runtime(
            requested_provider,
            feature="presenton.runtime",
            user=current_user,
            require_healthy=False,
        )
        if supported_providers
        else None
    )
    chosen_llm = resolved_runtime.provider_id if resolved_runtime else requested_provider

    summary = _build_presenton_user_config_summary(
        selected_llm=chosen_llm,
        openai_runtime=openai_runtime,
        deepseek_runtime=deepseek_runtime,
    )
    overrides = {
        "CAN_CHANGE_KEYS": "false",
        "LLM": chosen_llm,
        "OPENAI_API_KEY": (
            resolved_runtime.api_key
            if resolved_runtime and resolved_runtime.provider_id == "openai"
            else openai_runtime.get("api_key") or ""
        ),
        "OPENAI_MODEL": (
            resolved_runtime.model
            if resolved_runtime and resolved_runtime.provider_id == "openai"
            else openai_runtime.get("model") or "gpt-5.5"
        ),
        "OPENAI_BASE_URL": (
            resolved_runtime.base_url
            if resolved_runtime and resolved_runtime.provider_id == "openai"
            else openai_runtime.get("base_url") or "https://api.openai.com/v1"
        ),
        "DEEPSEEK_API_KEY": (
            resolved_runtime.api_key
            if resolved_runtime and resolved_runtime.provider_id == "deepseek"
            else deepseek_runtime.get("api_key") or ""
        ),
        "DEEPSEEK_MODEL": (
            resolved_runtime.model
            if resolved_runtime and resolved_runtime.provider_id == "deepseek"
            else deepseek_runtime.get("model") or "deepseek-v4-pro"
        ),
        "DEEPSEEK_BASE_URL": (
            resolved_runtime.base_url
            if resolved_runtime and resolved_runtime.provider_id == "deepseek"
            else deepseek_runtime.get("base_url") or "https://api.deepseek.com"
        ),
        "DISABLE_IMAGE_GENERATION": "false" if has_openai else "true",
        "IMAGE_PROVIDER": "gpt-image-1.5" if has_openai else "",
        "NEXT_PUBLIC_FAST_API": public_origin,
        "NEXT_PUBLIC_URL": public_origin,
        "PUBLIC_WEB_ORIGIN": public_origin,
    }
    return summary, overrides


async def ensure_presenton_ready() -> None:
    global _PRESENTON_READY
    if _PRESENTON_READY:
        return

    async with _PRESENTON_READY_LOCK:
        if _PRESENTON_READY:
            return
        _ensure_presenton_static_assets()
        await create_db_and_tables()
        _PRESENTON_READY = True


async def presenton_request_context(
    request: Request,
    current_user: dict = Depends(get_presenton_current_user),
):
    await ensure_presenton_ready()
    _, overrides = await _load_presenton_host_config(request, current_user)
    owner_user_id = resolve_presenton_owner_user_id(current_user)
    request.state.presenton_owner_user_id = owner_user_id
    request.state.auth_username = str(
        current_user.get("username")
        or current_user.get("email")
        or current_user.get("id")
        or ""
    ).strip()
    token = set_request_env_overrides(overrides)
    owner_token = set_presenton_owner_user_id(owner_user_id)
    try:
        yield current_user
    finally:
        reset_presenton_owner_user_id(owner_token)
        reset_request_env_overrides(token)


def _content_disposition(filename: str) -> str:
    fallback = "".join(
        ch if ch.isalnum() or ch in "._-" else "_" for ch in filename
    ) or "download"
    return (
        f'attachment; filename="{fallback}"; '
        f"filename*=UTF-8''{quote(filename)}"
    )


def _get_safe_export_file_path(name: str) -> Path:
    file_name = name.strip()
    if not file_name:
        raise HTTPException(status_code=400, detail="Invalid export file name")
    if Path(file_name).name != file_name or "/" in file_name or "\\" in file_name:
        raise HTTPException(status_code=400, detail="Invalid export file name")

    exports_dir = Path(get_exports_directory()).resolve()
    candidate = (exports_dir / file_name).resolve()
    try:
        candidate.relative_to(exports_dir)
    except ValueError as exc:
        raise HTTPException(status_code=403, detail="Access denied") from exc
    return candidate


PRESENTON_HOST_ROUTER = APIRouter()
PRESENTON_HOST_ROUTER.include_router(
    API_V1_PPT_ROUTER,
    dependencies=[Depends(presenton_request_context)],
)


@PRESENTON_HOST_ROUTER.get("/api/v1/app/bootstrap")
async def presenton_bootstrap(
    request: Request,
    current_user: dict = Depends(get_presenton_current_user),
):
    await ensure_presenton_ready()
    summary, _ = await _load_presenton_host_config(request, current_user)
    ai_config = await load_ai_config(current_user)
    has_required_key = bool(
        ai_config.get("openai", {}).get("api_key_set")
        or ai_config.get("deepseek", {}).get("api_key_set")
    )
    return {
        "canChangeKeys": False,
        "hasRequiredKey": has_required_key,
        "telemetryEnabled": str(
            os.environ.get("DISABLE_ANONYMOUS_TRACKING") or ""
        ).strip().lower()
        != "true",
        "auth": {
            "configured": True,
            "authenticated": True,
            "username": current_user.get("username") or current_user.get("email"),
        },
        "capabilities": {
            "mode": "web",
            "browserDownload": True,
            "mcpProxy": True,
            "arbitraryLocalRead": False,
        },
        "origins": {
            "publicWebOrigin": _resolve_request_public_origin(request),
        },
        "userConfig": summary,
    }


@PRESENTON_HOST_ROUTER.get("/api/v1/app/user-config")
async def presenton_user_config(
    request: Request,
    current_user: dict = Depends(get_presenton_current_user),
):
    await ensure_presenton_ready()
    summary, _ = await _load_presenton_host_config(request, current_user)
    return summary


@PRESENTON_HOST_ROUTER.put("/api/v1/app/user-config")
async def presenton_user_config_update(
    _body: dict = Body(...),
    _current_user: dict = Depends(get_presenton_current_user),
):
    raise HTTPException(
        status_code=403,
        detail="Presenton AI settings are managed from your profile AI config.",
    )


@PRESENTON_HOST_ROUTER.post("/api/v1/app/export")
async def presenton_export(
    request: Request,
    body: PresentonAppExportRequest,
    _current_user: dict = Depends(get_presenton_current_user),
):
    await ensure_presenton_ready()

    export_format = (body.format or "").strip().lower()
    if export_format not in {"pdf", "pptx"}:
        raise HTTPException(status_code=400, detail="Invalid export format")

    public_origin = _resolve_request_public_origin(request)
    try:
        presentation_and_path = await export_presentation(
            uuid.UUID(body.id),
            (body.title or "").strip() or "presentation",
            export_format,  # type: ignore[arg-type]
            cookie_header=request.headers.get("cookie") or None,
            web_origin=public_origin,
            fastapi_url=public_origin,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid presentation id") from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Export failed: {exc}") from exc

    output_path = Path(presentation_and_path.path).resolve()
    exports_dir = Path(get_exports_directory()).resolve()

    try:
        relative_path = output_path.relative_to(exports_dir)
    except ValueError as exc:
        raise HTTPException(
            status_code=500,
            detail="Export finished outside the configured exports directory",
        ) from exc

    return {
        "success": True,
        "downloadUrl": f"/api/v1/app/export/file?name={quote(relative_path.name)}",
        "path": f"/app_data/exports/{relative_path.as_posix()}",
        "presentationId": body.id,
    }


@PRESENTON_HOST_ROUTER.get("/api/v1/app/export/file")
async def presenton_export_file(
    name: str = Query(...),
    _current_user: dict = Depends(get_presenton_current_user),
):
    await ensure_presenton_ready()
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


@PRESENTON_HOST_ROUTER.post("/api/v1/app/read-file")
async def presenton_read_file(
    body: dict = Body(...),
    _current_user: dict = Depends(get_presenton_current_user),
):
    await ensure_presenton_ready()
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


@PRESENTON_HOST_ROUTER.get(
    "/api/export-presentation-data/{presentation_id}",
    response_model=PresentationWithSlides,
)
async def presenton_export_presentation_data(
    presentation_id: uuid.UUID,
    sql_session: AsyncSession = Depends(get_async_session),
    _current_user: dict = Depends(get_presenton_current_user),
):
    await ensure_presenton_ready()

    presentation = await sql_session.get(PresentationModel, presentation_id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")

    slides_result = await sql_session.scalars(
        select(SlideModel)
        .where(SlideModel.presentation == presentation_id)
        .order_by(SlideModel.index)
    )
    slides = list(slides_result)
    fonts = await _resolve_presentation_fonts(presentation, slides, sql_session)
    return PresentationWithSlides(
        **presentation.model_dump(),
        slides=slides,
        fonts=fonts,
    )


def mount_presenton(app: FastAPI) -> None:
    _ensure_presenton_static_assets()
    app.include_router(PRESENTON_HOST_ROUTER)
