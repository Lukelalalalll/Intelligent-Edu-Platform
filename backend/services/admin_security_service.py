from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any

from backend.core.database import db
from backend.core.security import invalidate_user_cache
from backend.repositories import user_repo
from backend.services.auth_risk_service import LOGIN_SCOPE_PRINCIPAL, build_attempt_scope_key, normalize_login_principal
from backend.services.auth_session_service import revoke_all_sessions_for_user
from backend.services.password_security_service import utcnow

SECURITY_OVERVIEW_WINDOW_HOURS = 24


def _coerce_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    return None


def _serialize_event(doc: dict[str, Any]) -> dict[str, Any]:
    extra = dict(doc.get("extra") or {})
    return {
        "id": str(doc.get("_id") or ""),
        "level": str(doc.get("level") or "info"),
        "requestId": str(doc.get("request_id") or "unknown"),
        "userId": str(doc.get("user_id") or "anonymous"),
        "endpoint": str(doc.get("endpoint") or "unknown"),
        "action": str(doc.get("action") or "unknown_action"),
        "detail": str(doc.get("detail") or ""),
        "createdAt": (_coerce_datetime(doc.get("created_at")) or utcnow()).isoformat(),
        "extra": extra,
    }


def _serialize_lockout(doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "scopeKey": str(doc.get("scope_key") or ""),
        "scope": str(doc.get("scope") or ""),
        "attemptCount": int(doc.get("attempt_count") or 0),
        "lockedUntil": (_coerce_datetime(doc.get("locked_until")) or utcnow()).isoformat() if doc.get("locked_until") else None,
        "windowStartedAt": (_coerce_datetime(doc.get("window_started_at")) or utcnow()).isoformat() if doc.get("window_started_at") else None,
        "lastFailureAt": (_coerce_datetime(doc.get("last_failure_at")) or utcnow()).isoformat() if doc.get("last_failure_at") else None,
        "metadata": dict(doc.get("metadata") or {}),
    }


def _serialize_user_status(doc: dict[str, Any]) -> dict[str, Any]:
    mfa = dict(doc.get("mfa") or {})
    return {
        "id": str(doc.get("_id") or ""),
        "username": str(doc.get("username") or ""),
        "email": str(doc.get("email") or ""),
        "role": str(doc.get("role") or "student"),
        "status": str(doc.get("status") or "active"),
        "mfaEnabled": bool(mfa.get("enabled")),
        "lockedOut": bool(doc.get("locked_out")),
        "lockedUntil": (_coerce_datetime(doc.get("locked_until")) or utcnow()).isoformat() if doc.get("locked_until") else None,
        "updatedAt": (_coerce_datetime(doc.get("updated_at")) or utcnow()).isoformat() if doc.get("updated_at") else None,
        "passwordChangedAt": (_coerce_datetime(doc.get("password_changed_at")) or utcnow()).isoformat() if doc.get("password_changed_at") else None,
    }


async def get_security_overview() -> dict[str, Any]:
    now = utcnow()
    window_start = now - timedelta(hours=SECURITY_OVERVIEW_WINDOW_HOURS)

    total_events = await db.security_audit_events.count_documents({"created_at": {"$gte": window_start}})
    warning_events = await db.security_audit_events.count_documents({"created_at": {"$gte": window_start}, "level": "warning"})
    error_events = await db.security_audit_events.count_documents({"created_at": {"$gte": window_start}, "level": "error"})
    login_failures = await db.security_audit_events.count_documents({"created_at": {"$gte": window_start}, "action": "login_failed"})
    lockouts = await db.auth_attempt_counters.count_documents({"locked_until": {"$gt": now}})
    mfa_events = await db.security_audit_events.count_documents({
        "created_at": {"$gte": window_start},
        "action": {"$in": ["login_mfa_verified", "login_mfa_failed", "login_mfa_challenge_mismatch"]},
    })

    return {
        "windowHours": SECURITY_OVERVIEW_WINDOW_HOURS,
        "totals": {
            "events": total_events,
            "warnings": warning_events,
            "errors": error_events,
            "loginFailures": login_failures,
            "activeLockouts": lockouts,
            "mfaEvents": mfa_events,
        },
    }


async def list_security_events(
    *,
    limit: int = 50,
    action: str = "",
    level: str = "",
    user_id: str = "",
) -> dict[str, Any]:
    filt: dict[str, Any] = {}
    if action.strip():
        filt["action"] = action.strip()
    if level.strip():
        filt["level"] = level.strip().lower()
    if user_id.strip():
        filt["user_id"] = user_id.strip()

    capped_limit = max(1, min(int(limit or 50), 200))
    docs = await db.security_audit_events.find(filt).sort("created_at", -1).limit(capped_limit).to_list(length=capped_limit)
    return {"events": [_serialize_event(doc) for doc in docs], "count": len(docs)}


async def list_active_lockouts(*, limit: int = 100) -> dict[str, Any]:
    now = utcnow()
    capped_limit = max(1, min(int(limit or 100), 200))
    docs = await db.auth_attempt_counters.find({"locked_until": {"$gt": now}}).sort("locked_until", -1).limit(capped_limit).to_list(length=capped_limit)
    return {"lockouts": [_serialize_lockout(doc) for doc in docs], "count": len(docs)}


async def clear_lockout(*, scope_key: str) -> dict[str, Any]:
    result = await db.auth_attempt_counters.delete_one({"scope_key": str(scope_key or "").strip()})
    return {"cleared": bool(result.deleted_count)}


async def list_user_security_statuses(*, limit: int = 100, status: str = "", query: str = "") -> dict[str, Any]:
    filt: dict[str, Any] = {}
    if status.strip():
        filt["status"] = status.strip().lower()
    if query.strip():
        token = re.escape(query.strip())
        filt["$or"] = [
            {"username": {"$regex": token, "$options": "i"}},
            {"email": {"$regex": token, "$options": "i"}},
        ]

    capped_limit = max(1, min(int(limit or 100), 200))
    docs = await db.users.find(
        filt,
        {
            "username": 1,
            "username_normalized": 1,
            "email": 1,
            "role": 1,
            "status": 1,
            "mfa.enabled": 1,
            "updated_at": 1,
            "password_changed_at": 1,
        },
    ).sort("updated_at", -1).limit(capped_limit).to_list(length=capped_limit)
    now = utcnow()
    scope_keys = [
        build_attempt_scope_key(
            scope=LOGIN_SCOPE_PRINCIPAL,
            identifier=normalize_login_principal(str(doc.get("username_normalized") or doc.get("username") or "")),
        )
        for doc in docs
        if str(doc.get("username_normalized") or doc.get("username") or "").strip()
    ]
    lockout_docs = await db.auth_attempt_counters.find(
        {"scope_key": {"$in": scope_keys}, "locked_until": {"$gt": now}},
        {"scope_key": 1, "locked_until": 1},
    ).to_list(length=len(scope_keys) or 1)
    lockout_map = {str(doc.get("scope_key") or ""): doc for doc in lockout_docs}

    serialized: list[dict[str, Any]] = []
    for doc in docs:
        principal = normalize_login_principal(str(doc.get("username_normalized") or doc.get("username") or ""))
        scope_key = build_attempt_scope_key(scope=LOGIN_SCOPE_PRINCIPAL, identifier=principal) if principal else ""
        lockout = lockout_map.get(scope_key)
        doc = dict(doc)
        doc["locked_out"] = bool(lockout)
        doc["locked_until"] = (lockout or {}).get("locked_until")
        serialized.append(_serialize_user_status(doc))
    return {"users": serialized, "count": len(serialized)}


async def update_user_security_status(*, user_id: str, status: str, changed_by: str | None = None) -> dict[str, Any] | None:
    user_doc = await user_repo.find_by_id(user_id)
    if not user_doc:
        return None
    now = utcnow()
    update_fields: dict[str, Any] = {
        "status": status,
        "updated_at": now,
        "status_changed_at": now,
    }
    if changed_by:
        update_fields["status_changed_by"] = changed_by
    await user_repo.update_by_id(
        user_doc["_id"],
        {"$set": update_fields},
    )
    invalidate_user_cache(str(user_doc["_id"]))
    if status != "active":
        await revoke_all_sessions_for_user(str(user_doc["_id"]), reason=f"status:{status}")
    refreshed = await user_repo.find_by_id(user_doc["_id"])
    return _serialize_user_status(refreshed or user_doc)
