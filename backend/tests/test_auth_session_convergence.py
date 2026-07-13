from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest

from backend.application.architecture_facades.auth_session import session_flows
from backend.repositories import session_repo


class _FakeUserSessionCursor:
    def __init__(self, docs: list[dict]):
        self.docs = list(docs)
        self.sort_calls: list[tuple[str, int]] = []
        self.to_list_lengths: list[int | None] = []

    def sort(self, field: str, direction: int):
        self.sort_calls.append((field, direction))
        return self

    async def to_list(self, length=None):
        self.to_list_lengths.append(length)
        return list(self.docs)


class _FakeUserSessionsCollection:
    def __init__(self, docs: list[dict]):
        self.docs = list(docs)
        self.find_calls: list[tuple[dict, dict | None]] = []
        self.cursor = _FakeUserSessionCursor(docs)

    def find(self, query: dict, projection: dict | None = None):
        self.find_calls.append((query, projection))
        return self.cursor


@pytest.mark.asyncio
async def test_list_active_for_user_removes_fixed_read_cap(monkeypatch):
    docs = [
        {"session_id": "session-1", "last_seen_at": datetime(2026, 6, 1, tzinfo=timezone.utc)},
        {"session_id": "session-2", "last_seen_at": datetime(2026, 5, 1, tzinfo=timezone.utc)},
    ]
    fake_collection = _FakeUserSessionsCollection(docs)
    monkeypatch.setattr(session_repo.db, "user_sessions", fake_collection, raising=False)

    result = await session_repo.list_active_for_user(
        "user-1",
        {"session_id": 1, "last_seen_at": 1},
    )

    assert result == docs
    assert fake_collection.find_calls == [
        ({"user_id": "user-1", "revoked_at": None}, {"session_id": 1, "last_seen_at": 1})
    ]
    assert fake_collection.cursor.sort_calls == [("last_seen_at", -1)]
    assert fake_collection.cursor.to_list_lengths == [None]


@pytest.mark.asyncio
async def test_list_user_sessions_preserves_response_shape(monkeypatch):
    now = datetime(2026, 6, 28, 12, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(
        session_flows.session_repo,
        "list_active_for_user",
        AsyncMock(
            return_value=[
                {
                    "session_id": "session-1",
                    "created_at": now,
                    "last_seen_at": now,
                    "last_rotated_at": now,
                    "expires_at": now,
                    "step_up_expires_at": None,
                    "amr": ["pwd"],
                    "device_label": "Laptop",
                    "browser": "Chrome",
                    "os": "Windows",
                    "device_type": "desktop",
                    "ip_label": "127.0.0.1",
                }
            ]
        ),
    )

    sessions = await session_flows.list_user_sessions(
        user_id="user-1",
        current_session_id="session-1",
    )

    assert sessions == [
        {
            "sessionId": "session-1",
            "createdAt": now.isoformat(),
            "lastSeenAt": now.isoformat(),
            "lastRotatedAt": now.isoformat(),
            "expiresAt": now.isoformat(),
            "stepUpExpiresAt": None,
            "current": True,
            "amr": ["pwd"],
            "deviceLabel": "Laptop",
            "browser": "Chrome",
            "os": "Windows",
            "deviceType": "desktop",
            "ipLabel": "127.0.0.1",
        }
    ]
