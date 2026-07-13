from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from backend.config import Config
from backend.core.database import db
from backend.services.auth.password_security_service import utcnow

logger = logging.getLogger("backend.security.audit")


def _coerce_user_id(user_id: str) -> str:
    return str(user_id or "anonymous").strip() or "anonymous"


def _coerce_request_id(request_id: str) -> str:
    return str(request_id or "unknown").strip() or "unknown"


def _coerce_endpoint(endpoint: str) -> str:
    return str(endpoint or "unknown").strip() or "unknown"


def _normalize_level(level: str) -> str:
    normalized = str(level or "info").strip().lower()
    return normalized if normalized in {"info", "warning", "error"} else "info"


def build_security_event(
    *,
    level: str,
    request_id: str,
    user_id: str,
    endpoint: str,
    action: str,
    detail: str,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    now = utcnow()
    payload: dict[str, Any] = {
        "level": _normalize_level(level),
        "request_id": _coerce_request_id(request_id),
        "user_id": _coerce_user_id(user_id),
        "endpoint": _coerce_endpoint(endpoint),
        "action": str(action or "").strip() or "unknown_action",
        "detail": str(detail or "").strip() or "no detail provided",
        "created_at": now,
        "expires_at": now + timedelta(days=max(1, int(Config.SECURITY_AUDIT_RETENTION_DAYS))),
    }
    if extra:
        payload["extra"] = extra
    return payload


def _emit_log_line(payload: dict[str, Any]) -> None:
    line = (
        "security_event "
        f"request_id={payload['request_id']} "
        f"user_id={payload['user_id']} "
        f"endpoint={payload['endpoint']} "
        f"action={payload['action']} "
        f"detail={payload['detail']}"
    )
    level_name = payload["level"]
    if level_name == "error":
        logger.error(line)
    elif level_name == "warning":
        logger.warning(line)
    else:
        logger.info(line)


async def record_security_event(
    *,
    level: str,
    request_id: str,
    user_id: str,
    endpoint: str,
    action: str,
    detail: str,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = build_security_event(
        level=level,
        request_id=request_id,
        user_id=user_id,
        endpoint=endpoint,
        action=action,
        detail=detail,
        extra=extra,
    )
    _emit_log_line(payload)
    try:
        await db.security_audit_events.insert_one(payload)
    except Exception:
        logger.exception(
            "Failed to persist security event | request_id=%s action=%s",
            payload["request_id"],
            payload["action"],
        )
    return payload


def log_security_event(
    *,
    level: str,
    request_id: str,
    user_id: str,
    endpoint: str,
    action: str,
    detail: str,
    extra: dict[str, Any] | None = None,
) -> None:
    payload = build_security_event(
        level=level,
        request_id=request_id,
        user_id=user_id,
        endpoint=endpoint,
        action=action,
        detail=detail,
        extra=extra,
    )
    _emit_log_line(payload)

