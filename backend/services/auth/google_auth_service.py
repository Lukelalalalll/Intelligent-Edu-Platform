from __future__ import annotations

import re
from datetime import timedelta
from typing import Any
from uuid import uuid4

from fastapi import HTTPException
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token as google_id_token

from backend.config import Config
from backend.core.security import invalidate_user_cache
from backend.repositories import google_auth_ticket_repo, staff_code_repo, user_repo
from backend.services.auth.password_security_service import normalize_email, normalize_username, utcnow, verify_password

GOOGLE_AUTH_TICKET_TTL = timedelta(minutes=10)


def _ensure_google_login_enabled() -> None:
    if not str(Config.GOOGLE_AUTH_CLIENT_ID or "").strip():
        raise HTTPException(status_code=503, detail="Google sign-in is not configured")


def _require_active_user(user_doc: dict[str, Any]) -> None:
    if str(user_doc.get("status") or "active").lower() != "active":
        raise HTTPException(status_code=403, detail="Account is not allowed to sign in")


def _build_google_auth_document(
    claims: dict[str, Any],
    *,
    linked_at,
    last_login_at,
) -> dict[str, Any]:
    return {
        "sub": str(claims["sub"]),
        "email": str(claims.get("email") or "").strip(),
        "email_verified": bool(claims.get("email_verified")),
        "name": str(claims.get("name") or "").strip() or None,
        "picture": str(claims.get("picture") or "").strip() or None,
        "locale": str(claims.get("locale") or "").strip() or None,
        "hd": str(claims.get("hd") or "").strip() or None,
        "linked_at": linked_at,
        "last_login_at": last_login_at,
    }


def _assert_verified_email(claims: dict[str, Any]) -> str:
    email = str(claims.get("email") or "").strip()
    if not email or not bool(claims.get("email_verified")):
        raise HTTPException(status_code=400, detail="Google account must provide a verified email address")
    return email


def _suggest_username(claims: dict[str, Any]) -> str:
    email = str(claims.get("email") or "").strip()
    email_local = email.split("@", 1)[0] if "@" in email else email
    name = str(claims.get("name") or "").strip()
    candidate = name or email_local or "user"
    cleaned = re.sub(r"\s+", "", candidate)
    cleaned = re.sub(r"[^\w.\-]+", "", cleaned, flags=re.UNICODE)
    return (cleaned or "user")[:64]


async def _create_ticket(
    *,
    kind: str,
    claims: dict[str, Any],
    candidate_user_id: str | None = None,
) -> dict[str, Any]:
    now = utcnow()
    ticket_id = uuid4().hex
    document = {
        "ticket_id": ticket_id,
        "kind": kind,
        "google_claims": {
            "sub": str(claims["sub"]),
            "email": str(claims.get("email") or "").strip(),
            "email_verified": bool(claims.get("email_verified")),
            "name": str(claims.get("name") or "").strip() or None,
            "picture": str(claims.get("picture") or "").strip() or None,
            "locale": str(claims.get("locale") or "").strip() or None,
            "hd": str(claims.get("hd") or "").strip() or None,
        },
        "candidate_user_id": candidate_user_id,
        "expires_at": now + GOOGLE_AUTH_TICKET_TTL,
        "consumed_at": None,
        "created_at": now,
        "updated_at": now,
    }
    await google_auth_ticket_repo.insert_ticket(document)
    return {
        "ticketId": ticket_id,
        "expiresAt": document["expires_at"].isoformat(),
    }


async def _get_valid_ticket(ticket_id: str, *, expected_kind: str) -> dict[str, Any]:
    ticket = await google_auth_ticket_repo.find_by_ticket_id(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Google sign-in ticket not found")
    if str(ticket.get("kind") or "") != expected_kind:
        raise HTTPException(status_code=400, detail="Google sign-in ticket is invalid")
    if ticket.get("consumed_at"):
        raise HTTPException(status_code=400, detail="Google sign-in ticket has already been used")
    expires_at = ticket.get("expires_at")
    if expires_at and expires_at <= utcnow():
        raise HTTPException(status_code=400, detail="Google sign-in ticket has expired")
    return ticket


async def _consume_ticket(ticket_id: str) -> None:
    now = utcnow()
    await google_auth_ticket_repo.update_by_ticket_id(
        ticket_id,
        {"$set": {"consumed_at": now, "updated_at": now}},
    )


def verify_google_credential(credential: str) -> dict[str, Any]:
    _ensure_google_login_enabled()
    try:
        payload = google_id_token.verify_oauth2_token(
            credential,
            GoogleRequest(),
            Config.GOOGLE_AUTH_CLIENT_ID,
        )
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid Google credential") from exc

    sub = str(payload.get("sub") or "").strip()
    if not sub:
        raise HTTPException(status_code=401, detail="Google credential is missing subject")
    if str(payload.get("aud") or "") != str(Config.GOOGLE_AUTH_CLIENT_ID):
        raise HTTPException(status_code=401, detail="Google credential audience mismatch")

    return {
        "sub": sub,
        "email": str(payload.get("email") or "").strip(),
        "email_verified": bool(payload.get("email_verified")),
        "name": str(payload.get("name") or "").strip() or None,
        "picture": str(payload.get("picture") or "").strip() or None,
        "locale": str(payload.get("locale") or "").strip() or None,
        "hd": str(payload.get("hd") or "").strip() or None,
    }


async def start_google_login(credential: str) -> dict[str, Any]:
    claims = verify_google_credential(credential)
    now = utcnow()
    linked_user = await user_repo.find_by_google_sub(claims["sub"])
    if linked_user:
        _require_active_user(linked_user)
        existing_google_auth = dict(linked_user.get("google_auth") or {})
        google_auth = _build_google_auth_document(
            claims,
            linked_at=existing_google_auth.get("linked_at") or now,
            last_login_at=now,
        )
        await user_repo.update_by_id(
            linked_user["_id"],
            {"$set": {"google_auth": google_auth, "updated_at": now}},
        )
        invalidate_user_cache(str(linked_user["_id"]))
        linked_user["google_auth"] = google_auth
        linked_user["updated_at"] = now
        return {
            "action": "authenticated",
            "user": linked_user,
            "primary_auth_method": "google",
        }

    email = _assert_verified_email(claims)
    normalized_email = normalize_email(email)
    existing_email_user = await user_repo.find_by_email_normalized(normalized_email)
    if existing_email_user is None:
        existing_email_user = await user_repo.find_by_email(email)
    if existing_email_user:
        _require_active_user(existing_email_user)
        existing_sub = str(((existing_email_user.get("google_auth") or {}).get("sub")) or "")
        if existing_sub and existing_sub != claims["sub"]:
            raise HTTPException(status_code=409, detail="Account is already linked to another Google identity")
        ticket = await _create_ticket(
            kind="link_account",
            claims=claims,
            candidate_user_id=str(existing_email_user["_id"]),
        )
        return {
            "action": "link_account",
            "ticketId": ticket["ticketId"],
            "expiresAt": ticket["expiresAt"],
            "email": existing_email_user.get("email") or email,
            "name": claims.get("name"),
            "avatarUrl": claims.get("picture"),
        }

    ticket = await _create_ticket(kind="complete_profile", claims=claims)
    return {
        "action": "complete_profile",
        "ticketId": ticket["ticketId"],
        "expiresAt": ticket["expiresAt"],
        "email": email,
        "name": claims.get("name"),
        "avatarUrl": claims.get("picture"),
        "suggestedUsername": _suggest_username(claims),
    }


async def link_google_account(*, ticket_id: str, password: str) -> dict[str, Any]:
    ticket = await _get_valid_ticket(ticket_id, expected_kind="link_account")
    candidate_user_id = str(ticket.get("candidate_user_id") or "")
    user_doc = await user_repo.find_by_id(candidate_user_id)
    if not user_doc:
        raise HTTPException(status_code=404, detail="Account to link was not found")
    _require_active_user(user_doc)
    if not verify_password(password, user_doc.get("password_hash") or ""):
        raise HTTPException(status_code=401, detail="Wrong password")

    claims = dict(ticket.get("google_claims") or {})
    existing_sub = str(((user_doc.get("google_auth") or {}).get("sub")) or "")
    if existing_sub and existing_sub != str(claims.get("sub") or ""):
        raise HTTPException(status_code=409, detail="Account is already linked to another Google identity")

    now = utcnow()
    google_auth = _build_google_auth_document(claims, linked_at=now, last_login_at=now)
    await user_repo.update_by_id(
        user_doc["_id"],
        {"$set": {"google_auth": google_auth, "updated_at": now}},
    )
    await _consume_ticket(ticket_id)
    invalidate_user_cache(str(user_doc["_id"]))
    user_doc["google_auth"] = google_auth
    user_doc["updated_at"] = now
    return user_doc


async def complete_google_signup(
    *,
    ticket_id: str,
    username: str,
    staff_code: str | None = None,
) -> dict[str, Any]:
    ticket = await _get_valid_ticket(ticket_id, expected_kind="complete_profile")
    claims = dict(ticket.get("google_claims") or {})
    email = _assert_verified_email(claims)
    normalized_email = normalize_email(email)
    normalized_username = normalize_username(username)

    existing_username = await user_repo.find_by_username_normalized(normalized_username, {"_id": 1})
    if existing_username is None:
        existing_username = await user_repo.find_by_username(username.strip(), {"_id": 1})
    if existing_username:
        raise HTTPException(status_code=409, detail="Username already exists")

    existing_email = await user_repo.find_by_email_normalized(normalized_email, {"_id": 1})
    if existing_email is None:
        existing_email = await user_repo.find_by_email(email, {"_id": 1})
    if existing_email:
        raise HTTPException(status_code=409, detail="Email already exists")

    role = "student"
    active_code: dict[str, Any] | None = None
    if staff_code:
        code = staff_code.strip().upper()
        active_code = await staff_code_repo.find_active_code(code)
        if not active_code:
            raise HTTPException(status_code=400, detail="Invalid or already-used staff code")
        if active_code.get("expires_at") and active_code["expires_at"] < utcnow():
            raise HTTPException(status_code=400, detail="Staff code has expired")
        role = "teacher"

    now = utcnow()
    google_auth = _build_google_auth_document(claims, linked_at=now, last_login_at=now)
    user_document = {
        "username": username.strip(),
        "username_normalized": normalized_username,
        "email": email,
        "email_normalized": normalized_email,
        "password_hash": None,
        "password_algo": None,
        "password_changed_at": None,
        "google_auth": google_auth,
        "role": role,
        "teacherCourseIds": [],
        "token_version": 1,
        "status": "active",
        "created_at": now,
        "updated_at": now,
    }
    result = await user_repo.insert_user(user_document)
    user_document["_id"] = result.inserted_id

    if active_code:
        await staff_code_repo.mark_code_used(
            active_code["code"],
            used_by=str(result.inserted_id),
            used_at=now,
        )

    await _consume_ticket(ticket_id)
    return user_document


def build_google_account_summary(user_doc: dict[str, Any]) -> dict[str, Any]:
    google_auth = dict(user_doc.get("google_auth") or {})
    linked = bool(google_auth.get("sub"))
    return {
        "linked": linked,
        "email": google_auth.get("email"),
        "name": google_auth.get("name"),
        "avatarUrl": google_auth.get("picture"),
        "linkedAt": google_auth.get("linked_at").isoformat() if google_auth.get("linked_at") else None,
        "canUnlink": linked and bool(user_doc.get("password_hash")),
    }


async def link_google_account_for_user(*, user_doc: dict[str, Any], credential: str) -> dict[str, Any]:
    _require_active_user(user_doc)
    claims = verify_google_credential(credential)
    _assert_verified_email(claims)

    user_id = str(user_doc.get("_id") or "")
    linked_user = await user_repo.find_by_google_sub(str(claims.get("sub") or ""))
    if linked_user and str(linked_user.get("_id") or "") != user_id:
        raise HTTPException(status_code=409, detail="Google account is already linked to another user")

    now = utcnow()
    existing_google_auth = dict(user_doc.get("google_auth") or {})
    existing_sub = str(existing_google_auth.get("sub") or "")
    incoming_sub = str(claims.get("sub") or "")
    if existing_sub and existing_sub != incoming_sub:
        raise HTTPException(status_code=409, detail="Account is already linked to another Google identity")

    google_auth = _build_google_auth_document(
        claims,
        linked_at=existing_google_auth.get("linked_at") or now,
        last_login_at=now,
    )
    await user_repo.update_by_id(
        user_doc["_id"],
        {"$set": {"google_auth": google_auth, "updated_at": now}},
    )
    invalidate_user_cache(user_id)
    user_doc["google_auth"] = google_auth
    user_doc["updated_at"] = now
    return user_doc


async def unlink_google_account_for_user(*, user_doc: dict[str, Any]) -> dict[str, Any]:
    _require_active_user(user_doc)
    google_auth = dict(user_doc.get("google_auth") or {})
    if not str(google_auth.get("sub") or ""):
        raise HTTPException(status_code=409, detail="Google account is not linked")
    if not user_doc.get("password_hash"):
        raise HTTPException(status_code=409, detail="Set a password before unlinking your Google account")

    now = utcnow()
    await user_repo.update_by_id(
        user_doc["_id"],
        {
            "$unset": {"google_auth": ""},
            "$set": {"updated_at": now},
        },
    )
    invalidate_user_cache(str(user_doc.get("_id") or ""))
    user_doc["google_auth"] = None
    user_doc["updated_at"] = now
    return user_doc

