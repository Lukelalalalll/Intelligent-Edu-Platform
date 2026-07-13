from __future__ import annotations

import hashlib
from datetime import timedelta
from typing import Any

from fastapi import HTTPException

from backend.config import Config
from backend.core.database import db
from backend.services.auth.password_security_service import normalize_email, normalize_username, utcnow

LOGIN_SCOPE_PRINCIPAL = "login_principal"
LOGIN_SCOPE_IP = "login_ip"
PASSWORD_RESET_SCOPE_IDENTIFIER = "password_reset_identifier"
PASSWORD_RESET_SCOPE_IP = "password_reset_ip"


def _safe_text(value: str, *, fallback: str) -> str:
    cleaned = str(value or "").strip()
    return cleaned or fallback


def _request_ip(request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    return _safe_text(getattr(request.client, "host", ""), fallback="unknown")


def _hash_value(value: str) -> str:
    return hashlib.sha256(str(value or "").encode("utf-8")).hexdigest()


def normalize_login_principal(username: str) -> str:
    return normalize_username(username)


def normalize_password_reset_identifier(*, username: str | None, email: str | None) -> str:
    normalized_email = normalize_email(email or "")
    normalized_username = normalize_username(username or "")
    if normalized_email:
        return f"email:{normalized_email}"
    if normalized_username:
        return f"username:{normalized_username}"
    return "anonymous"


def _scope_config(scope: str) -> dict[str, int]:
    if scope == LOGIN_SCOPE_PRINCIPAL:
        return {
            "window_minutes": int(Config.AUTH_LOGIN_PRINCIPAL_WINDOW_MINUTES),
            "max_attempts": int(Config.AUTH_LOGIN_PRINCIPAL_MAX_FAILURES),
            "lockout_minutes": int(Config.AUTH_LOGIN_PRINCIPAL_LOCKOUT_MINUTES),
        }
    if scope == LOGIN_SCOPE_IP:
        return {
            "window_minutes": int(Config.AUTH_LOGIN_IP_WINDOW_MINUTES),
            "max_attempts": int(Config.AUTH_LOGIN_IP_MAX_FAILURES),
            "lockout_minutes": int(Config.AUTH_LOGIN_IP_LOCKOUT_MINUTES),
        }
    if scope == PASSWORD_RESET_SCOPE_IDENTIFIER:
        return {
            "window_minutes": int(Config.AUTH_PASSWORD_RESET_IDENTIFIER_WINDOW_MINUTES),
            "max_attempts": int(Config.AUTH_PASSWORD_RESET_IDENTIFIER_MAX_REQUESTS),
            "lockout_minutes": int(Config.AUTH_PASSWORD_RESET_IDENTIFIER_WINDOW_MINUTES),
        }
    if scope == PASSWORD_RESET_SCOPE_IP:
        return {
            "window_minutes": int(Config.AUTH_PASSWORD_RESET_IP_WINDOW_MINUTES),
            "max_attempts": int(Config.AUTH_PASSWORD_RESET_IP_MAX_REQUESTS),
            "lockout_minutes": int(Config.AUTH_PASSWORD_RESET_IP_WINDOW_MINUTES),
        }
    raise ValueError(f"Unsupported auth risk scope: {scope}")


def _build_attempt_key(*, scope: str, identifier: str) -> str:
    return f"{scope}:{_hash_value(identifier)}"


def build_attempt_scope_key(*, scope: str, identifier: str) -> str:
    return _build_attempt_key(scope=scope, identifier=identifier)


async def get_active_attempt_state(*, scope: str, identifier: str) -> dict[str, Any] | None:
    return await db.auth_attempt_counters.find_one({"scope_key": _build_attempt_key(scope=scope, identifier=identifier)})


async def assert_not_locked(*, scope: str, identifier: str, detail: str) -> dict[str, Any] | None:
    state = await get_active_attempt_state(scope=scope, identifier=identifier)
    if not state:
        return None
    locked_until = state.get("locked_until")
    if locked_until and locked_until > utcnow():
        raise HTTPException(status_code=429, detail=detail)
    return state


async def register_attempt(
    *,
    scope: str,
    identifier: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    config = _scope_config(scope)
    now = utcnow()
    window_start = now - timedelta(minutes=max(1, config["window_minutes"]))
    scope_key = _build_attempt_key(scope=scope, identifier=identifier)

    current = await db.auth_attempt_counters.find_one({"scope_key": scope_key})
    if current and current.get("last_failure_at") and current["last_failure_at"] < window_start:
        current = None

    attempt_count = int((current or {}).get("attempt_count") or (current or {}).get("failure_count") or 0) + 1
    locked_until = None
    if attempt_count >= max(1, config["max_attempts"]):
        locked_until = now + timedelta(minutes=max(1, config["lockout_minutes"]))

    doc = {
        "scope_key": scope_key,
        "scope": scope,
        "identifier_hash": _hash_value(identifier),
        "attempt_count": attempt_count,
        "window_started_at": (current or {}).get("window_started_at") or now,
        "last_failure_at": now,
        "locked_until": locked_until,
        "updated_at": now,
        "expires_at": now + timedelta(minutes=max(config["window_minutes"], config["lockout_minutes"]) + 5),
    }
    if metadata:
        doc["metadata"] = metadata
    await db.auth_attempt_counters.update_one(
        {"scope_key": scope_key},
        {"$set": doc, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    return doc


async def register_failure(
    *,
    scope: str,
    identifier: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return await register_attempt(scope=scope, identifier=identifier, metadata=metadata)


async def clear_attempt_state(*, scope: str, identifier: str) -> None:
    await db.auth_attempt_counters.delete_one({"scope_key": _build_attempt_key(scope=scope, identifier=identifier)})


def login_request_context(request) -> dict[str, str]:
    ip_address = _request_ip(request)
    return {
        "ip_address": ip_address,
        "ip_identifier": ip_address,
        "user_agent": request.headers.get("user-agent", "")[:512],
    }


def password_reset_request_context(request) -> dict[str, str]:
    return login_request_context(request)

