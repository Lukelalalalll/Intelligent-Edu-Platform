from __future__ import annotations

import copy
from datetime import datetime, timezone

from fastapi import HTTPException

from backend.core.database import db
from backend.repositories import user_repo
from backend.services.mfa_security_service import (
    assert_step_up_recent,
    build_backup_code_records,
    consume_backup_code,
    decrypt_mfa_secret,
    encrypt_mfa_secret,
    generate_backup_codes,
    generate_mfa_enrollment,
    get_mfa_policy_snapshot,
    normalize_mfa_code,
    verify_totp_code,
)
from backend.services.password_security_service import utcnow, verify_password
from backend.services.secret_storage import decrypt_secret, encrypt_secret

DEFAULT_HISTORY_TTL_DAYS = 90

_DEFAULT_PREFS = {
    "feedback_style": "concise",
    "feedback_language": "English",
    "auto_rag": True,
    "default_rag_top_k": 4,
    "email_auto_classify": True,
    "email_suggest_reply": True,
}

_DEFAULT_DEEPSEEK_CONFIG = {
    "base_url": "https://api.deepseek.com",
    "model": "deepseek-v4-pro",
    "stream": False,
    "reasoning_effort": "high",
    "thinking_type": "enabled",
}

_DEFAULT_OPENAI_CONFIG = {
    "base_url": "https://api.openai.com/v1",
    "model": "gpt-5.5",
    "stream": False,
}

def get_default_preferences() -> dict:
    return copy.deepcopy(_DEFAULT_PREFS)


def build_deepseek_response(raw_config: dict | None, *, include_api_key: bool = False) -> dict:
    raw = raw_config or {}
    encrypted_key = raw.get("api_key_encrypted") or raw.get("api_key") or ""
    migrated_base_url = raw.get("base_url") or raw.get("base_url_openai") or _DEFAULT_DEEPSEEK_CONFIG["base_url"]
    return {
        **_DEFAULT_DEEPSEEK_CONFIG,
        **{key: raw.get(key) for key in _DEFAULT_DEEPSEEK_CONFIG if raw.get(key) is not None},
        "base_url": migrated_base_url,
        "api_key": decrypt_secret(encrypted_key) if include_api_key else "",
        "api_key_set": bool(decrypt_secret(encrypted_key)),
        "updated_at": raw.get("updated_at"),
    }


def build_openai_response(raw_config: dict | None, *, include_api_key: bool = False) -> dict:
    raw = raw_config or {}
    encrypted_key = raw.get("api_key_encrypted") or raw.get("api_key") or ""
    return {
        **_DEFAULT_OPENAI_CONFIG,
        **{key: raw.get(key) for key in _DEFAULT_OPENAI_CONFIG if raw.get(key) is not None},
        "api_key": decrypt_secret(encrypted_key) if include_api_key else "",
        "api_key_set": bool(decrypt_secret(encrypted_key)),
        "updated_at": raw.get("updated_at"),
    }


async def load_profile_courses(current_user: dict) -> dict:
    from backend.services.enrollment_service import get_user_course_profile

    return await get_user_course_profile(current_user)


async def load_preferences(current_user: dict) -> dict:
    user_doc = await db.users.find_one({"_id": current_user["_id"]})
    prefs = (user_doc or {}).get("preferences", get_default_preferences())
    return {"preferences": {**get_default_preferences(), **prefs}}


async def save_preferences(current_user: dict, payload: dict) -> dict:
    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"preferences": payload}},
    )
    return {"message": "Preferences updated", "preferences": payload}


async def load_history_settings(current_user: dict) -> dict:
    user_doc = await db.users.find_one({"_id": current_user["_id"]})
    ttl = (user_doc or {}).get("history_ttl_days", DEFAULT_HISTORY_TTL_DAYS)
    return {"history_ttl_days": ttl}


async def save_history_settings(current_user: dict, ttl: int) -> dict:
    if ttl < 0:
        raise HTTPException(status_code=400, detail="history_ttl_days must be a non-negative integer")
    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"history_ttl_days": ttl}},
    )
    return {"message": "History settings updated", "history_ttl_days": ttl}


async def load_ai_config(current_user: dict) -> dict:
    user_doc = await db.users.find_one({"_id": current_user["_id"]}, {"ai_config": 1})
    ai_config = (user_doc or {}).get("ai_config") or {}
    return {
        "deepseek": build_deepseek_response(ai_config.get("deepseek")),
        "openai": build_openai_response(ai_config.get("openai")),
    }


async def load_deepseek_runtime_config(current_user: dict) -> dict:
    user_doc = await db.users.find_one({"_id": current_user["_id"]}, {"ai_config.deepseek": 1})
    ai_config = (user_doc or {}).get("ai_config") or {}
    return build_deepseek_response(ai_config.get("deepseek"), include_api_key=True)


async def load_openai_runtime_config(current_user: dict) -> dict:
    user_doc = await db.users.find_one({"_id": current_user["_id"]}, {"ai_config.openai": 1})
    ai_config = (user_doc or {}).get("ai_config") or {}
    return build_openai_response(ai_config.get("openai"), include_api_key=True)


async def save_deepseek_config(current_user: dict, payload) -> dict:
    existing_user = await db.users.find_one({"_id": current_user["_id"]}, {"ai_config": 1})
    existing = ((existing_user or {}).get("ai_config") or {}).get("deepseek") or {}
    update_doc = {
        **_DEFAULT_DEEPSEEK_CONFIG,
        **existing,
        "base_url": payload.base_url,
        "model": payload.model,
        "stream": payload.stream,
        "reasoning_effort": payload.reasoning_effort,
        "thinking_type": payload.thinking_type,
        "updated_at": datetime.now(timezone.utc),
    }
    if payload.clear_api_key:
        update_doc["api_key_encrypted"] = ""
    elif payload.api_key is not None and payload.api_key.strip():
        update_doc["api_key_encrypted"] = encrypt_secret(payload.api_key.strip())

    update_doc.pop("api_key", None)
    update_doc.pop("base_url_openai", None)
    update_doc.pop("base_url_anthropic", None)

    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"ai_config.deepseek": update_doc}},
    )
    return {"message": "DeepSeek config updated", "deepseek": build_deepseek_response(update_doc)}


async def save_openai_config(current_user: dict, payload) -> dict:
    existing_user = await db.users.find_one({"_id": current_user["_id"]}, {"ai_config": 1})
    existing = ((existing_user or {}).get("ai_config") or {}).get("openai") or {}
    update_doc = {
        **_DEFAULT_OPENAI_CONFIG,
        **existing,
        "base_url": payload.base_url,
        "model": payload.model,
        "stream": payload.stream,
        "updated_at": datetime.now(timezone.utc),
    }
    if payload.clear_api_key:
        update_doc["api_key_encrypted"] = ""
    elif payload.api_key is not None and payload.api_key.strip():
        update_doc["api_key_encrypted"] = encrypt_secret(payload.api_key.strip())

    update_doc.pop("api_key", None)

    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"ai_config.openai": update_doc}},
    )
    return {"message": "OpenAI config updated", "openai": build_openai_response(update_doc)}


async def get_profile_security_state(current_user: dict) -> dict:
    user_doc = await user_repo.find_by_id(current_user["_id"], {"mfa": 1, "updated_at": 1})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    pending = dict((user_doc.get("mfa") or {}).get("enrollment_pending") or {})
    return {
        "mfa": get_mfa_policy_snapshot(user_doc),
        "enrollmentPending": {
            "active": bool(pending.get("secret_encrypted")),
            "startedAt": pending.get("started_at").isoformat() if pending.get("started_at") else None,
        },
    }


async def start_mfa_enrollment_for_user(current_user: dict, *, password: str) -> dict:
    if not verify_password(password, current_user.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    fresh_user = await user_repo.find_by_id(current_user["_id"], {"username": 1, "mfa": 1})
    if not fresh_user:
        raise HTTPException(status_code=404, detail="User not found")

    mfa_doc = dict(fresh_user.get("mfa") or {})
    if mfa_doc.get("enabled"):
        raise HTTPException(status_code=409, detail="MFA is already enabled")

    enrollment = generate_mfa_enrollment(fresh_user.get("username") or current_user.get("username") or "user")
    now = utcnow()
    pending = {
        "secret_encrypted": encrypt_mfa_secret(enrollment["secret"]),
        "started_at": now,
    }
    await user_repo.update_by_id(
        fresh_user["_id"],
        {
            "$set": {
                "mfa.enrollment_pending": pending,
                "updated_at": now,
            }
        },
    )
    from backend.core.security import invalidate_user_cache

    invalidate_user_cache(str(fresh_user["_id"]))
    return {
        "secret": enrollment["secret"],
        "otpauthUri": enrollment["otpauth_uri"],
        "message": "MFA enrollment started",
    }


async def verify_mfa_enrollment_for_user(current_user: dict, *, code: str) -> dict:
    fresh_user = await user_repo.find_by_id(current_user["_id"], {"mfa": 1})
    if not fresh_user:
        raise HTTPException(status_code=404, detail="User not found")

    mfa_doc = dict(fresh_user.get("mfa") or {})
    pending = dict(mfa_doc.get("enrollment_pending") or {})
    encrypted_pending_secret = pending.get("secret_encrypted")
    secret = decrypt_mfa_secret(encrypted_pending_secret)
    if not secret:
        raise HTTPException(status_code=400, detail="No MFA enrollment is pending")

    normalized_code = normalize_mfa_code(code)
    if not verify_totp_code(secret, normalized_code):
        raise HTTPException(status_code=400, detail="Invalid MFA code")

    backup_codes = generate_backup_codes()
    now = utcnow()
    mfa_update = {
        "enabled": True,
        "preferred_method": "totp",
        "totp_secret_encrypted": encrypted_pending_secret,
        "backup_codes": build_backup_code_records(backup_codes),
        "enrolled_at": now,
        "enrollment_pending": {},
    }
    await user_repo.update_by_id(
        fresh_user["_id"],
        {
            "$set": {
                "mfa": mfa_update,
                "updated_at": now,
            }
        },
    )
    from backend.core.security import invalidate_user_cache

    invalidate_user_cache(str(fresh_user["_id"]))
    return {
        "message": "MFA enabled successfully",
        "backupCodes": backup_codes,
        "mfa": get_mfa_policy_snapshot({"mfa": mfa_update}),
    }


async def disable_mfa_for_user(current_user: dict, *, password: str, code: str) -> dict:
    if not verify_password(password, current_user.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    fresh_user = await user_repo.find_by_id(current_user["_id"], {"mfa": 1})
    if not fresh_user:
        raise HTTPException(status_code=404, detail="User not found")

    mfa_doc = dict(fresh_user.get("mfa") or {})
    if not mfa_doc.get("enabled"):
        raise HTTPException(status_code=400, detail="MFA is not enabled")

    normalized_code = normalize_mfa_code(code)
    secret = decrypt_mfa_secret(mfa_doc.get("totp_secret_encrypted"))
    verified = bool(secret and verify_totp_code(secret, normalized_code))
    updated_backup_codes = None
    if not verified:
        verified, updated_backup_codes = consume_backup_code(mfa_doc.get("backup_codes"), normalized_code)
    if not verified:
        raise HTTPException(status_code=400, detail="Invalid MFA code")

    now = utcnow()
    cleared_mfa = {
        "enabled": False,
        "preferred_method": "totp",
        "totp_secret_encrypted": "",
        "backup_codes": [],
        "enrolled_at": None,
        "enrollment_pending": {},
        "disabled_at": now,
    }
    await user_repo.update_by_id(
        fresh_user["_id"],
        {
            "$set": {
                "mfa": cleared_mfa,
                "updated_at": now,
            }
        },
    )
    from backend.core.security import invalidate_user_cache

    invalidate_user_cache(str(fresh_user["_id"]))
    return {"message": "MFA disabled successfully", "mfa": get_mfa_policy_snapshot({"mfa": cleared_mfa})}


async def generate_new_backup_codes_for_user(current_user: dict, *, password: str) -> dict:
    if not verify_password(password, current_user.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    fresh_user = await user_repo.find_by_id(current_user["_id"], {"mfa": 1})
    if not fresh_user:
        raise HTTPException(status_code=404, detail="User not found")

    mfa_doc = dict(fresh_user.get("mfa") or {})
    if not mfa_doc.get("enabled") or not mfa_doc.get("totp_secret_encrypted"):
        raise HTTPException(status_code=400, detail="MFA is not enabled")

    backup_codes = generate_backup_codes()
    now = utcnow()
    await user_repo.update_by_id(
        fresh_user["_id"],
        {
            "$set": {
                "mfa.backup_codes": build_backup_code_records(backup_codes),
                "updated_at": now,
            }
        },
    )
    from backend.core.security import invalidate_user_cache

    invalidate_user_cache(str(fresh_user["_id"]))
    return {"message": "Backup codes regenerated", "backupCodes": backup_codes}


async def verify_step_up_for_session(*, current_user: dict, session_doc: dict, code: str) -> dict:
    fresh_user = await user_repo.find_by_id(current_user["_id"], {"mfa": 1})
    if not fresh_user:
        raise HTTPException(status_code=404, detail="User not found")

    mfa_doc = dict(fresh_user.get("mfa") or {})
    if not mfa_doc.get("enabled"):
        raise HTTPException(status_code=400, detail="MFA is not enabled")

    normalized_code = normalize_mfa_code(code)
    secret = decrypt_mfa_secret(mfa_doc.get("totp_secret_encrypted"))
    verified = bool(secret and verify_totp_code(secret, normalized_code))
    method = "otp"
    updated_backup_codes = None
    if not verified:
        verified, updated_backup_codes = consume_backup_code(mfa_doc.get("backup_codes"), normalized_code)
        if verified:
            method = "backup_code"
    if not verified:
        raise HTTPException(status_code=400, detail="Invalid MFA code")

    now = utcnow()
    if updated_backup_codes is not None:
        await user_repo.update_by_id(
            fresh_user["_id"],
            {"$set": {"mfa.backup_codes": updated_backup_codes, "updated_at": now}},
        )
        from backend.core.security import invalidate_user_cache

        invalidate_user_cache(str(fresh_user["_id"]))

    from backend.services.auth_session_service import mark_session_step_up

    result = await mark_session_step_up(str(session_doc.get("session_id") or ""), method=method)
    assert_step_up_recent(
        {
            **session_doc,
            "step_up_expires_at": result["expiresAt"],
        }
    )
    return {
        "message": "Step-up verification successful",
        "verifiedAt": result["verifiedAt"].isoformat(),
        "expiresAt": result["expiresAt"].isoformat(),
        "method": method,
    }
