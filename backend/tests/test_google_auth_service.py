from __future__ import annotations

from datetime import timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from backend.services import google_auth_service
from backend.services.password_security_service import utcnow


def _claims(**overrides):
    payload = {
        "sub": "google-sub-1",
        "email": "alice@example.com",
        "email_verified": True,
        "name": "Alice Example",
        "picture": "https://example.com/avatar.png",
        "locale": "en",
        "hd": None,
    }
    payload.update(overrides)
    return payload


@pytest.mark.asyncio
async def test_start_google_login_authenticates_existing_google_user(monkeypatch):
    user = {
        "_id": "user-1",
        "username": "alice",
        "email": "alice@example.com",
        "role": "student",
        "status": "active",
        "google_auth": {"sub": "google-sub-1", "linked_at": utcnow()},
    }
    updates = []
    invalidations = []

    monkeypatch.setattr(google_auth_service, "verify_google_credential", lambda credential: _claims())

    async def _find_by_google_sub(sub):
        return user

    monkeypatch.setattr(google_auth_service.user_repo, "find_by_google_sub", _find_by_google_sub)

    async def _update_by_id(user_id, update):
        updates.append((user_id, update))
        return SimpleNamespace(matched_count=1)

    monkeypatch.setattr(google_auth_service.user_repo, "update_by_id", _update_by_id)
    monkeypatch.setattr(google_auth_service, "invalidate_user_cache", invalidations.append)

    result = await google_auth_service.start_google_login("credential")

    assert result["action"] == "authenticated"
    assert result["primary_auth_method"] == "google"
    assert updates
    assert invalidations == ["user-1"]


@pytest.mark.asyncio
async def test_start_google_login_returns_link_account_when_email_matches(monkeypatch):
    candidate_user = {
        "_id": "user-2",
        "username": "alice-local",
        "email": "alice@example.com",
        "status": "active",
    }

    monkeypatch.setattr(google_auth_service, "verify_google_credential", lambda credential: _claims())

    async def _find_by_google_sub(sub):
        return None

    async def _find_by_email_normalized(email):
        return candidate_user

    monkeypatch.setattr(google_auth_service.user_repo, "find_by_google_sub", _find_by_google_sub)
    monkeypatch.setattr(google_auth_service.user_repo, "find_by_email_normalized", _find_by_email_normalized)

    async def _unexpected_find_by_email(email):
        raise AssertionError("should not query raw email when normalized email matched")

    monkeypatch.setattr(google_auth_service.user_repo, "find_by_email", _unexpected_find_by_email)

    async def _create_ticket(**kwargs):
        assert kwargs["kind"] == "link_account"
        assert kwargs["candidate_user_id"] == "user-2"
        return {"ticketId": "ticket-1", "expiresAt": "2099-01-01T00:00:00+00:00"}

    monkeypatch.setattr(google_auth_service, "_create_ticket", _create_ticket)

    result = await google_auth_service.start_google_login("credential")

    assert result["action"] == "link_account"
    assert result["ticketId"] == "ticket-1"
    assert result["email"] == "alice@example.com"


@pytest.mark.asyncio
async def test_start_google_login_returns_complete_profile_for_new_user(monkeypatch):
    monkeypatch.setattr(google_auth_service, "verify_google_credential", lambda credential: _claims(name="Alice New"))

    async def _find_none(*args, **kwargs):
        return None

    monkeypatch.setattr(google_auth_service.user_repo, "find_by_google_sub", _find_none)
    monkeypatch.setattr(google_auth_service.user_repo, "find_by_email_normalized", _find_none)
    monkeypatch.setattr(google_auth_service.user_repo, "find_by_email", _find_none)

    async def _create_ticket(**kwargs):
        assert kwargs["kind"] == "complete_profile"
        return {"ticketId": "ticket-2", "expiresAt": "2099-01-01T00:00:00+00:00"}

    monkeypatch.setattr(google_auth_service, "_create_ticket", _create_ticket)

    result = await google_auth_service.start_google_login("credential")

    assert result["action"] == "complete_profile"
    assert result["ticketId"] == "ticket-2"
    assert result["suggestedUsername"].lower().startswith("alice")


@pytest.mark.asyncio
async def test_link_google_account_rejects_wrong_password(monkeypatch):
    ticket = {
        "ticket_id": "ticket-3",
        "kind": "link_account",
        "candidate_user_id": "user-3",
        "google_claims": _claims(),
        "expires_at": utcnow() + timedelta(minutes=5),
        "consumed_at": None,
    }
    user = {
        "_id": "user-3",
        "email": "alice@example.com",
        "status": "active",
        "password_hash": "hashed-password",
    }

    async def _load_ticket(ticket_id, *, expected_kind):
        return ticket

    monkeypatch.setattr(google_auth_service, "_get_valid_ticket", _load_ticket)
    async def _find_by_id(user_id):
        return user

    monkeypatch.setattr(google_auth_service.user_repo, "find_by_id", _find_by_id)
    monkeypatch.setattr(google_auth_service, "verify_password", lambda password, password_hash: False)

    with pytest.raises(HTTPException) as exc_info:
        await google_auth_service.link_google_account(ticket_id="ticket-3", password="bad-password")

    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_link_google_account_binds_google_identity(monkeypatch):
    ticket = {
        "ticket_id": "ticket-4",
        "kind": "link_account",
        "candidate_user_id": "user-4",
        "google_claims": _claims(sub="google-sub-4"),
        "expires_at": utcnow() + timedelta(minutes=5),
        "consumed_at": None,
    }
    user = {
        "_id": "user-4",
        "email": "alice@example.com",
        "status": "active",
        "password_hash": "hashed-password",
    }
    updates = []
    consumed = []

    async def _load_ticket(ticket_id, *, expected_kind):
        return ticket

    async def _update_by_id(user_id, update):
        updates.append(update)
        return SimpleNamespace(matched_count=1)

    monkeypatch.setattr(google_auth_service, "_get_valid_ticket", _load_ticket)
    async def _find_by_id(user_id):
        return user

    async def _consume(ticket_id):
        consumed.append(ticket_id)

    monkeypatch.setattr(google_auth_service.user_repo, "find_by_id", _find_by_id)
    monkeypatch.setattr(google_auth_service, "verify_password", lambda password, password_hash: True)
    monkeypatch.setattr(google_auth_service.user_repo, "update_by_id", _update_by_id)
    monkeypatch.setattr(google_auth_service, "_consume_ticket", _consume)
    monkeypatch.setattr(google_auth_service, "invalidate_user_cache", lambda user_id: None)

    result = await google_auth_service.link_google_account(ticket_id="ticket-4", password="good-password")

    assert result["google_auth"]["sub"] == "google-sub-4"
    assert updates
    assert consumed == ["ticket-4"]


@pytest.mark.asyncio
async def test_complete_google_signup_creates_student_user(monkeypatch):
    ticket = {
        "ticket_id": "ticket-5",
        "kind": "complete_profile",
        "google_claims": _claims(email="new@example.com"),
        "expires_at": utcnow() + timedelta(minutes=5),
        "consumed_at": None,
    }
    inserted = []
    consumed = []

    async def _load_ticket(ticket_id, *, expected_kind):
        return ticket

    async def _insert_user(document):
        inserted.append(document)
        return SimpleNamespace(inserted_id="user-5")

    monkeypatch.setattr(google_auth_service, "_get_valid_ticket", _load_ticket)
    async def _find_none(*args, **kwargs):
        return None

    async def _consume(ticket_id):
        consumed.append(ticket_id)

    monkeypatch.setattr(google_auth_service.user_repo, "find_by_username_normalized", _find_none)
    monkeypatch.setattr(google_auth_service.user_repo, "find_by_username", _find_none)
    monkeypatch.setattr(google_auth_service.user_repo, "find_by_email_normalized", _find_none)
    monkeypatch.setattr(google_auth_service.user_repo, "find_by_email", _find_none)
    monkeypatch.setattr(google_auth_service.user_repo, "insert_user", _insert_user)
    monkeypatch.setattr(google_auth_service, "_consume_ticket", _consume)

    result = await google_auth_service.complete_google_signup(ticket_id="ticket-5", username="new-user")

    assert result["_id"] == "user-5"
    assert result["role"] == "student"
    assert inserted[0]["password_hash"] is None
    assert inserted[0]["google_auth"]["sub"] == "google-sub-1"
    assert consumed == ["ticket-5"]


@pytest.mark.asyncio
async def test_complete_google_signup_creates_teacher_with_staff_code(monkeypatch):
    ticket = {
        "ticket_id": "ticket-6",
        "kind": "complete_profile",
        "google_claims": _claims(email="teacher@example.com"),
        "expires_at": utcnow() + timedelta(minutes=5),
        "consumed_at": None,
    }
    used_codes = []

    async def _load_ticket(ticket_id, *, expected_kind):
        return ticket

    async def _insert_user(document):
        return SimpleNamespace(inserted_id="user-6")

    async def _mark_code_used(code, *, used_by, used_at):
        used_codes.append((code, used_by))
        return SimpleNamespace(matched_count=1)

    monkeypatch.setattr(google_auth_service, "_get_valid_ticket", _load_ticket)
    async def _find_none(*args, **kwargs):
        return None

    async def _find_active_code(code):
        return {"code": code, "expires_at": utcnow() + timedelta(minutes=5)}

    async def _consume(ticket_id):
        return None

    monkeypatch.setattr(google_auth_service.user_repo, "find_by_username_normalized", _find_none)
    monkeypatch.setattr(google_auth_service.user_repo, "find_by_username", _find_none)
    monkeypatch.setattr(google_auth_service.user_repo, "find_by_email_normalized", _find_none)
    monkeypatch.setattr(google_auth_service.user_repo, "find_by_email", _find_none)
    monkeypatch.setattr(google_auth_service.user_repo, "insert_user", _insert_user)
    monkeypatch.setattr(google_auth_service.staff_code_repo, "find_active_code", _find_active_code)
    monkeypatch.setattr(google_auth_service.staff_code_repo, "mark_code_used", _mark_code_used)
    monkeypatch.setattr(google_auth_service, "_consume_ticket", _consume)

    result = await google_auth_service.complete_google_signup(
        ticket_id="ticket-6",
        username="teacher-user",
        staff_code="ABCD1234",
    )

    assert result["role"] == "teacher"
    assert used_codes == [("ABCD1234", "user-6")]


@pytest.mark.asyncio
async def test_complete_google_signup_rejects_expired_ticket(monkeypatch):
    async def _load_ticket(ticket_id, *, expected_kind):
        raise HTTPException(status_code=401, detail="Google sign-in ticket expired")

    monkeypatch.setattr(google_auth_service, "_get_valid_ticket", _load_ticket)

    with pytest.raises(HTTPException) as exc_info:
        await google_auth_service.complete_google_signup(ticket_id="expired", username="late-user")

    assert exc_info.value.status_code == 401
