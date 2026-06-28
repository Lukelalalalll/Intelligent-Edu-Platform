from __future__ import annotations

from datetime import timezone
from types import SimpleNamespace

from bson import ObjectId

from backend.services.file_assets import lifecycle


class _FakeFindOneCollection:
    def __init__(self, document):
        self.document = document
        self.calls: list[dict] = []

    async def find_one(self, query: dict):
        self.calls.append(query)
        return self.document


class _FakeAISessionCollection:
    def __init__(self, session: dict | None):
        self.session = session
        self.find_one_calls: list[dict] = []
        self.update_one_calls: list[tuple[dict, dict]] = []

    async def find_one(self, query: dict):
        self.find_one_calls.append(query)
        return self.session

    async def update_one(self, query: dict, update: dict):
        self.update_one_calls.append((query, update))
        return SimpleNamespace(modified_count=1)


async def test_check_references_uses_shared_object_id_helper(monkeypatch):
    owner_oid = ObjectId()
    fake_chat_messages = _FakeFindOneCollection({"_id": owner_oid})
    monkeypatch.setattr(lifecycle.db, "chat_messages", fake_chat_messages, raising=False)

    result = await lifecycle.check_references(
        {"owner_type": "chat_message", "owner_id": str(owner_oid)}
    )

    assert result == {"ok_to_delete": False, "reason": "chat_message_reference"}
    assert fake_chat_messages.calls == [{"_id": owner_oid}]


async def test_delete_ai_session_image_updates_messages_with_aware_timestamp(monkeypatch):
    session_oid = ObjectId()
    fake_sessions = _FakeAISessionCollection(
        {
            "_id": session_oid,
            "messages": [
                {"role": "assistant", "images": ["data:image/png;base64,abc", "data:image/png;base64,def"]}
            ],
        }
    )
    monkeypatch.setattr(lifecycle.db, "ai_chat_sessions", fake_sessions, raising=False)

    deleted = await lifecycle._delete_ai_session_image(
        {
            "session_id": str(session_oid),
            "metadata": {"message_index": 0, "image_index": 1},
        }
    )

    assert deleted is True
    assert fake_sessions.find_one_calls == [{"_id": session_oid}]
    assert len(fake_sessions.update_one_calls) == 1
    update_query, update_doc = fake_sessions.update_one_calls[0]
    assert update_query == {"_id": session_oid}
    assert update_doc["$set"]["messages"][0]["images"] == ["data:image/png;base64,abc", ""]
    assert update_doc["$set"]["updatedAt"].tzinfo == timezone.utc
