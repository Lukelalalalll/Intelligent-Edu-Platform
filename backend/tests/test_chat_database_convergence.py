from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from bson import ObjectId

from backend.repositories import ai_session_repo
from backend.repositories import file_asset_repo
from backend.services.chat_service import room_service, session_bucket_service, transfer_dispatch_service
from backend.services.file_assets import lifecycle
from backend.services.file_assets import backfill_ai_chat, queries


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


class _FakeUsersCollection:
    def __init__(self, expected_count: int):
        self.expected_count = expected_count
        self.count_documents_calls: list[dict] = []

    async def count_documents(self, query: dict) -> int:
        self.count_documents_calls.append(query)
        return self.expected_count


class _FakeInsertCollection:
    def __init__(self, inserted_id: ObjectId | None = None):
        self.inserted_id = inserted_id or ObjectId()
        self.insert_one_calls: list[dict] = []

    async def insert_one(self, document: dict):
        self.insert_one_calls.append(document)
        return SimpleNamespace(inserted_id=self.inserted_id)


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
    fake_users = _FakeUsersCollection(expected_count=2)
    fake_rooms = _FakeInsertCollection()
    fake_messages = _FakeInsertCollection()

    monkeypatch.setattr(room_service.db, "users", fake_users, raising=False)
    monkeypatch.setattr(room_service.db, "chat_rooms", fake_rooms, raising=False)
    monkeypatch.setattr(room_service.db, "chat_messages", fake_messages, raising=False)

    room_id = await room_service.create_group_room(
        room_name="Course Group",
        member_ids=member_ids,
        actor_id=actor_id,
        actor_name="teacher",
    )

    assert room_id == str(fake_rooms.inserted_id)
    assert fake_users.count_documents_calls == [{"_id": {"$in": [ObjectId(member_ids[0]), ObjectId(member_ids[1])]}}]
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
