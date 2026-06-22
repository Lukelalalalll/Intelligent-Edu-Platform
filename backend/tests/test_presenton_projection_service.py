from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import types
import uuid
from unittest.mock import AsyncMock

from backend.services.presenton_projection_service import (
    PRESENTON_CHAT_MESSAGES_COLLECTION,
    PRESENTON_MONGO_PROJECTION_SERVICE,
    PRESENTON_PRESENTATIONS_COLLECTION,
    PRESENTON_PROJECTION_REPAIR_JOB_TYPE,
    PRESENTON_SLIDES_COLLECTION,
    _run_presenton_projection_repair_dispatch_job,
)

from models.sql.chat_history_message import ChatHistoryMessageModel
from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel


class _FakeScalarResult:
    def __init__(self, rows):
        self._rows = list(rows)

    def __iter__(self):
        return iter(self._rows)


class _FakeSession:
    def __init__(self, presentation, slides, chat_messages):
        self._presentation = presentation
        self._slides = list(slides)
        self._chat_messages = list(chat_messages)

    async def get(self, model, identifier):
        if model is PresentationModel and identifier == self._presentation.id:
            return self._presentation
        return None

    async def scalars(self, statement):
        text = str(statement)
        if "FROM slides" in text:
            return _FakeScalarResult(sorted(self._slides, key=lambda item: item.index))
        if "FROM chat_history_messages" in text:
            return _FakeScalarResult(
                sorted(self._chat_messages, key=lambda item: item.position)
            )
        raise AssertionError(f"Unexpected scalar query: {text}")


class _FakeCollection:
    def __init__(self):
        self.docs = {}
        self.bulk_write_calls = []
        self.delete_many_calls = []
        self.update_one_calls = []
        self.raise_on_update = False

    async def update_one(self, filter_doc, update_doc, upsert=False):
        self.update_one_calls.append((filter_doc, update_doc, upsert))
        if self.raise_on_update:
            raise RuntimeError("mongo down")
        key = tuple(sorted(filter_doc.items()))
        self.docs[key] = dict(update_doc.get("$set") or {})

    async def bulk_write(self, operations, ordered=False):
        self.bulk_write_calls.append((operations, ordered))
        for operation in operations:
            spec = getattr(operation, "_filter")
            payload = getattr(operation, "_doc")["$set"]
            key = tuple(sorted(spec.items()))
            self.docs[key] = dict(payload)

    async def delete_many(self, filter_doc):
        self.delete_many_calls.append(filter_doc)
        for key, value in list(self.docs.items()):
            doc = value
            matches = True
            for field, expected in filter_doc.items():
                if isinstance(expected, dict) and "$nin" in expected:
                    if doc.get(field) in expected["$nin"]:
                        matches = False
                        break
                    continue
                if doc.get(field) != expected:
                    matches = False
                    break
            if matches:
                self.docs.pop(key, None)


class _FakeDatabase:
    def __init__(self):
        self._collections = {
            PRESENTON_PRESENTATIONS_COLLECTION: _FakeCollection(),
            PRESENTON_SLIDES_COLLECTION: _FakeCollection(),
            PRESENTON_CHAT_MESSAGES_COLLECTION: _FakeCollection(),
        }

    def __getitem__(self, name):
        return self._collections[name]


def _build_presentation() -> PresentationModel:
    now = datetime.now(timezone.utc)
    return PresentationModel(
        id=uuid.uuid4(),
        content="Deck source",
        n_slides=2,
        language="zh",
        title="Deck",
        file_paths=["D:/tmp/source.md"],
        outlines={"slides": [{"title": "Intro"}]},
        created_at=now,
        updated_at=now,
        layout={"name": "demo"},
        structure={"slides": [0, 1]},
        instructions="Be concise",
        tone="default",
        verbosity="standard",
        include_table_of_contents=False,
        include_title_slide=True,
        web_search=False,
        theme={"id": "professional-blue"},
    )


def _build_slide(presentation_id: uuid.UUID, index: int) -> SlideModel:
    return SlideModel(
        id=uuid.uuid4(),
        presentation=presentation_id,
        layout_group="demo",
        layout="layout-a",
        index=index,
        content={"title": f"Slide {index + 1}"},
        html_content=None,
        speaker_note=f"note-{index}",
        properties={"variant": "default"},
    )


def _build_message(
    presentation_id: uuid.UUID, conversation_id: uuid.UUID, position: int, role: str
) -> ChatHistoryMessageModel:
    return ChatHistoryMessageModel(
        id=uuid.uuid4(),
        presentation_id=presentation_id,
        conversation_id=conversation_id,
        position=position,
        role=role,
        content=f"{role}-{position}",
        created_at=datetime.now(timezone.utc),
        tool_calls=["saveSlide"] if role == "assistant" else None,
    )


def test_sync_presentation_bundle_upserts_and_prunes_slides(monkeypatch):
    fake_db = _FakeDatabase()
    monkeypatch.setattr("backend.services.presenton_projection_service.db", fake_db)

    presentation = _build_presentation()
    slides = [_build_slide(presentation.id, 0), _build_slide(presentation.id, 1)]
    session = _FakeSession(presentation, slides, [])

    result = asyncio.run(
        PRESENTON_MONGO_PROJECTION_SERVICE.sync_presentation_bundle(
            session,
            presentation_id=presentation.id,
            owner_user_id="user-1",
        )
    )

    assert result["slidesCount"] == 2
    presentations = fake_db[PRESENTON_PRESENTATIONS_COLLECTION]
    slides_collection = fake_db[PRESENTON_SLIDES_COLLECTION]
    assert len(presentations.docs) == 1
    assert len(slides_collection.docs) == 2
    synced_presentation = next(iter(presentations.docs.values()))
    assert synced_presentation["presentonPresentationId"] == str(presentation.id)
    assert synced_presentation["ownerUserId"] == "user-1"
    assert synced_presentation["slideCount"] == 2
    assert slides_collection.delete_many_calls[-1]["index"] == {"$nin": [0, 1]}


def test_sync_chat_conversation_uses_compound_projection_key(monkeypatch):
    fake_db = _FakeDatabase()
    monkeypatch.setattr("backend.services.presenton_projection_service.db", fake_db)

    presentation = _build_presentation()
    conversation_id = uuid.uuid4()
    messages = [
        _build_message(presentation.id, conversation_id, 1, "user"),
        _build_message(presentation.id, conversation_id, 2, "assistant"),
    ]
    session = _FakeSession(presentation, [], messages)

    result = asyncio.run(
        PRESENTON_MONGO_PROJECTION_SERVICE.sync_chat_conversation(
            session,
            presentation_id=presentation.id,
            conversation_id=conversation_id,
            owner_user_id="user-2",
        )
    )

    assert result["messagesCount"] == 2
    chat_collection = fake_db[PRESENTON_CHAT_MESSAGES_COLLECTION]
    assert len(chat_collection.docs) == 2
    first_message = next(iter(chat_collection.docs.values()))
    assert first_message["conversationId"] == str(conversation_id)
    assert first_message["ownerUserId"] == "user-2"


def test_sync_presentation_bundle_is_idempotent_for_slide_replacement(monkeypatch):
    fake_db = _FakeDatabase()
    monkeypatch.setattr("backend.services.presenton_projection_service.db", fake_db)

    presentation = _build_presentation()
    first_session = _FakeSession(
        presentation,
        [_build_slide(presentation.id, 0), _build_slide(presentation.id, 1)],
        [],
    )
    asyncio.run(
        PRESENTON_MONGO_PROJECTION_SERVICE.sync_presentation_bundle(
            first_session,
            presentation_id=presentation.id,
            owner_user_id="user-4",
        )
    )

    second_session = _FakeSession(
        presentation,
        [_build_slide(presentation.id, 0)],
        [],
    )
    asyncio.run(
        PRESENTON_MONGO_PROJECTION_SERVICE.sync_presentation_bundle(
            second_session,
            presentation_id=presentation.id,
            owner_user_id="user-4",
        )
    )

    slides_collection = fake_db[PRESENTON_SLIDES_COLLECTION]
    assert len(slides_collection.docs) == 1
    remaining_slide = next(iter(slides_collection.docs.values()))
    assert remaining_slide["index"] == 0


def test_safe_sync_enqueue_repair_job_on_mongo_failure(monkeypatch):
    fake_db = _FakeDatabase()
    fake_db[PRESENTON_PRESENTATIONS_COLLECTION].raise_on_update = True
    monkeypatch.setattr("backend.services.presenton_projection_service.db", fake_db)

    enqueued = []
    spawned = []

    async def _fake_enqueue(**kwargs):
        kwargs = dict(kwargs)
        kwargs["job_id"] = "dispatch-job-1"
        enqueued.append(kwargs)
        return kwargs

    def _fake_spawn(coro, *, label):
        spawned.append(label)
        coro.close()
        return None

    monkeypatch.setattr(
        "backend.services.presenton_projection_service.background_job_dispatcher",
        types.SimpleNamespace(
            enqueue=_fake_enqueue,
            claim=AsyncMock(return_value=None),
            mark_done=AsyncMock(),
            mark_failed=AsyncMock(),
        ),
    )
    monkeypatch.setattr(
        "backend.services.presenton_projection_service.spawn_background_coro",
        _fake_spawn,
    )

    presentation = _build_presentation()
    session = _FakeSession(presentation, [], [])

    result = asyncio.run(
        PRESENTON_MONGO_PROJECTION_SERVICE.safe_sync_presentation_bundle(
            session,
            presentation_id=presentation.id,
            owner_user_id="user-3",
            reason="unit_test",
        )
    )

    assert result is None
    assert len(enqueued) == 1
    job = enqueued[0]
    assert job["job_type"] == PRESENTON_PROJECTION_REPAIR_JOB_TYPE
    assert job["payload"]["presentationId"] == str(presentation.id)
    assert job["payload"]["ownerUserId"] == "user-3"
    assert spawned == ["presenton-projection-repair:dispatch-job-1"]


def test_repair_dispatch_job_marks_done_after_success(monkeypatch):
    claimed = {
        "job_id": "dispatch-job-2",
        "payload": {
            "kind": "presentation_bundle",
            "presentationId": str(uuid.uuid4()),
            "conversationId": "",
            "ownerUserId": "user-5",
            "reason": "repair-test",
        },
    }
    mark_done = AsyncMock()
    mark_failed = AsyncMock()

    monkeypatch.setattr(
        "backend.services.presenton_projection_service.background_job_dispatcher",
        types.SimpleNamespace(
            claim=AsyncMock(return_value=claimed),
            mark_done=mark_done,
            mark_failed=mark_failed,
        ),
    )
    monkeypatch.setattr(
        "backend.services.presenton_projection_service._replay_presenton_projection_payload",
        AsyncMock(return_value={"status": "done"}),
    )

    asyncio.run(_run_presenton_projection_repair_dispatch_job("dispatch-job-2"))

    assert mark_done.await_count == 1
    assert mark_failed.await_count == 0


def test_repair_dispatch_job_marks_failed_after_replay_error(monkeypatch):
    claimed = {
        "job_id": "dispatch-job-3",
        "payload": {
            "kind": "chat_conversation",
            "presentationId": str(uuid.uuid4()),
            "conversationId": str(uuid.uuid4()),
            "ownerUserId": "user-6",
            "reason": "repair-test",
        },
    }
    mark_done = AsyncMock()
    mark_failed = AsyncMock()

    monkeypatch.setattr(
        "backend.services.presenton_projection_service.background_job_dispatcher",
        types.SimpleNamespace(
            claim=AsyncMock(return_value=claimed),
            mark_done=mark_done,
            mark_failed=mark_failed,
        ),
    )
    monkeypatch.setattr(
        "backend.services.presenton_projection_service._replay_presenton_projection_payload",
        AsyncMock(side_effect=RuntimeError("boom")),
    )

    asyncio.run(_run_presenton_projection_repair_dispatch_job("dispatch-job-3"))

    assert mark_done.await_count == 0
    assert mark_failed.await_count == 1
