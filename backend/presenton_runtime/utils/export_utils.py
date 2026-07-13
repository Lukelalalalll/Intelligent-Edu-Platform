import os
import logging
from http.cookies import SimpleCookie
from typing import Literal
from urllib.parse import urlencode, urlparse
import uuid

from pathvalidate import sanitize_filename

from models.presentation_and_path import PresentationAndPath
from utils.get_env import get_fastapi_public_base_url
from utils.filename_utils import safe_export_basename
from services.export_task_service import EXPORT_TASK_SERVICE
from utils.runtime_limits import log_memory


LOGGER = logging.getLogger(__name__)


def _get_next_public_url() -> str:
    configured = (os.getenv("PUBLIC_WEB_ORIGIN") or "").strip()
    if configured:
        return configured.rstrip("/")
    configured = (os.getenv("NEXT_PUBLIC_URL") or "").strip()
    if configured:
        return configured.rstrip("/")
    return "http://127.0.0.1:3000"


def _get_next_public_fastapi_url() -> str | None:
    value = (get_fastapi_public_base_url() or "").strip()
    return value or None


def _normalize_http_origin(value: str | None) -> str | None:
    if not value:
        return None
    candidate = value.strip()
    if not candidate:
        return None
    parsed = urlparse(candidate)
    if parsed.scheme in {"http", "https"} and parsed.netloc:
        return f"{parsed.scheme}://{parsed.netloc}"
    return None


def resolve_web_origin(
    *,
    explicit_origin: str | None = None,
    forwarded_proto: str | None = None,
    forwarded_host: str | None = None,
    origin_header: str | None = None,
    referer_header: str | None = None,
) -> str:
    for candidate in (explicit_origin, origin_header, referer_header):
        normalized = _normalize_http_origin(candidate)
        if normalized:
            return normalized

    proto = (forwarded_proto or "").split(",")[0].strip().lower()
    host = (forwarded_host or "").split(",")[0].strip()
    if proto in {"http", "https"} and host:
        return f"{proto}://{host}"

    return _get_next_public_url()


def _extract_session_cookie_value(cookie_header: str | None) -> str | None:
    if not cookie_header:
        return None
    try:
        cookie = SimpleCookie()
        cookie.load(cookie_header)
    except Exception:
        return None

    session = cookie.get("presenton_session")
    if not session:
        return None
    value = (session.value or "").strip()
    return value or None


def _build_presentation_export_url(
    presentation_id: uuid.UUID,
    export_as: Literal["pptx", "pdf"],
    cookie_header: str | None = None,
    web_origin: str | None = None,
    fastapi_url: str | None = None,
) -> tuple[str, str | None]:
    params = {"id": str(presentation_id), "exportAs": export_as}
    resolved_fastapi_url = (fastapi_url or _get_next_public_fastapi_url() or "").strip()
    if resolved_fastapi_url:
        params["fastapiUrl"] = resolved_fastapi_url
    export_session = _extract_session_cookie_value(cookie_header)
    if export_session:
        params["exportSession"] = export_session
    base_url = (web_origin or _get_next_public_url()).rstrip("/")
    export_url = f"{base_url}/pdf-maker?{urlencode(params)}"
    if cookie_header:
        export_url = f"{export_url}#{urlencode({'exportCookie': cookie_header})}"
    return (
        export_url,
        resolved_fastapi_url or None,
    )


async def export_presentation(
    presentation_id: uuid.UUID,
    title: str,
    export_as: Literal["pptx", "pdf"],
    cookie_header: str | None = None,
    web_origin: str | None = None,
    fastapi_url: str | None = None,
) -> PresentationAndPath:
    log_memory(
        LOGGER,
        "presentation.export.start",
        presentation_id=str(presentation_id),
        export_as=export_as,
    )
    export_url, fastapi_url = _build_presentation_export_url(
        presentation_id,
        export_as,
        cookie_header,
        web_origin=web_origin,
        fastapi_url=fastapi_url,
    )
    name = (title or "").strip() or str(uuid.uuid4())
    export_result = await EXPORT_TASK_SERVICE.export_from_url(
        url=export_url,
        title=safe_export_basename(sanitize_filename(name)),
        export_as=export_as,
        fastapi_url=fastapi_url,
        cookie_header=cookie_header,
    )
    log_memory(
        LOGGER,
        "presentation.export.finish",
        presentation_id=str(presentation_id),
        export_as=export_as,
    )
    return PresentationAndPath(
        presentation_id=presentation_id,
        path=export_result.path,
    )
