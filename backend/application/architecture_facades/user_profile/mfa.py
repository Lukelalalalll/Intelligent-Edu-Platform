from __future__ import annotations

from fastapi import HTTPException

from backend.repositories import user_repo
from backend.services.auth.mfa_security_service import (
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
from backend.services.auth.password_security_service import utcnow, verify_password


async def get_profile_security_state(current_user: dict) -> dict:
    user_doc = await user_repo.find_by_id(current_user["_id"], {"mfa": 1, "updated_at": 1})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    pending = dict((user_doc.get("mfa") or {}).get("enrollment_pending") or {})
    return {
        "mfa": get_mfa_policy_snapshot(user_doc),
        "enrollmentPending": {
            "active": bool(pending.get("secret_encrypted")),
            "startedAt": pending.get("started_at").isoformat()
            if pending.get("started_at")
            else None,
        },
    }


async def start_mfa_enrollment_for_user(current_user: dict, *, password: str) -> dict:
    if not verify_password(password, current_user.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    fresh_user = await user_repo.find_by_id(current_user["_id"], {"username": 1, "mfa": 1})
    if not fresh_user:
        raise HTTPException(status_code=404, detail="User not found")
    if dict(fresh_user.get("mfa") or {}).get("enabled"):
        raise HTTPException(status_code=409, detail="MFA is already enabled")

    enrollment = generate_mfa_enrollment(
        fresh_user.get("username") or current_user.get("username") or "user"
    )
    now = utcnow()
    pending = {
        "secret_encrypted": encrypt_mfa_secret(enrollment["secret"]),
        "started_at": now,
    }
    await user_repo.update_by_id(
        fresh_user["_id"],
        {"$set": {"mfa.enrollment_pending": pending, "updated_at": now}},
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
        {"$set": {"mfa": mfa_update, "updated_at": now}},
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
    if not verified:
        verified, _ = consume_backup_code(mfa_doc.get("backup_codes"), normalized_code)
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
        {"$set": {"mfa": cleared_mfa, "updated_at": now}},
    )
    from backend.core.security import invalidate_user_cache

    invalidate_user_cache(str(fresh_user["_id"]))
    return {
        "message": "MFA disabled successfully",
        "mfa": get_mfa_policy_snapshot({"mfa": cleared_mfa}),
    }


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
        {"$set": {"mfa.backup_codes": build_backup_code_records(backup_codes), "updated_at": now}},
    )
    from backend.core.security import invalidate_user_cache

    invalidate_user_cache(str(fresh_user["_id"]))
    return {"message": "Backup codes regenerated", "backupCodes": backup_codes}


async def verify_step_up_for_session(
    *,
    current_user: dict,
    session_doc: dict,
    code: str,
) -> dict:
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
        verified, updated_backup_codes = consume_backup_code(
            mfa_doc.get("backup_codes"),
            normalized_code,
        )
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

    from backend.services.auth.auth_session_service import mark_session_step_up

    result = await mark_session_step_up(
        str(session_doc.get("session_id") or ""),
        method=method,
    )
    assert_step_up_recent(
        {**session_doc, "step_up_expires_at": result["expiresAt"]}
    )
    return {
        "message": "Step-up verification successful",
        "verifiedAt": result["verifiedAt"].isoformat(),
        "expiresAt": result["expiresAt"].isoformat(),
        "method": method,
    }
