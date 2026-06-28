from __future__ import annotations

from datetime import datetime, timezone
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock
import sys

import pytest
from bson import ObjectId
from fastapi import HTTPException

from backend.repositories import assignment_repo
from backend.services.chat_service import room_service
from backend.services.chat_service import session_bucket_service
from backend.services.file_assets import lifecycle
from backend.services.grading_service import orchestration


class _FakePagedCursor:
    def __init__(self, docs: list[dict]):
        self._docs = list(docs)
        self.sort_calls: list[list[tuple[str, int]]] = []
        self.skip_calls: list[int] = []
        self.limit_calls: list[int] = []
        self.to_list_lengths: list[int] = []

    def sort(self, spec):
        self.sort_calls.append(list(spec))
        return self

    def skip(self, value: int):
        self.skip_calls.append(value)
        return self

    def limit(self, value: int):
        self.limit_calls.append(value)
        return self

    async def to_list(self, length: int):
        self.to_list_lengths.append(length)
        return list(self._docs)[:length]


class _FakeAssignmentsCollection:
    def __init__(self, docs: list[dict], total: int):
        self.total = total
        self.cursor = _FakePagedCursor(docs)
        self.count_calls: list[tuple[dict, object | None]] = []
        self.find_calls: list[tuple[dict, object | None]] = []

    async def count_documents(self, query: dict, session=None) -> int:
        self.count_calls.append((query, session))
        return self.total

    def find(self, query: dict, session=None):
        self.find_calls.append((query, session))
        return self.cursor


class _FakeFindOneAndUpdateCollection:
    def __init__(self, returned_doc: dict):
        self.returned_doc = returned_doc
        self.calls: list[tuple[dict, dict, dict]] = []

    async def find_one_and_update(self, query: dict, update: dict, **kwargs):
        self.calls.append((query, update, kwargs))
        return self.returned_doc


class _FakeAsyncCursor:
    def __init__(self, docs: list[dict]):
        self._docs = list(docs)

    def __aiter__(self):
        self._iter = iter(self._docs)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration as exc:
            raise StopAsyncIteration from exc


class _FakeSortableAsyncCursor(_FakeAsyncCursor):
    def __init__(self, docs: list[dict]):
        super().__init__(docs)
        self.sort_calls: list[tuple[str, int]] = []

    def sort(self, field: str, direction: int):
        self.sort_calls.append((field, direction))
        return self


class _FakeFindOneCollection:
    def __init__(self, document: dict | None):
        self.document = document
        self.calls: list[dict] = []

    async def find_one(self, query: dict, *_args, **_kwargs):
        self.calls.append(query)
        return self.document


class _RejectingUsersCollection:
    def __init__(self):
        self.count_documents_calls: list[dict] = []

    async def count_documents(self, query: dict) -> int:
        self.count_documents_calls.append(query)
        raise AssertionError("count_documents should not be reached")


class _FakeEnrollmentsCollection:
    def __init__(self, membership_doc: dict | None, docs: list[dict]):
        self.membership_doc = membership_doc
        self.docs = list(docs)
        self.find_one_calls: list[dict] = []
        self.find_calls: list[tuple[dict, dict | None]] = []

    async def find_one(self, query: dict):
        self.find_one_calls.append(query)
        return self.membership_doc

    def find(self, query: dict, projection: dict | None = None):
        self.find_calls.append((query, projection))
        return _FakeAsyncCursor(self.docs)


class _FakeChatRoomsCollection:
    def __init__(self, upserted_doc: dict, persisted_doc: dict):
        self.upserted_doc = upserted_doc
        self.persisted_doc = persisted_doc
        self.find_one_and_update_calls: list[tuple[dict, dict, dict]] = []
        self.find_one_calls: list[dict] = []

    async def find_one_and_update(self, query: dict, update: dict, **kwargs):
        self.find_one_and_update_calls.append((query, update, kwargs))
        return self.upserted_doc

    async def find_one(self, query: dict):
        self.find_one_calls.append(query)
        return self.persisted_doc


class _FakeInsertCollection:
    def __init__(self):
        self.calls: list[dict] = []

    async def insert_one(self, document: dict):
        self.calls.append(document)
        return SimpleNamespace(inserted_id=ObjectId())


class _FakeBucketPersistenceCollection:
    def __init__(self):
        self.delete_many_calls: list[dict] = []
        self.insert_many_calls: list[list[dict]] = []

    async def delete_many(self, query: dict):
        self.delete_many_calls.append(query)
        return SimpleNamespace(deleted_count=3)

    async def insert_many(self, docs: list[dict]):
        materialized = [dict(doc) for doc in docs]
        self.insert_many_calls.append(materialized)
        return SimpleNamespace(inserted_ids=[doc.get("bucketIndex") for doc in materialized])


class _FakeBucketFindCollection:
    def __init__(self, docs: list[dict]):
        self.cursor = _FakeSortableAsyncCursor(docs)
        self.find_calls: list[dict] = []

    def find(self, query: dict):
        self.find_calls.append(query)
        return self.cursor


class _FakeBucketDb:
    def __init__(self, collection):
        self.collection = collection

    def __getitem__(self, name: str):
        assert name == session_bucket_service.BUCKET_COLLECTION
        return self.collection


@pytest.mark.asyncio
async def test_list_all_assignments_collects_multiple_pages_without_truncation(monkeypatch):
    calls: list[tuple[str, int, int]] = []

    async def fake_list_assignments(course_section_id: str, *, page: int, page_size: int):
        calls.append((course_section_id, page, page_size))
        start = (page - 1) * page_size
        end = min(start + page_size, 205)
        return {
            "items": [{"id": f"assignment-{idx}"} for idx in range(start, end)],
            "total": 205,
            "page": page,
            "page_size": page_size,
        }

    monkeypatch.setattr(orchestration, "list_assignments", fake_list_assignments)

    result = await orchestration.list_all_assignments("section-1")

    assert len(result) == 205
    assert result[0]["id"] == "assignment-0"
    assert result[-1]["id"] == "assignment-204"
    assert calls == [
        ("section-1", 1, 100),
        ("section-1", 2, 100),
        ("section-1", 3, 100),
    ]


@pytest.mark.asyncio
async def test_list_all_enrollments_collects_every_page(monkeypatch):
    calls: list[tuple[str | None, str | None, int, int]] = []

    async def fake_list_enrollments(
        course_section_id: str | None = None,
        user_id: str | None = None,
        *,
        page: int,
        page_size: int,
    ):
        calls.append((course_section_id, user_id, page, page_size))
        start = (page - 1) * page_size
        end = min(start + page_size, 201)
        return {
            "items": [{"id": f"enrollment-{idx}"} for idx in range(start, end)],
            "total": 201,
            "page": page,
            "page_size": page_size,
        }

    monkeypatch.setattr(orchestration, "list_enrollments", fake_list_enrollments)

    result = await orchestration.list_all_enrollments(course_section_id="section-1")

    assert len(result) == 201
    assert result[0]["id"] == "enrollment-0"
    assert result[-1]["id"] == "enrollment-200"
    assert calls == [
        ("section-1", None, 1, 100),
        ("section-1", None, 2, 100),
        ("section-1", None, 3, 100),
    ]


@pytest.mark.asyncio
async def test_list_all_submissions_for_student_collects_every_page(monkeypatch):
    calls: list[tuple[str, int, int]] = []

    async def fake_list_submissions_for_student(student_id: str, *, page: int, page_size: int):
        calls.append((student_id, page, page_size))
        start = (page - 1) * page_size
        end = min(start + page_size, 203)
        return {
            "items": [{"id": f"submission-{idx}"} for idx in range(start, end)],
            "total": 203,
            "page": page,
            "page_size": page_size,
        }

    monkeypatch.setattr(orchestration, "list_submissions_for_student", fake_list_submissions_for_student)

    result = await orchestration.list_all_submissions_for_student("student-1")

    assert len(result) == 203
    assert result[0]["id"] == "submission-0"
    assert result[-1]["id"] == "submission-202"
    assert calls == [
        ("student-1", 1, 100),
        ("student-1", 2, 100),
        ("student-1", 3, 100),
    ]


@pytest.mark.asyncio
async def test_assignment_repo_list_assignments_clamps_page_size_and_keeps_paging_contract(monkeypatch):
    docs = [{"_id": ObjectId(), "title": f"Assignment {idx}"} for idx in range(100)]
    fake_assignments = _FakeAssignmentsCollection(docs, total=250)
    monkeypatch.setattr(assignment_repo.db, "assignments", fake_assignments, raising=False)

    result = await assignment_repo.list_assignments(
        "section-1",
        page=2,
        page_size=999,
    )

    assert fake_assignments.count_calls == [({"courseSectionId": "section-1"}, None)]
    assert fake_assignments.find_calls == [({"courseSectionId": "section-1"}, None)]
    assert fake_assignments.cursor.sort_calls == [[("dueAt", -1), ("createdAt", -1)]]
    assert fake_assignments.cursor.skip_calls == [100]
    assert fake_assignments.cursor.limit_calls == [100]
    assert fake_assignments.cursor.to_list_lengths == [100]
    assert result["page"] == 2
    assert result["page_size"] == 100
    assert result["total"] == 250
    assert len(result["items"]) == 100
    assert all(item["id"] for item in result["items"])


@pytest.mark.asyncio
async def test_save_messages_bucketed_keeps_short_sessions_inline_and_clears_old_buckets(monkeypatch):
    session_id = str(ObjectId())
    session_oid = ObjectId(session_id)
    fake_buckets = _FakeBucketPersistenceCollection()
    monkeypatch.setattr(session_bucket_service, "db", _FakeBucketDb(fake_buckets))

    messages = [{"role": "user", "content": f"m-{idx}"} for idx in range(8)]
    result = await session_bucket_service.save_messages_bucketed(session_id, messages)

    assert fake_buckets.delete_many_calls == [{"sessionId": session_oid}]
    assert fake_buckets.insert_many_calls == []
    assert result == {"inline_messages": messages, "bucket_count": 0}


@pytest.mark.asyncio
async def test_save_messages_bucketed_splits_large_sessions_with_aware_bucket_timestamps(monkeypatch):
    session_id = str(ObjectId())
    session_oid = ObjectId(session_id)
    fixed_now = datetime(2026, 6, 28, 12, 0, tzinfo=timezone.utc)
    fake_buckets = _FakeBucketPersistenceCollection()
    monkeypatch.setattr(session_bucket_service, "db", _FakeBucketDb(fake_buckets))
    monkeypatch.setattr(session_bucket_service, "utcnow", lambda: fixed_now)

    messages = [{"role": "assistant", "content": f"m-{idx}"} for idx in range(101)]
    result = await session_bucket_service.save_messages_bucketed(session_id, messages)

    assert fake_buckets.delete_many_calls == [{"sessionId": session_oid}]
    assert len(fake_buckets.insert_many_calls) == 1
    bucket_docs = fake_buckets.insert_many_calls[0]
    assert len(bucket_docs) == 2
    assert bucket_docs[0]["sessionId"] == session_oid
    assert bucket_docs[0]["bucketIndex"] == 0
    assert bucket_docs[0]["messageCount"] == 50
    assert bucket_docs[0]["createdAt"] == fixed_now
    assert bucket_docs[0]["createdAt"].tzinfo == timezone.utc
    assert bucket_docs[1]["bucketIndex"] == 1
    assert bucket_docs[1]["messageCount"] == 50
    assert result["bucket_count"] == 2
    assert result["inline_messages"] == [{"role": "assistant", "content": "m-100"}]


@pytest.mark.asyncio
async def test_create_or_get_direct_room_sorts_pair_key_and_member_order(monkeypatch):
    fake_rooms = _FakeFindOneAndUpdateCollection({"_id": ObjectId()})
    monkeypatch.setattr(room_service.db, "chat_rooms", fake_rooms, raising=False)
    monkeypatch.setattr(room_service, "utcnow_iso", lambda: "2026-06-28T08:00:00+00:00")

    room_id = await room_service.create_or_get_direct_room(
        actor_id="user-b",
        target_user_id="user-a",
    )

    assert room_id
    assert len(fake_rooms.calls) == 1
    query, update, kwargs = fake_rooms.calls[0]
    assert query == {"directPairKey": "user-a|user-b", "type": "direct"}
    assert update["$setOnInsert"]["members"] == ["user-a", "user-b"]
    assert update["$setOnInsert"]["directPairKey"] == "user-a|user-b"
    assert update["$setOnInsert"]["createdBy"] == "user-b"
    assert kwargs["upsert"] is True


@pytest.mark.asyncio
async def test_create_or_get_direct_room_rejects_self_dm():
    with pytest.raises(HTTPException) as excinfo:
        await room_service.create_or_get_direct_room(
            actor_id="user-1",
            target_user_id="user-1",
        )

    assert excinfo.value.status_code == 400
    assert excinfo.value.detail == "Cannot create DM with yourself"


@pytest.mark.asyncio
async def test_create_group_room_rejects_invalid_member_id_before_user_count(monkeypatch):
    fake_users = _RejectingUsersCollection()
    monkeypatch.setattr(room_service.db, "users", fake_users, raising=False)

    with pytest.raises(HTTPException) as excinfo:
        await room_service.create_group_room(
            room_name="Course Group",
            member_ids=["not-an-object-id", str(ObjectId())],
            actor_id=str(ObjectId()),
            actor_name="teacher",
        )

    assert excinfo.value.status_code == 400
    assert excinfo.value.detail == "Invalid member ID: not-an-object-id"
    assert fake_users.count_documents_calls == []


@pytest.mark.asyncio
async def test_create_course_group_room_collects_section_members_and_teacher(monkeypatch):
    course_oid = ObjectId()
    teacher_id = "teacher-1"
    actor_id = "student-1"
    another_student = "student-2"
    created_at = "2026-06-28T09:00:00+00:00"
    room_oid = ObjectId()

    fake_course_sections = _FakeFindOneCollection(
        {
            "_id": course_oid,
            "courseCode": "CS101",
            "ownerTeacherId": teacher_id,
        }
    )
    fake_enrollments = _FakeEnrollmentsCollection(
        {"courseSectionId": str(course_oid), "userId": actor_id},
        [
            {"userId": actor_id},
            {"userId": another_student},
        ],
    )
    fake_rooms = _FakeChatRoomsCollection(
        {"_id": room_oid, "createdAt": created_at},
        {
            "_id": room_oid,
            "type": "group",
            "members": sorted([teacher_id, actor_id, another_student]),
            "courseId": str(course_oid),
        },
    )
    fake_messages = _FakeInsertCollection()

    monkeypatch.setattr(room_service, "utcnow_iso", lambda: created_at)
    monkeypatch.setattr(room_service.db, "course_sections", fake_course_sections, raising=False)
    monkeypatch.setattr(room_service.db, "enrollments", fake_enrollments, raising=False)
    monkeypatch.setattr(room_service.db, "chat_rooms", fake_rooms, raising=False)
    monkeypatch.setattr(room_service.db, "chat_messages", fake_messages, raising=False)

    result = await room_service.create_course_group_room(
        course_id=str(course_oid),
        user={"id": actor_id, "role": "student", "username": "alice"},
    )

    assert fake_course_sections.calls == [{"_id": course_oid}]
    assert fake_enrollments.find_one_calls == [{"courseSectionId": str(course_oid), "userId": actor_id}]
    assert fake_enrollments.find_calls == [({"courseSectionId": str(course_oid)}, {"userId": 1})]
    assert len(fake_rooms.find_one_and_update_calls) == 1
    room_query, room_update, room_kwargs = fake_rooms.find_one_and_update_calls[0]
    assert room_query == {"courseId": str(course_oid), "type": "group"}
    assert room_update["$setOnInsert"]["members"] == sorted([teacher_id, actor_id, another_student])
    assert room_update["$setOnInsert"]["courseId"] == str(course_oid)
    assert room_kwargs["upsert"] is True
    assert len(fake_messages.calls) == 1
    assert fake_messages.calls[0]["roomId"] == str(room_oid)
    assert fake_messages.calls[0]["readBy"] == [actor_id]
    assert result["roomId"] == str(room_oid)
    assert result["isExisting"] is False
    assert result["memberIds"] == sorted([teacher_id, actor_id, another_student])


@pytest.mark.asyncio
async def test_create_course_group_room_returns_existing_room_without_system_message(monkeypatch):
    course_oid = ObjectId()
    created_at = "2026-06-28T09:00:00+00:00"
    existing_created_at = "2026-06-28T08:59:59+00:00"
    room_oid = ObjectId()

    fake_course_sections = _FakeFindOneCollection(
        {
            "_id": course_oid,
            "courseCode": "CS101",
            "ownerTeacherId": "teacher-1",
        }
    )
    fake_enrollments = _FakeEnrollmentsCollection(
        {"courseSectionId": str(course_oid), "userId": "student-1"},
        [{"userId": "student-1"}],
    )
    fake_rooms = _FakeChatRoomsCollection(
        {"_id": room_oid, "createdAt": existing_created_at},
        {"_id": room_oid},
    )
    fake_messages = _FakeInsertCollection()

    monkeypatch.setattr(room_service, "utcnow_iso", lambda: created_at)
    monkeypatch.setattr(room_service.db, "course_sections", fake_course_sections, raising=False)
    monkeypatch.setattr(room_service.db, "enrollments", fake_enrollments, raising=False)
    monkeypatch.setattr(room_service.db, "chat_rooms", fake_rooms, raising=False)
    monkeypatch.setattr(room_service.db, "chat_messages", fake_messages, raising=False)

    result = await room_service.create_course_group_room(
        course_id=str(course_oid),
        user={"id": "student-1", "role": "student", "username": "alice"},
    )

    assert result == {"roomId": str(room_oid), "isExisting": True}
    assert fake_messages.calls == []
    assert fake_rooms.find_one_calls == []


@pytest.mark.asyncio
async def test_create_course_group_room_uses_legacy_course_membership_path(monkeypatch):
    legacy_course_id = "LEGACY-101"
    legacy_course_oid = ObjectId()
    teacher_id = "teacher-1"
    learner_id = "student-1"
    ta_id = "ta-1"
    created_at = "2026-06-28T10:00:00+00:00"
    room_oid = ObjectId()

    fake_courses = _FakeFindOneCollection(
        {
            "_id": legacy_course_oid,
            "courseId": legacy_course_id,
            "name": "Legacy Physics",
            "teacherId": teacher_id,
        }
    )
    fake_enrollments = _FakeEnrollmentsCollection(
        None,
        [
            {"userId": learner_id},
            {"userId": ta_id},
        ],
    )
    fake_rooms = _FakeChatRoomsCollection(
        {"_id": room_oid, "createdAt": created_at},
        {
            "_id": room_oid,
            "type": "group",
            "members": sorted([teacher_id, learner_id, ta_id]),
            "courseId": str(legacy_course_oid),
        },
    )
    fake_messages = _FakeInsertCollection()

    monkeypatch.setattr(room_service, "utcnow_iso", lambda: created_at)
    monkeypatch.setattr(room_service.db, "courses", fake_courses, raising=False)
    monkeypatch.setattr(room_service.db, "enrollments", fake_enrollments, raising=False)
    monkeypatch.setattr(room_service.db, "chat_rooms", fake_rooms, raising=False)
    monkeypatch.setattr(room_service.db, "chat_messages", fake_messages, raising=False)

    result = await room_service.create_course_group_room(
        course_id=legacy_course_id,
        user={"id": teacher_id, "role": "teacher", "username": "teacher"},
    )

    assert fake_courses.calls == [{"courseId": legacy_course_id}]
    assert fake_enrollments.find_one_calls == []
    assert fake_enrollments.find_calls == [({"courseId": legacy_course_id}, {"userId": 1})]
    room_query, room_update, _room_kwargs = fake_rooms.find_one_and_update_calls[0]
    assert room_query == {"courseId": str(legacy_course_oid), "type": "group"}
    assert room_update["$setOnInsert"]["members"] == sorted([teacher_id, learner_id, ta_id])
    assert fake_messages.calls[0]["senderId"] == teacher_id
    assert result["roomId"] == str(room_oid)
    assert result["memberIds"] == sorted([teacher_id, learner_id, ta_id])


@pytest.mark.asyncio
async def test_create_course_group_room_rejects_legacy_non_member_before_room_upsert(monkeypatch):
    legacy_course_id = "LEGACY-102"
    fake_courses = _FakeFindOneCollection(
        {
            "_id": ObjectId(),
            "courseId": legacy_course_id,
            "title": "Legacy Biology",
            "teacherId": "teacher-1",
        }
    )
    fake_enrollments = _FakeEnrollmentsCollection(None, [{"userId": "student-1"}])
    fake_rooms = _FakeChatRoomsCollection({"_id": ObjectId(), "createdAt": "old"}, {"_id": ObjectId()})

    monkeypatch.setattr(room_service.db, "courses", fake_courses, raising=False)
    monkeypatch.setattr(room_service.db, "enrollments", fake_enrollments, raising=False)
    monkeypatch.setattr(room_service.db, "chat_rooms", fake_rooms, raising=False)

    with pytest.raises(HTTPException) as excinfo:
        await room_service.create_course_group_room(
            course_id=legacy_course_id,
            user={"id": "student-2", "role": "student", "username": "bob"},
        )

    assert excinfo.value.status_code == 403
    assert excinfo.value.detail == "Only course members can create this group"
    assert fake_courses.calls == [{"courseId": legacy_course_id}]
    assert fake_enrollments.find_calls == []
    assert fake_rooms.find_one_and_update_calls == []


@pytest.mark.asyncio
async def test_soft_delete_asset_passes_aware_utc_to_repo(monkeypatch):
    fixed_now = datetime(2026, 6, 28, 10, 0, tzinfo=timezone.utc)
    soft_delete = AsyncMock(
        return_value={
            "file_id": "asset-1",
            "status": "soft_deleted",
            "deleted_at": fixed_now,
        }
    )

    monkeypatch.setattr(lifecycle, "utcnow", lambda: fixed_now)
    monkeypatch.setattr(lifecycle.file_asset_repo, "soft_delete_asset_by_file_id", soft_delete)

    result = await lifecycle.soft_delete_asset("asset-1", "admin-1", reason="cleanup")

    assert soft_delete.await_args.kwargs["now"] == fixed_now
    assert soft_delete.await_args.kwargs["now"].tzinfo == timezone.utc
    assert result["deleted_at"] == fixed_now.isoformat()


@pytest.mark.asyncio
async def test_restore_asset_passes_aware_utc_to_repo(monkeypatch):
    fixed_now = datetime(2026, 6, 28, 10, 30, tzinfo=timezone.utc)
    restore = AsyncMock(
        return_value={
            "file_id": "asset-1",
            "status": "active",
            "restored_at": fixed_now,
        }
    )

    monkeypatch.setattr(lifecycle, "utcnow", lambda: fixed_now)
    monkeypatch.setattr(lifecycle.file_asset_repo, "restore_asset_by_file_id", restore)

    result = await lifecycle.restore_asset("asset-1", "admin-1")

    assert restore.await_args.kwargs["now"] == fixed_now
    assert restore.await_args.kwargs["now"].tzinfo == timezone.utc
    assert result["restored_at"] == fixed_now.isoformat()


@pytest.mark.asyncio
async def test_soft_delete_course_source_assets_passes_reason_and_aware_utc(monkeypatch):
    fixed_now = datetime(2026, 6, 28, 10, 45, tzinfo=timezone.utc)
    soft_delete_sources = AsyncMock(return_value=None)

    monkeypatch.setattr(lifecycle, "utcnow", lambda: fixed_now)
    monkeypatch.setattr(lifecycle.file_asset_repo, "soft_delete_knowledge_source_assets", soft_delete_sources)

    await lifecycle.soft_delete_course_source_assets(course_id="course-1", filename="notes.pdf")

    assert soft_delete_sources.await_args.kwargs == {
        "course_id": "course-1",
        "filename": "notes.pdf",
        "now": fixed_now,
        "reason": "Removed from course index",
    }
    assert soft_delete_sources.await_args.kwargs["now"].tzinfo == timezone.utc


@pytest.mark.asyncio
async def test_hard_delete_asset_blocks_when_references_exist(monkeypatch, tmp_path):
    asset_file = tmp_path / "asset.pdf"
    asset_file.write_bytes(b"pdf")
    mark_hard_deleted = AsyncMock()

    monkeypatch.setattr(
        lifecycle.file_asset_repo,
        "find_asset_by_file_id",
        AsyncMock(
            return_value={
                "file_id": "asset-2",
                "storage_path": "uploads/asset.pdf",
                "file_type": "document",
                "owner_type": "submission_document",
            }
        ),
    )
    monkeypatch.setattr(
        lifecycle,
        "check_references",
        AsyncMock(return_value={"ok_to_delete": False, "reason": "document_reference"}),
    )
    monkeypatch.setattr(lifecycle, "absolute_from_storage_path", lambda _path: asset_file)
    monkeypatch.setattr(lifecycle.file_asset_repo, "mark_asset_hard_deleted", mark_hard_deleted)

    result = await lifecycle.hard_delete_asset("asset-2", "admin-1")

    assert result == {"blocked": True, "reason": "document_reference"}
    assert asset_file.exists() is True
    assert mark_hard_deleted.await_count == 0


@pytest.mark.asyncio
async def test_hard_delete_asset_removes_vectorstore_directory(monkeypatch, tmp_path):
    fixed_now = datetime(2026, 6, 28, 11, 30, tzinfo=timezone.utc)
    vector_dir = tmp_path / "vectorstore"
    vector_dir.mkdir()
    (vector_dir / "index.bin").write_bytes(b"idx")
    mark_hard_deleted = AsyncMock(return_value={"file_id": "asset-3", "hard_deleted_at": fixed_now})

    monkeypatch.setattr(lifecycle, "utcnow", lambda: fixed_now)
    monkeypatch.setattr(
        lifecycle.file_asset_repo,
        "find_asset_by_file_id",
        AsyncMock(
            return_value={
                "file_id": "asset-3",
                "storage_path": "uploads/vectorstore",
                "file_type": "knowledge_vectorstore",
                "owner_type": "knowledge_document",
            }
        ),
    )
    monkeypatch.setattr(lifecycle, "check_references", AsyncMock(return_value={"ok_to_delete": True, "reason": ""}))
    monkeypatch.setattr(lifecycle, "absolute_from_storage_path", lambda _path: vector_dir)
    monkeypatch.setattr(lifecycle.file_asset_repo, "mark_asset_hard_deleted", mark_hard_deleted)

    result = await lifecycle.hard_delete_asset("asset-3", "admin-1")

    assert vector_dir.exists() is False
    assert mark_hard_deleted.await_args.kwargs["deleted_from_disk"] is True
    assert mark_hard_deleted.await_args.kwargs["deleted_from_session"] is False
    assert result["hard_deleted_at"] == fixed_now.isoformat()


@pytest.mark.asyncio
async def test_hard_delete_asset_marks_disk_and_session_deletion_flags(monkeypatch, tmp_path):
    fixed_now = datetime(2026, 6, 28, 11, 0, tzinfo=timezone.utc)
    asset_file = tmp_path / "asset.png"
    asset_file.write_bytes(b"png")
    mark_hard_deleted = AsyncMock(
        return_value={
            "file_id": "asset-1",
            "hard_deleted_at": fixed_now,
        }
    )

    monkeypatch.setattr(lifecycle, "utcnow", lambda: fixed_now)
    monkeypatch.setattr(
        lifecycle.file_asset_repo,
        "find_asset_by_file_id",
        AsyncMock(
            return_value={
                "file_id": "asset-1",
                "storage_path": "uploads/asset.png",
                "file_type": "image",
                "owner_type": "ai_chat_session",
            }
        ),
    )
    monkeypatch.setattr(lifecycle, "check_references", AsyncMock(return_value={"ok_to_delete": True, "reason": ""}))
    monkeypatch.setattr(lifecycle, "absolute_from_storage_path", lambda _path: asset_file)
    monkeypatch.setattr(lifecycle, "_delete_ai_session_image", AsyncMock(return_value=True))
    monkeypatch.setattr(lifecycle.file_asset_repo, "mark_asset_hard_deleted", mark_hard_deleted)

    result = await lifecycle.hard_delete_asset("asset-1", "admin-1")

    assert asset_file.exists() is False
    assert mark_hard_deleted.await_args.kwargs["now"] == fixed_now
    assert mark_hard_deleted.await_args.kwargs["deleted_from_disk"] is True
    assert mark_hard_deleted.await_args.kwargs["deleted_from_session"] is True
    assert result["hard_deleted_at"] == fixed_now.isoformat()


@pytest.mark.asyncio
async def test_check_references_submission_document_uses_object_id(monkeypatch):
    document_oid = ObjectId()
    fake_documents = _FakeFindOneCollection({"_id": document_oid})
    monkeypatch.setattr(lifecycle.db, "documents", fake_documents, raising=False)

    result = await lifecycle.check_references(
        {"owner_type": "submission_document", "owner_id": str(document_oid)}
    )

    assert result == {"ok_to_delete": False, "reason": "document_reference"}
    assert fake_documents.calls == [{"_id": document_oid}]


@pytest.mark.asyncio
async def test_check_references_blocks_when_knowledge_document_is_still_indexed(monkeypatch):
    rag_module = ModuleType("backend.services.course_rag_service")
    rag_module.course_rag_service = SimpleNamespace(
        list_indexed_documents=lambda course_id: [{"doc_name": "notes.pdf", "course_id": course_id}]
    )
    monkeypatch.setitem(sys.modules, "backend.services.course_rag_service", rag_module)

    result = await lifecycle.check_references(
        {
            "owner_type": "knowledge_document",
            "course_id": "course-1",
            "filename": "notes.pdf",
        }
    )

    assert result == {"ok_to_delete": False, "reason": "knowledge_doc_still_indexed"}


@pytest.mark.asyncio
async def test_check_references_blocks_when_knowledge_reference_check_fails(monkeypatch):
    def _explode(_course_id: str):
        raise RuntimeError("boom")

    rag_module = ModuleType("backend.services.course_rag_service")
    rag_module.course_rag_service = SimpleNamespace(list_indexed_documents=_explode)
    monkeypatch.setitem(sys.modules, "backend.services.course_rag_service", rag_module)

    result = await lifecycle.check_references(
        {
            "owner_type": "knowledge_document",
            "course_id": "course-2",
            "filename": "slides.pdf",
        }
    )

    assert result == {"ok_to_delete": False, "reason": "knowledge_reference_check_failed"}


@pytest.mark.asyncio
async def test_load_all_messages_reassembles_bucket_history_in_order(monkeypatch):
    session_id = str(ObjectId())
    session_oid = ObjectId(session_id)
    fake_buckets = _FakeBucketFindCollection(
        [
            {"bucketIndex": 0, "messages": [{"role": "user", "content": "m-0"}]},
            {"bucketIndex": 1, "messages": [{"role": "assistant", "content": "m-1"}]},
        ]
    )
    monkeypatch.setattr(
        session_bucket_service,
        "db",
        {session_bucket_service.BUCKET_COLLECTION: fake_buckets},
        raising=False,
    )

    messages = await session_bucket_service.load_all_messages(
        session_id,
        [{"role": "user", "content": "m-2"}],
    )

    assert fake_buckets.find_calls == [{"sessionId": session_oid}]
    assert fake_buckets.cursor.sort_calls == [("bucketIndex", 1)]
    assert messages == [
        {"role": "user", "content": "m-0"},
        {"role": "assistant", "content": "m-1"},
        {"role": "user", "content": "m-2"},
    ]
