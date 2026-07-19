from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from bson import ObjectId
from fastapi import HTTPException

from backend.repositories import user_repo
from backend.repositories import chat_message_repo
from backend.repositories import chat_room_repo
from backend.repositories._helpers import coerce_utc_datetime
from backend.services.chat_service import message_service, query_service
from backend.services.files import file_center_service
from backend.services.homework import homework_service
from backend.services.student.student_assignment_service_support import common as student_assignment_common


class _FakeFindOneCollection:
    def __init__(self, document: dict | None):
        self.document = document
        self.calls: list[tuple[dict, dict | None]] = []

    async def find_one(self, query: dict, projection: dict | None = None):
        self.calls.append((query, projection))
        return self.document


class _FakeAssetCursor:
    def __init__(self, docs: list[dict]):
        self._docs = list(docs)
        self._iter = iter(())

    def sort(self, *_args, **_kwargs):
        return self

    def __aiter__(self):
        self._iter = iter(self._docs)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration as exc:
            raise StopAsyncIteration from exc


class _FakeFileAssetsCollection:
    def __init__(self, docs: list[dict]):
        self.docs = docs
        self.find_calls: list[dict] = []

    def find(self, query: dict):
        self.find_calls.append(query)
        return _FakeAssetCursor(self.docs)


class _UnexpectedCollection:
    def __init__(self):
        self.calls: list[tuple[dict, dict | None]] = []

    async def find_one(self, query: dict, projection: dict | None = None):
        self.calls.append((query, projection))
        raise AssertionError("unexpected database lookup")


@pytest.mark.asyncio
async def test_get_room_by_id_queries_with_object_id(monkeypatch):
    room_id = str(ObjectId())
    find_by_id = AsyncMock(return_value={"_id": ObjectId(room_id), "name": "Course Chat"})
    monkeypatch.setattr(query_service.chat_room_repo, "find_by_id", find_by_id)

    room = await query_service.get_room_by_id(room_id, projection={"name": 1})

    assert room == {"_id": ObjectId(room_id), "name": "Course Chat"}
    assert find_by_id.await_args.args == (room_id, {"name": 1})


@pytest.mark.asyncio
async def test_chat_room_repo_find_by_id_uses_shared_object_id_coercion(monkeypatch):
    room_id = str(ObjectId())
    fake_rooms = _FakeFindOneCollection({"_id": ObjectId(room_id), "name": "Course Chat"})
    monkeypatch.setattr(chat_room_repo.db, "chat_rooms", fake_rooms, raising=False)

    room = await chat_room_repo.find_by_id(room_id, {"name": 1})

    assert room == {"_id": ObjectId(room_id), "name": "Course Chat"}
    assert fake_rooms.calls == [({"_id": ObjectId(room_id)}, {"name": 1})]


@pytest.mark.asyncio
async def test_chat_message_repo_find_by_id_uses_shared_object_id_coercion(monkeypatch):
    message_id = str(ObjectId())
    fake_messages = _FakeFindOneCollection({"_id": ObjectId(message_id), "content": "hello"})
    monkeypatch.setattr(chat_message_repo.db, "chat_messages", fake_messages, raising=False)

    result = await chat_message_repo.find_by_id(message_id, {"content": 1})

    assert result == {"_id": ObjectId(message_id), "content": "hello"}
    assert fake_messages.calls == [({"_id": ObjectId(message_id)}, {"content": 1})]


@pytest.mark.asyncio
async def test_get_room_by_id_rejects_invalid_room_id_with_http_400():
    with pytest.raises(HTTPException) as excinfo:
        await query_service.get_room_by_id("not-an-object-id")

    assert excinfo.value.status_code == 400
    assert excinfo.value.detail == "Invalid room: 'not-an-object-id'"


def test_get_message_oid_preserves_http_400_contract():
    message_id = str(ObjectId())

    assert message_service.get_message_oid(message_id) == ObjectId(message_id)

    with pytest.raises(HTTPException) as excinfo:
        message_service.get_message_oid("broken-message-id")

    assert excinfo.value.status_code == 400
    assert excinfo.value.detail == "Invalid message: 'broken-message-id'"


@pytest.mark.asyncio
async def test_list_ai_user_assets_rejects_invalid_user_id_before_backfill(monkeypatch):
    calls: list[str] = []

    async def _fake_ensure_ai_session_image_assets(user_id: str):
        calls.append(user_id)

    monkeypatch.setattr(
        file_center_service,
        "ensure_ai_session_image_assets",
        _fake_ensure_ai_session_image_assets,
    )

    with pytest.raises(HTTPException) as excinfo:
        await file_center_service.list_ai_user_assets(
            user_id="invalid-user-id",
            group_by="day",
            status="",
        )

    assert excinfo.value.status_code == 400
    assert excinfo.value.detail == "Invalid user id"
    assert calls == []


@pytest.mark.asyncio
async def test_list_ai_user_assets_accepts_valid_object_id_and_reads_assets(monkeypatch):
    user_id = str(ObjectId())
    calls: list[str] = []
    asset_id = ObjectId()

    async def _fake_ensure_ai_session_image_assets(resolved_user_id: str):
        calls.append(resolved_user_id)

    monkeypatch.setattr(
        file_center_service,
        "ensure_ai_session_image_assets",
        _fake_ensure_ai_session_image_assets,
    )
    list_assets_page = AsyncMock(
        return_value=(
            3,
            [
                {
                    "date": "2026-06-01",
                    "count": 1,
                    "total_size": 7,
                    "items": [
                        {
                            "_id": asset_id,
                            "scope": "ai_personal",
                            "user_id": user_id,
                            "status": "active",
                            "size": 7,
                            "created_at": datetime(2026, 6, 1, tzinfo=timezone.utc),
                            "_bucket_source": datetime(2026, 6, 1, tzinfo=timezone.utc),
                            "_bucket": "2026-06-01",
                        }
                    ],
                }
            ],
        )
    )
    monkeypatch.setattr(
        file_center_service.file_asset_repo,
        "list_ai_personal_assets_page",
        list_assets_page,
    )

    result = await file_center_service.list_ai_user_assets(
        user_id=user_id,
        group_by="day",
        status="",
        limit=1,
    )

    assert calls == [user_id]
    assert list_assets_page.await_args.kwargs == {
        "user_id": user_id,
        "status": "",
        "group_by": "day",
        "skip": 0,
        "limit": 1,
    }
    assert result["user_id"] == user_id
    assert result["total"] == 3
    assert result["skip"] == 0
    assert result["limit"] == 1
    assert result["hasMore"] is True
    assert result["nextSkip"] == 1
    item = result["groups"][0]["items"][0]
    assert item["_id"] == str(asset_id)
    assert item["created_at"] == "2026-06-01T00:00:00+00:00"
    assert "_bucket_source" not in item
    assert "_bucket" not in item


@pytest.mark.asyncio
async def test_list_ai_user_assets_default_limit_preserves_unpaged_response(monkeypatch):
    user_id = str(ObjectId())
    monkeypatch.setattr(file_center_service, "ensure_ai_session_image_assets", AsyncMock(return_value=0))
    list_assets_page = AsyncMock(return_value=(0, []))
    monkeypatch.setattr(
        file_center_service.file_asset_repo,
        "list_ai_personal_assets_page",
        list_assets_page,
    )

    result = await file_center_service.list_ai_user_assets(
        user_id=user_id,
        group_by="day",
        status="",
    )

    assert list_assets_page.await_args.kwargs["limit"] is None
    assert result["limit"] == 0
    assert result["hasMore"] is False


def test_coerce_utc_datetime_accepts_legacy_strings_and_naive_values():
    naive = datetime(2026, 6, 1, 8, 30)
    aware = coerce_utc_datetime(naive)

    assert aware == datetime(2026, 6, 1, 8, 30, tzinfo=timezone.utc)
    assert coerce_utc_datetime("2026-06-01T08:30:00Z") == datetime(2026, 6, 1, 8, 30, tzinfo=timezone.utc)
    assert coerce_utc_datetime("not-a-date") is None
    assert coerce_utc_datetime("") is None


@pytest.mark.asyncio
async def test_resolve_course_section_id_short_circuits_valid_object_id(monkeypatch):
    course_section_id = str(ObjectId())
    lookup = AsyncMock(return_value=None)
    monkeypatch.setattr(student_assignment_common, "find_course_section_by_code", lookup)

    resolved = await student_assignment_common.resolve_course_section_id(course_section_id)

    assert resolved == course_section_id
    assert lookup.await_count == 0


@pytest.mark.asyncio
async def test_resolve_course_section_id_falls_back_to_course_code_lookup(monkeypatch):
    resolved_oid = ObjectId()
    lookup = AsyncMock(return_value={"id": str(resolved_oid), "courseCode": "CS101"})
    monkeypatch.setattr(student_assignment_common, "find_course_section_by_code", lookup)

    resolved = await student_assignment_common.resolve_course_section_id("CS101")

    assert resolved == str(resolved_oid)
    assert lookup.await_args.args == ("CS101",)


@pytest.mark.asyncio
async def test_user_repo_find_by_id_uses_shared_object_id_coercion(monkeypatch):
    user_id = str(ObjectId())
    fake_users = _FakeFindOneCollection({"_id": ObjectId(user_id), "username": "alice"})
    monkeypatch.setattr(user_repo.db, "users", fake_users, raising=False)

    result = await user_repo.find_by_id(user_id, {"username": 1})

    assert result == {"_id": ObjectId(user_id), "username": "alice"}
    assert fake_users.calls == [({"_id": ObjectId(user_id)}, {"username": 1})]


@pytest.mark.asyncio
async def test_user_repo_find_by_id_ignores_invalid_object_id_without_query(monkeypatch):
    unexpected_users = _UnexpectedCollection()
    monkeypatch.setattr(user_repo.db, "users", unexpected_users, raising=False)

    result = await user_repo.find_by_id("not-a-user-object-id")

    assert result is None
    assert unexpected_users.calls == []


@pytest.mark.asyncio
async def test_submit_homework_rejects_invalid_homework_id_before_repo_lookup(monkeypatch):
    find_homework = AsyncMock(return_value=None)
    monkeypatch.setattr(homework_service.homework_repo, "find_homework_by_id", find_homework)

    with pytest.raises(HTTPException) as excinfo:
        await homework_service.submit_homework(
            homework_id="invalid-homework-id",
            filename="work.pdf",
            content=b"pdf",
            current_user={"_id": ObjectId(), "role": "student"},
        )

    assert excinfo.value.status_code == 400
    assert excinfo.value.detail == "Invalid homework ID"
    assert find_homework.await_count == 0


@pytest.mark.asyncio
async def test_submit_homework_accepts_valid_object_id_without_changing_submission_shape(monkeypatch):
    homework_id = str(ObjectId())
    student_id = ObjectId()
    insert_submission = AsyncMock(return_value=SimpleNamespace(inserted_id=ObjectId()))

    monkeypatch.setattr(
        homework_service.homework_repo,
        "find_homework_by_id",
        AsyncMock(return_value={"_id": ObjectId(homework_id), "required_file_types": [".pdf"]}),
    )
    monkeypatch.setattr(homework_service.homework_repo, "insert_submission", insert_submission)
    monkeypatch.setattr(
        homework_service,
        "_save_submission_file",
        lambda **_kwargs: "uploads/homeworks/work.pdf",
    )

    result = await homework_service.submit_homework(
        homework_id=homework_id,
        filename="work.pdf",
        content=b"pdf",
        current_user={"_id": student_id, "role": "student"},
    )

    inserted = insert_submission.await_args.args[0]
    assert inserted["homework_id"] == homework_id
    assert inserted["student_id"] == str(student_id)
    assert result.id
