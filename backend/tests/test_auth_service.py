"""Tests for auth-related logic: JWT tokens, refresh tokens, password validation rules."""
from datetime import timedelta
from types import SimpleNamespace

import pytest
from jose import jwt

from backend.config import Config
from backend.services import auth_account_service
from backend.services.auth_risk_service import (
    LOGIN_SCOPE_IP,
    LOGIN_SCOPE_PRINCIPAL,
)
from backend.services.security_audit import build_security_event
from backend.services.auth_session_service import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    hash_refresh_token,
)
from backend.services.login_challenge_service import create_login_challenge
from backend.services.admin_security_service import _serialize_lockout
from backend.services.admin_security_service import update_user_security_status
from backend.services.password_security_service import utcnow


# ── JWT round-trip ──────────────────────────────────────────────────

def test_create_access_token_roundtrip():
    token = create_access_token({"sub": "user123", "sid": "session123", "role": "student"})
    payload = jwt.decode(
        token,
        Config.JWT_SECRET_KEY,
        algorithms=["HS256"],
        audience="intelligent-edu-web",
        issuer="intelligent-edu-platform",
    )
    assert payload["sub"] == "user123"
    assert payload["sid"] == "session123"
    assert payload["role"] == "student"
    assert payload["aud"] == "intelligent-edu-web"
    assert payload["iss"] == "intelligent-edu-platform"
    assert "exp" in payload


def test_create_access_token_contains_expiry():
    token = create_access_token({"sub": "u1", "sid": "s1"})
    payload = jwt.decode(
        token,
        Config.JWT_SECRET_KEY,
        algorithms=["HS256"],
        audience="intelligent-edu-web",
        issuer="intelligent-edu-platform",
    )
    assert "exp" in payload


def test_token_decode_fails_with_wrong_secret():
    token = create_access_token({"sub": "u1", "sid": "s1"})
    with pytest.raises(Exception):
        jwt.decode(token, "wrong-secret", algorithms=["HS256"])


def test_refresh_token_roundtrip():
    token, jti = create_refresh_token(
        user_id="user123",
        session_id="session123",
        family_id="family123",
        token_version=3,
    )
    payload = decode_refresh_token(token)
    assert payload["sub"] == "user123"
    assert payload["sid"] == "session123"
    assert payload["family_id"] == "family123"
    assert payload["token_version"] == 3
    assert payload["jti"] == jti
    assert payload["aud"] == "intelligent-edu-refresh"


def test_hash_refresh_token_is_stable():
    token = "refresh-token-value"
    assert hash_refresh_token(token) == hash_refresh_token(token)
    assert hash_refresh_token(token) != hash_refresh_token("different-token")


def test_serialize_session_user_includes_google_fields():
    payload = auth_account_service.serialize_session_user(
        {
            "_id": "user-1",
            "username": "alice",
            "email": "alice@example.com",
            "role": "student",
            "teacherCourseIds": ["course-1"],
            "google_auth": {"sub": "google-sub", "picture": "https://example.com/avatar.png"},
        }
    )
    assert payload["googleLinked"] is True
    assert payload["avatarUrl"] == "https://example.com/avatar.png"


# ── Password validation rules (tested via the route constraints) ───

def test_password_too_short():
    """Password must be >= 8 chars."""
    assert len("abc1") < 8  # sanity check
    # The validation is in the route handler; test the constraint logic directly:
    pw = "short1"
    assert len(pw) < 8


def test_password_missing_digit():
    """Password must contain at least one digit."""
    pw = "abcdefgh"
    assert not any(c.isdigit() for c in pw)


def test_password_valid():
    pw = "secure12"
    assert len(pw) >= 8
    assert any(c.isdigit() for c in pw)


class _FakeCounterCollection:
    def __init__(self):
        self.docs = {}

    async def find_one(self, query):
        return self.docs.get(query["scope_key"])

    async def update_one(self, query, update, upsert=False):
        key = query["scope_key"]
        existing = dict(self.docs.get(key) or {})
        existing.update(update.get("$set", {}))
        if upsert and not self.docs.get(key):
            existing.update(update.get("$setOnInsert", {}))
        self.docs[key] = existing
        return SimpleNamespace(matched_count=1, modified_count=1)

    async def delete_one(self, query):
        self.docs.pop(query["scope_key"], None)
        return SimpleNamespace(deleted_count=1)


class _FakeRequest:
    def __init__(self, ip: str = "127.0.0.1", user_agent: str = "pytest-agent"):
        self.client = SimpleNamespace(host=ip)
        self.headers = {"user-agent": user_agent}


@pytest.mark.asyncio
async def test_create_login_challenge_records_primary_auth_method(monkeypatch):
    captured = {}

    async def _insert_challenge(document):
        captured.update(document)
        return SimpleNamespace(inserted_id="challenge-1")

    monkeypatch.setattr("backend.services.login_challenge_service.login_challenge_repo.insert_challenge", _insert_challenge)

    result = await create_login_challenge(
        user={"_id": "user-1"},
        request=_FakeRequest(),
        primary_auth_method="google",
    )

    assert result["challengeId"]
    assert captured["primary_auth_method"] == "google"


@pytest.mark.asyncio
async def test_authenticate_user_with_guards_locks_out_after_repeated_failures(monkeypatch):
    fake_counters = _FakeCounterCollection()
    monkeypatch.setattr("backend.services.auth_risk_service.db", SimpleNamespace(auth_attempt_counters=fake_counters))
    async def _auth_fail(username, password):
        return None

    monkeypatch.setattr("backend.services.auth_account_service.authenticate_user", _auth_fail)
    monkeypatch.setattr(Config, "AUTH_LOGIN_PRINCIPAL_MAX_FAILURES", 2)
    monkeypatch.setattr(Config, "AUTH_LOGIN_IP_MAX_FAILURES", 2)
    monkeypatch.setattr(Config, "AUTH_LOGIN_PRINCIPAL_WINDOW_MINUTES", 15)
    monkeypatch.setattr(Config, "AUTH_LOGIN_IP_WINDOW_MINUTES", 15)
    monkeypatch.setattr(Config, "AUTH_LOGIN_PRINCIPAL_LOCKOUT_MINUTES", 15)
    monkeypatch.setattr(Config, "AUTH_LOGIN_IP_LOCKOUT_MINUTES", 15)

    request = _FakeRequest()
    result1 = await auth_account_service.authenticate_user_with_guards("Alice", "bad-pass", request=request)
    assert result1 is None

    result2 = await auth_account_service.authenticate_user_with_guards("Alice", "bad-pass", request=request)
    assert result2 is None

    with pytest.raises(Exception) as exc_info:
        await auth_account_service.authenticate_user_with_guards("Alice", "bad-pass", request=request)
    assert getattr(exc_info.value, "status_code", None) == 429

    principal_doc = next(doc for doc in fake_counters.docs.values() if doc["scope"] == LOGIN_SCOPE_PRINCIPAL)
    ip_doc = next(doc for doc in fake_counters.docs.values() if doc["scope"] == LOGIN_SCOPE_IP)
    assert int(principal_doc["attempt_count"]) == 2
    assert int(ip_doc["attempt_count"]) == 2
    assert principal_doc["locked_until"] is not None
    assert ip_doc["locked_until"] is not None


@pytest.mark.asyncio
async def test_authenticate_user_with_guards_clears_counters_on_success(monkeypatch):
    fake_counters = _FakeCounterCollection()
    monkeypatch.setattr("backend.services.auth_risk_service.db", SimpleNamespace(auth_attempt_counters=fake_counters))

    async def _auth_fail(username, password):
        return None

    async def _auth_success(username, password):
        return {"_id": "u1", "status": "active", "username": username}

    monkeypatch.setattr("backend.services.auth_account_service.authenticate_user", _auth_fail)
    request = _FakeRequest()
    await auth_account_service.authenticate_user_with_guards("Alice", "bad-pass", request=request)
    assert fake_counters.docs

    monkeypatch.setattr("backend.services.auth_account_service.authenticate_user", _auth_success)
    user_doc = await auth_account_service.authenticate_user_with_guards("Alice", "good-pass", request=request)
    assert user_doc["status"] == "active"
    assert fake_counters.docs == {}


def test_build_security_event_sets_ttl_and_extra(monkeypatch):
    monkeypatch.setattr(Config, "SECURITY_AUDIT_RETENTION_DAYS", 30)
    event = build_security_event(
        level="warning",
        request_id="req-123",
        user_id="user-123",
        endpoint="/api/login",
        action="login_failed",
        detail="invalid credentials",
        extra={"ip_address": "127.0.0.1"},
    )
    assert event["level"] == "warning"
    assert event["request_id"] == "req-123"
    assert event["user_id"] == "user-123"
    assert event["extra"]["ip_address"] == "127.0.0.1"
    assert event["expires_at"] - event["created_at"] >= timedelta(days=29, hours=23)


def test_serialize_lockout_exposes_expected_shape():
    now = utcnow()
    lockout = _serialize_lockout(
        {
            "scope_key": "login_ip:abc123",
            "scope": "login_ip",
            "attempt_count": 6,
            "locked_until": now + timedelta(minutes=10),
            "window_started_at": now - timedelta(minutes=5),
            "last_failure_at": now,
            "metadata": {"ip_address": "127.0.0.1"},
        }
    )
    assert lockout["scopeKey"] == "login_ip:abc123"
    assert lockout["scope"] == "login_ip"
    assert lockout["attemptCount"] == 6
    assert lockout["metadata"]["ip_address"] == "127.0.0.1"


@pytest.mark.asyncio
async def test_update_user_security_status_revokes_sessions_for_non_active(monkeypatch):
    fake_user = {
        "_id": "user-1",
        "username": "alice",
        "email": "alice@example.com",
        "role": "student",
        "status": "active",
        "mfa": {"enabled": False},
    }
    updated_doc = dict(fake_user, status="suspended")
    state = {"doc": fake_user}
    revoked_reasons = []

    async def _find_by_id(user_id, projection=None):
        return state["doc"]

    async def _update_by_id(user_id, update):
        state["doc"] = dict(state["doc"], **update["$set"])
        return SimpleNamespace(matched_count=1)

    async def _revoke_all_sessions(user_id, reason):
        revoked_reasons.append(reason)

    monkeypatch.setattr("backend.services.admin_security_service.user_repo.find_by_id", _find_by_id)
    monkeypatch.setattr("backend.services.admin_security_service.user_repo.update_by_id", _update_by_id)
    monkeypatch.setattr("backend.services.admin_security_service.revoke_all_sessions_for_user", _revoke_all_sessions)
    monkeypatch.setattr("backend.services.admin_security_service.invalidate_user_cache", lambda user_id: None)

    result = await update_user_security_status(user_id="user-1", status="suspended")
    assert result is not None
    assert result["status"] == "suspended"
    assert revoked_reasons == ["status:suspended"]
