from __future__ import annotations

from http.cookies import SimpleCookie

from fastapi import HTTPException, Request
from jose import JWTError

from backend.config import Config
from backend.core.security import get_current_user
from backend.repositories import user_repo
from backend.services.auth.auth_session_service import decode_access_token, get_active_session_for_access

from .bootstrap import load_presenton_runtime


def resolve_request_public_origin(request: Request) -> str:
    runtime = load_presenton_runtime()
    return runtime.resolve_web_origin(
        explicit_origin=request.headers.get("x-presenton-web-origin"),
        forwarded_proto=request.headers.get("x-forwarded-proto"),
        forwarded_host=request.headers.get("x-forwarded-host") or request.headers.get("host"),
        origin_header=request.headers.get("origin"),
        referer_header=request.headers.get("referer"),
    )


def extract_cookie_value(raw_cookie_header: str, cookie_name: str) -> str:
    try:
        cookie = SimpleCookie()
        cookie.load(raw_cookie_header)
    except Exception:
        return ""
    morsel = cookie.get(cookie_name)
    if morsel is None:
        return ""
    return (morsel.value or "").strip()


async def authenticate_presenton_export_user(request: Request, raw_cookie_header: str) -> dict:
    token = extract_cookie_value(raw_cookie_header, Config.JWT_ACCESS_COOKIE_NAME)
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
        return await authenticate_presenton_export_user(request, export_cookie_header)
