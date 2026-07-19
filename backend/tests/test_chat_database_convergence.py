from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from bson import ObjectId

from backend.repositories import ai_session_repo
from backend.repositories import file_asset_repo
from backend.services.chat_service import contact_service, message_service, query_service, room_service, session_bucket_service, transfer_dispatch_service
from backend.services.file_assets import lifecycle
from backend.services.file_assets import backfill_ai_chat, queries
from backend.services.files import file_center_service
from backend.services.llm_service import chat_ai_service


class _FakeBucketCollection:
    def __init__(self):
        self.inserted_docs: list[dict] = []

    async def insert_many(self, docs: list[dict]):
        self.inserted_docs.extend(docs)
        return SimpleNamespace(inserted_ids=[doc["bucketIndex"] for doc in docs])


class _FakeBucketDb:
    def __init__(self, collection):
        self.collection = collection

    def __getitem__(self, name: str):
        assert name == session_bucket_service.BUCKET_COLLECTION
        return self.collection


class _FakeInsertCollection:
    def __init__(self, inserted_id: ObjectId | None = None):
        self.inserted_id = inserted_id or ObjectId()
        self.insert_one_calls: list[dict] = []

    async def insert_one(self, document: dict):
        self.insert_one_calls.append(document)
        return SimpleNamespace(inserted_id=self.inserted_id)


class _FakeUpdateCollection:
    def __init__(self):
        self.update_one_calls: list[tuple[dict, dict]] = []

    async def update_one(self, query: dict, update: dict):
        self.update_one_calls.append((query, update))
        return SimpleNamespace(modified_count=1)


class _FakeTransferCollection:
    def __init__(self, document: dict | None):
        self.document = document
        self.find_one_calls: list[dict] = []
        self.update_one_calls: list[tuple[dict, dict]] = []

    async def find_one(self, query: dict):
        self.find_one_calls.append(query)
        return self.document

    async def update_one(self, query: dict, update: dict):
        self.update_one_calls.append((query, update))
        return SimpleNamespace(modified_count=1)


class _FakeFileAssetsCollection:
    def __init__(self, document: dict | None):
        self.document = document
        self.calls: list[dict] = []

    async def find_one(self, query: dict):
        self.calls.append(query)
        return self.document


class _EmptyAsyncCursor:
    def __aiter__(self):
        return self

    async def __anext__(self):
        raise StopAsyncIteration


class _FakeAISessionCollection:
    def __init__(self):
        self.find_calls: list[dict] = []

    def find(self, query: dict):
        self.find_calls.append(query)
        return _EmptyAsyncCursor()


class _AsyncSequenceCursor:
    def __init__(self, docs: list[dict]):
        self._docs = list(docs)
        self._iter = iter(())

    def __aiter__(self):
        self._iter = iter(self._docs)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration as exc:
            raise StopAsyncIteration from exc


class _PagedAsyncCursor(_AsyncSequenceCursor):
    def __init__(self, docs: list[dict]):
        super().__init__(docs)
        self.sort_calls: list[tuple] = []
        self.skip_value: int | None = None
        self.limit_value: int | None = None

    def sort(self, *args):
        self.sort_calls.append(args)
        return self

    def skip(self, value: int):
        self.skip_value = value
        return self

    def limit(self, value: int):
        self.limit_value = value
        return self


class _FakePagedCollection:
    def __init__(self, docs: list[dict], *, total: int):
        self.cursor = _PagedAsyncCursor(docs)
        self.total = total
        self.find_calls: list[tuple[dict, dict | None]] = []
        self.count_calls: list[dict] = []

    def find(self, query: dict, projection: dict | None = None):
        self.find_calls.append((query, projection))
        return self.cursor

    async def count_documents(self, query: dict):
        self.count_calls.append(query)
        return self.total


class _FakeCourseSectionsCollection:
    def __init__(self, docs: list[dict]):
        self.docs = docs
        self.find_calls: list[tuple[dict, dict | None]] = []

    def find(self, query: dict, projection: dict | None = None):
        self.find_calls.append((query, projection))
        if query == {}:
            return _AsyncSequenceCursor([{"_id": doc["_id"]} for doc in self.docs])
        if "_id" in query:
            return _AsyncSequenceCursor(self.docs)
        return _AsyncSequenceCursor([])


class _FakeRoomsByCourseCollection:
    def __init__(self, docs: list[dict]):
        self.docs = docs
        self.find_calls: list[tuple[dict, dict | None]] = []
        self.find_one_calls: list[tuple[dict, dict | None]] = []

    def find(self, query: dict, projection: dict | None = None):
        self.find_calls.append((query, projection))
        return _AsyncSequenceCursor(self.docs)

    async def find_one(self, query: dict, projection: dict | None = None):
        self.find_one_calls.append((query, projection))
        raise AssertionError("list_courses_for_group should batch room lookups with find()")


class _FakeAggregateFileAssetsCollection:
    def __init__(self):
        self.count_queries: list[dict] = []
        self.aggregate_pipelines: list[list[dict]] = []

    async def count_documents(self, query: dict):
        self.count_queries.append(query)
        return 12

    def aggregate(self, pipeline: list[dict]):
        self.aggregate_pipelines.append(pipeline)
        return _AsyncSequenceCursor(
            [
                {
                    "date": "2026-06",
                    "count": 2,
                    "total_size": 9,
                    "items": [],
                }
            ]
        )


async def test_append_messages_bucketed_promotes_messages_with_aware_utc(monkeypatch):
    collection = _FakeBucketCollection()
    monkeypatch.setattr(session_bucket_service, "db", _FakeBucketDb(collection))

    session_id = str(ObjectId())
    existing_inline = [{"role": "assistant", "content": f"m-{idx}"} for idx in range(49)]
    delta = [
        {"role": "user", "content": "m-49"},
        {"role": "assistant", "content": "m-50"},
    ]

    result = await session_bucket_service.append_messages_bucketed(
        session_id,
        delta,
        existing_inline_messages=existing_inline,
        existing_bucket_count=2,
    )

    assert result["bucket_count"] == 3
    assert result["inline_messages"] == [{"role": "assistant", "content": "m-50"}]
    assert len(collection.inserted_docs) == 1
    inserted = collection.inserted_docs[0]
    assert inserted["sessionId"] == ObjectId(session_id)
    assert inserted["bucketIndex"] == 2
    assert inserted["createdAt"].tzinfo == timezone.utc


async def test_create_group_room_queries_members_as_object_ids(monkeypatch):
    actor_id = str(ObjectId())
    member_ids = [str(ObjectId()), str(ObjectId())]
    fake_rooms = _FakeInsertCollection()
    fake_messages = _FakeInsertCollection()
    find_many_by_ids = AsyncMock(return_value=[{"_id": ObjectId(member_ids[0])}, {"_id": ObjectId(member_ids[1])}])

    monkeypatch.setattr(room_service.user_repo, "find_many_by_ids", find_many_by_ids)
    monkeypatch.setattr(room_service.db, "chat_rooms", fake_rooms, raising=False)
    monkeypatch.setattr(room_service.db, "chat_messages", fake_messages, raising=False)

    room_id = await room_service.create_group_room(
        room_name="Course Group",
        member_ids=member_ids,
        actor_id=actor_id,
        actor_name="teacher",
    )

    assert room_id == str(fake_rooms.inserted_id)
    assert find_many_by_ids.await_args.kwargs == {
        "projection": {"_id": 1},
    }
    assert find_many_by_ids.await_args.args == ([ObjectId(member_ids[0]), ObjectId(member_ids[1])],)
    assert fake_rooms.insert_one_calls[0]["members"] == sorted([actor_id, *member_ids])
    assert isinstance(fake_messages.insert_one_calls[0]["sentAt"], str)


async def test_consume_transfer_accepts_legacy_naive_expiration_and_sets_aware_consumed_at(monkeypatch):
    transfer_doc = {
        "transfer_id": "tx-1",
        "owner_user_id": "user-1",
        "status": "created",
        "source_file_url": "/static/chat_files/demo.pdf",
        "file_meta": {"name": "demo.pdf", "ext": "pdf"},
        "target_module": "sub1",
        "target_options": {},
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=5)).replace(tzinfo=None),
    }
    fake_transfers = _FakeTransferCollection(transfer_doc)
    monkeypatch.setattr(transfer_dispatch_service.db, "chat_file_transfers", fake_transfers, raising=False)
    monkeypatch.setattr(transfer_dispatch_service, "_resolve_file_path", lambda _url: "ok")

    result = await transfer_dispatch_service.consume_transfer("tx-1", "user-1")

    assert result["status"] == "consumed"
    assert len(fake_transfers.update_one_calls) == 1
    update_query, update_doc = fake_transfers.update_one_calls[0]
    assert update_query == {"transfer_id": "tx-1"}
    assert update_doc["$set"]["status"] == "consumed"
    assert update_doc["$set"]["consumed_at"].tzinfo == timezone.utc


async def test_consume_transfer_expires_legacy_naive_ticket(monkeypatch):
    transfer_doc = {
        "transfer_id": "tx-2",
        "owner_user_id": "user-1",
        "status": "created",
        "source_file_url": "/static/chat_files/demo.pdf",
        "file_meta": {"name": "demo.pdf", "ext": "pdf"},
        "target_module": "sub1",
        "target_options": {},
        "expires_at": (datetime.now(timezone.utc) - timedelta(minutes=1)).replace(tzinfo=None),
    }
    fake_transfers = _FakeTransferCollection(transfer_doc)
    monkeypatch.setattr(transfer_dispatch_service.db, "chat_file_transfers", fake_transfers, raising=False)

    with pytest.raises(ValueError, match="expired"):
        await transfer_dispatch_service.consume_transfer("tx-2", "user-1")

    assert fake_transfers.update_one_calls == [
        ({"transfer_id": "tx-2"}, {"$set": {"status": "expired"}})
    ]


async def test_find_asset_by_identifier_uses_object_id_when_valid_and_file_id_when_not(monkeypatch):
    fake_assets = _FakeFileAssetsCollection({"_id": ObjectId(), "storage_path": ""})
    monkeypatch.setattr(file_asset_repo.db, "file_assets", fake_assets, raising=False)

    valid_id = str(ObjectId())
    await file_asset_repo.find_asset_by_identifier(valid_id)
    await file_asset_repo.find_asset_by_identifier("legacy-file-id")

    assert fake_assets.calls[0] == {"_id": ObjectId(valid_id)}
    assert fake_assets.calls[1] == {"file_id": "legacy-file-id"}


async def test_list_ai_personal_assets_page_builds_paged_grouping_pipeline(monkeypatch):
    fake_assets = _FakeAggregateFileAssetsCollection()
    monkeypatch.setattr(file_asset_repo.db, "file_assets", fake_assets, raising=False)

    total, groups = await file_asset_repo.list_ai_personal_assets_page(
        user_id="user-1",
        status="",
        group_by="month",
        skip=5,
        limit=10,
    )

    expected_query = {
        "scope": "ai_personal",
        "user_id": "user-1",
        "status": {"$ne": "hard_deleted"},
    }
    assert total == 12
    assert groups == [{"date": "2026-06", "count": 2, "total_size": 9, "items": []}]
    assert fake_assets.count_queries == [expected_query]
    pipeline = fake_assets.aggregate_pipelines[0]
    assert pipeline[0] == {"$match": expected_query}
    assert pipeline[1] == {"$sort": {"created_at": -1, "_id": -1}}
    assert {"$skip": 5} in pipeline
    assert {"$limit": 10} in pipeline


async def test_ensure_ai_session_image_assets_uses_shared_object_id_helper(monkeypatch):
    calls: list[tuple[str, dict | None]] = []

    def _fake_find_cursor_for_user(user_id: str, *, projection: dict | None = None):
        calls.append((user_id, projection))
        return _EmptyAsyncCursor()

    monkeypatch.setattr(ai_session_repo, "find_cursor_for_user", _fake_find_cursor_for_user)

    user_id = str(ObjectId())
    created = await backfill_ai_chat.ensure_ai_session_image_assets(user_id)

    assert created == 0
    assert calls == [
        (
            user_id,
            {"_id": 1, "messages": 1, "createdAt": 1, "updatedAt": 1},
        )
    ]


async def test_ensure_ai_session_image_assets_preserves_file_ids_and_dates_for_legacy_values(monkeypatch):
    session_id = str(ObjectId())
    aware_created_at = datetime(2026, 6, 1, 8, 30, tzinfo=timezone.utc)
    naive_updated_at = datetime(2026, 6, 2, 9, 45)
    inserted_docs: list[dict] = []

    monkeypatch.setattr(
        ai_session_repo,
        "find_cursor_for_user",
        lambda *_args, **_kwargs: _AsyncSequenceCursor(
            [
                {
                    "_id": ObjectId(session_id),
                    "createdAt": "2026-06-04T13:00:00Z",
                    "updatedAt": naive_updated_at,
                    "messages": [
                        {"createdAt": aware_created_at, "images": ["img-base64"]},
                        {"files": [{"file_name": "notes.txt", "mime_type": ""}]},
                        {"createdAt": "2026-06-03T12:00:00Z", "content": "Attached PDF: legacy.pdf"},
                    ],
                }
            ]
        ),
    )
    monkeypatch.setattr(file_asset_repo, "find_asset_by_file_id", AsyncMock(return_value=None))

    async def _fake_insert_asset(document: dict):
        inserted_docs.append(document)
        return SimpleNamespace(inserted_id=document["file_id"])

    monkeypatch.setattr(file_asset_repo, "insert_asset", _fake_insert_asset)

    created = await backfill_ai_chat.ensure_ai_session_image_assets("user-1")

    assert created == 3
    assert [doc["file_id"] for doc in inserted_docs] == [
        f"aiimg_{session_id}_0_0",
        f"aifile_{session_id}_1_0",
        f"aifile_legacy_{session_id}_2_0",
    ]
    assert [doc["conversation_date"] for doc in inserted_docs] == [
        "2026-06-01",
        "2026-06-02",
        "2026-06-03",
    ]


async def test_ensure_ai_session_image_assets_skips_existing_assets(monkeypatch):
    monkeypatch.setattr(
        ai_session_repo,
        "find_cursor_for_user",
        lambda *_args, **_kwargs: _AsyncSequenceCursor(
            [
                {
                    "_id": ObjectId(),
                    "messages": [{"images": ["img-base64"]}],
                }
            ]
        ),
    )
    monkeypatch.setattr(
        file_asset_repo,
        "find_asset_by_file_id",
        AsyncMock(return_value={"file_id": "existing"}),
    )
    insert_asset = AsyncMock()
    monkeypatch.setattr(file_asset_repo, "insert_asset", insert_asset)

    created = await backfill_ai_chat.ensure_ai_session_image_assets("user-1")

    assert created == 0
    assert insert_asset.await_count == 0


async def test_delete_ai_session_image_updates_session_via_repo_with_aware_utc(monkeypatch):
    update_by_id = AsyncMock(return_value=SimpleNamespace(modified_count=1))
    monkeypatch.setattr(
        ai_session_repo,
        "find_by_id",
        AsyncMock(
            return_value={
                "_id": ObjectId(),
                "messages": [{"images": ["a", "b"]}],
            }
        ),
    )
    monkeypatch.setattr(ai_session_repo, "update_by_id", update_by_id)

    deleted = await lifecycle._delete_ai_session_image(
        {
            "owner_id": str(ObjectId()),
            "metadata": {"message_index": 0, "image_index": 1},
        }
    )

    assert deleted is True
    update_args = update_by_id.await_args.args
    assert update_args[1]["$set"]["messages"] == [{"images": ["a", ""]}]
    assert update_args[1]["$set"]["updatedAt"].tzinfo == timezone.utc


async def test_get_chat_user_by_id_preserves_id_field_via_user_repo(monkeypatch):
    user_id = str(ObjectId())
    user_doc = {"_id": ObjectId(user_id), "username": "alice"}
    monkeypatch.setattr(query_service.user_repo, "find_by_id", AsyncMock(return_value=user_doc))

    result = await query_service.get_chat_user_by_id(user_id)

    assert result is user_doc
    assert result["id"] == user_id
    assert result["_id"] == ObjectId(user_id)


async def test_get_message_by_id_uses_chat_message_repo_object_id(monkeypatch):
    message_id = str(ObjectId())
    find_by_id = AsyncMock(return_value={"_id": ObjectId(message_id), "content": "hello"})
    monkeypatch.setattr(query_service.chat_message_repo, "find_by_id", find_by_id)

    result = await query_service.get_message_by_id(message_id, projection={"content": 1})

    assert result == {"_id": ObjectId(message_id), "content": "hello"}
    assert find_by_id.await_args.args == (ObjectId(message_id), {"content": 1})


async def test_list_room_messages_uses_repo_with_page_guard(monkeypatch):
    room = {"_id": ObjectId(), "courseId": "course-1"}
    list_room_messages = AsyncMock(
        return_value=[
            {"_id": ObjectId(), "content": "newest", "sentAt": "2026-06-02T10:00:00Z"},
            {"_id": ObjectId(), "content": "older", "sentAt": "2026-06-02T09:00:00Z"},
            {"_id": ObjectId(), "content": "oldest", "sentAt": "2026-06-02T08:00:00Z"},
        ]
    )

    monkeypatch.setattr(message_service, "get_room_for_member", AsyncMock(return_value=room))
    monkeypatch.setattr(message_service.chat_message_repo, "list_room_messages", list_room_messages)

    result = await message_service.list_room_messages(
        room_id="room-1",
        user_id="user-1",
        before="2026-06-02T11:00:00Z",
        limit=2,
    )

    assert list_room_messages.await_args.kwargs == {
        "room_id": "room-1",
        "before": "2026-06-02T11:00:00Z",
        "exclude_deleted_for": "user-1",
        "limit": 3,
    }
    assert result["hasMore"] is True
    assert [msg["content"] for msg in result["messages"]] == ["older", "newest"]


async def test_fetch_room_messages_uses_repo_since_and_limit(monkeypatch):
    list_room_messages = AsyncMock(
        return_value=[
            {"_id": ObjectId(), "content": "newest"},
            {"_id": ObjectId(), "content": "older"},
        ]
    )
    monkeypatch.setattr(chat_ai_service.chat_message_repo, "list_room_messages", list_room_messages)

    messages = await chat_ai_service._fetch_room_messages(
        "room-1",
        limit=2,
        since="2026-06-01T00:00:00Z",
    )

    assert list_room_messages.await_args.kwargs == {
        "room_id": "room-1",
        "since": "2026-06-01T00:00:00Z",
        "limit": 2,
    }
    assert [msg["content"] for msg in messages] == ["older", "newest"]


async def test_search_users_for_contacts_preserves_shape_and_skips_self(monkeypatch):
    user_id = str(ObjectId())
    other_id = str(ObjectId())
    monkeypatch.setattr(
        contact_service.user_repo,
        "list_users",
        AsyncMock(
            return_value=[
                {"_id": ObjectId(user_id), "username": "self", "email": "self@example.com", "role": "student"},
                {"_id": ObjectId(other_id), "username": "other", "email": "other@example.com", "role": "teacher"},
            ]
        ),
    )

    result = await contact_service.search_users_for_contacts(query="oth", user_id=user_id)

    assert result == [
        {
            "id": other_id,
            "username": "other",
            "email": "other@example.com",
            "role": "teacher",
        }
    ]


async def test_create_message_reuses_existing_chat_attachment_asset(monkeypatch):
    room = {"_id": ObjectId(), "courseId": "course-1"}
    fake_messages = _FakeInsertCollection()
    fake_rooms = _FakeUpdateCollection()

    monkeypatch.setattr(message_service, "get_room_for_member", AsyncMock(return_value=room))
    monkeypatch.setattr(message_service.db, "chat_messages", fake_messages, raising=False)
    monkeypatch.setattr(message_service.db, "chat_rooms", fake_rooms, raising=False)
    bind_asset = AsyncMock(return_value=SimpleNamespace(matched_count=1))
    register_asset = AsyncMock()
    monkeypatch.setattr(message_service.file_asset_repo, "bind_chat_attachment_to_message", bind_asset)
    monkeypatch.setattr(message_service, "register_file_asset", register_asset)

    result = await message_service.create_message(
        room_id="room-1",
        user={"id": "user-1", "username": "alice"},
        content="See attachment",
        message_type="file",
        file_url="/static/chat_files/demo.pdf",
        file_name="demo.pdf",
        file_size=12,
        mime_type="application/pdf",
        storage_path="uploads/chat/demo.pdf",
    )

    assert result["message"]["id"] == str(fake_messages.inserted_id)
    assert bind_asset.await_args.kwargs == {
        "public_url": "/static/chat_files/demo.pdf",
        "owner_id": str(fake_messages.inserted_id),
        "room_id": "room-1",
        "user_id": "user-1",
        "now": bind_asset.await_args.kwargs["now"],
    }
    assert bind_asset.await_args.kwargs["now"].tzinfo == timezone.utc
    assert register_asset.await_count == 0
    assert fake_rooms.update_one_calls[0][0] == {"_id": room["_id"]}


async def test_recall_message_accepts_legacy_naive_datetime_as_utc(monkeypatch):
    message_id = str(ObjectId())
    sent_at = datetime.now(timezone.utc).replace(tzinfo=None)
    fake_messages = _FakeUpdateCollection()

    monkeypatch.setattr(
        message_service,
        "get_message_by_id",
        AsyncMock(return_value={"_id": ObjectId(message_id), "senderId": "user-1", "roomId": "room-1", "sentAt": sent_at}),
    )
    monkeypatch.setattr(message_service, "get_room_for_member", AsyncMock(return_value={"_id": ObjectId(), "id": "room-1"}))
    monkeypatch.setattr(message_service.db, "chat_messages", fake_messages, raising=False)

    result = await message_service.recall_message(message_id=message_id, user_id="user-1")

    assert result["roomId"] == "room-1"
    assert fake_messages.update_one_calls == [
        ({"_id": ObjectId(message_id)}, {"$set": {"recalled": True, "content": "This message was recalled"}})
    ]


async def test_recall_message_accepts_legacy_naive_iso_string_as_utc(monkeypatch):
    message_id = str(ObjectId())
    fake_messages = _FakeUpdateCollection()

    monkeypatch.setattr(
        message_service,
        "get_message_by_id",
        AsyncMock(
            return_value={
                "_id": ObjectId(message_id),
                "senderId": "user-1",
                "roomId": "room-1",
                "sentAt": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
            }
        ),
    )
    monkeypatch.setattr(message_service, "get_room_for_member", AsyncMock(return_value={"_id": ObjectId(), "id": "room-1"}))
    monkeypatch.setattr(message_service.db, "chat_messages", fake_messages, raising=False)

    result = await message_service.recall_message(message_id=message_id, user_id="user-1")

    assert result["roomId"] == "room-1"
    assert fake_messages.update_one_calls == [
        ({"_id": ObjectId(message_id)}, {"$set": {"recalled": True, "content": "This message was recalled"}})
    ]


async def test_list_ai_users_preserves_admin_file_center_shape_with_repo_counts(monkeypatch):
    user_a = ObjectId()
    user_b = ObjectId()
    ensured: list[str] = []

    monkeypatch.setattr(
        file_center_service.user_repo,
        "list_users",
        AsyncMock(
            return_value=[
                {"_id": user_a, "username": "alice", "email": "alice@example.com", "role": "student"},
                {"_id": user_b, "username": "bob", "email": "bob@example.com", "role": "student"},
            ]
        ),
    )
    monkeypatch.setattr(file_center_service.user_repo, "count_users", AsyncMock(return_value=7))
    monkeypatch.setattr(
        file_center_service,
        "ensure_ai_session_image_assets",
        AsyncMock(side_effect=lambda user_id: ensured.append(user_id)),
    )
    monkeypatch.setattr(
        file_center_service.ai_session_repo,
        "count_sessions_by_user_ids",
        AsyncMock(return_value={str(user_a): 3}),
    )
    monkeypatch.setattr(
        file_center_service.file_asset_repo,
        "count_ai_personal_assets_by_user_ids",
        AsyncMock(return_value={str(user_a): 5, str(user_b): 1}),
    )

    result = await file_center_service.list_ai_users(role="student", skip=10, limit=2)

    assert ensured == [str(user_a), str(user_b)]
    assert result == {
        "users": [
            {
                "user_id": str(user_a),
                "username": "alice",
                "email": "alice@example.com",
                "role": "student",
                "session_count": 3,
                "asset_count": 5,
            },
            {
                "user_id": str(user_b),
                "username": "bob",
                "email": "bob@example.com",
                "role": "student",
                "session_count": 0,
                "asset_count": 1,
            },
        ],
        "total": 7,
        "skip": 10,
        "limit": 2,
    }


async def test_list_chat_rooms_pages_before_counting_room_assets(monkeypatch):
    room_a = ObjectId()
    room_b = ObjectId()
    room_docs = [
        {
            "_id": room_a,
            "name": "Room A",
            "type": "group",
            "courseId": "course-a",
            "members": ["u1", "u2"],
            "createdAt": datetime(2026, 6, 2, tzinfo=timezone.utc),
        },
        {
            "_id": room_b,
            "name": "Room B",
            "type": "group",
            "courseId": "course-b",
            "members": ["u1"],
            "createdAt": datetime(2026, 6, 1, tzinfo=timezone.utc),
        },
    ]
    list_group_rooms_page = AsyncMock(return_value=(5, room_docs))
    count_assets = AsyncMock(return_value={str(room_a): 3, str(room_b): 1})

    monkeypatch.setattr(
        file_center_service.chat_room_repo,
        "list_group_rooms_page",
        list_group_rooms_page,
    )
    monkeypatch.setattr(
        file_center_service.file_asset_repo,
        "count_chat_group_assets_by_room_ids",
        count_assets,
    )

    result = await file_center_service.list_chat_rooms(skip=2, limit=2)

    assert list_group_rooms_page.await_args.kwargs == {
        "skip": 2,
        "limit": 2,
        "projection": {"name": 1, "type": 1, "courseId": 1, "members": 1, "createdAt": 1},
    }
    assert count_assets.await_args.args == ([str(room_a), str(room_b)],)
    assert result["rooms"][0]["asset_count"] == 3
    assert result["rooms"][0]["created_at"] == "2026-06-02T00:00:00+00:00"
    assert result["total"] == 5
    assert result["hasMore"] is True
    assert result["nextSkip"] == 4


async def test_list_courses_for_group_batches_existing_room_lookup(monkeypatch):
    course_a = ObjectId()
    course_b = ObjectId()
    room_a = ObjectId()
    fake_sections = _FakeCourseSectionsCollection(
        [
            {"_id": course_a, "courseCode": "CS101", "courseName": "Algorithms"},
            {"_id": course_b, "courseCode": "CS102", "courseName": "Databases"},
        ]
    )
    fake_rooms = _FakeRoomsByCourseCollection(
        [{"_id": room_a, "courseId": str(course_a)}]
    )

    monkeypatch.setattr(room_service.db, "course_sections", fake_sections, raising=False)
    monkeypatch.setattr(room_service.db, "chat_rooms", fake_rooms, raising=False)

    result = await room_service.list_courses_for_group({"id": str(ObjectId()), "role": "admin"})

    assert result == [
        {"id": str(course_a), "name": "Algorithms", "existingRoomId": str(room_a)},
        {"id": str(course_b), "name": "Databases", "existingRoomId": None},
    ]
    assert len(fake_rooms.find_calls) == 1
    room_query, room_projection = fake_rooms.find_calls[0]
    assert room_query == {"courseId": {"$in": [str(course_a), str(course_b)]}, "type": "group"}
    assert room_projection == {"_id": 1, "courseId": 1}
    assert fake_rooms.find_one_calls == []
