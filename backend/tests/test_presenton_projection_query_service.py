from __future__ import annotations

import asyncio
import re
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from backend.services.presenton.presenton_projection_query_service import (
    PRESENTON_CHAT_MESSAGES_COLLECTION,
    PRESENTON_PRESENTATIONS_COLLECTION,
    PRESENTON_PROJECTION_QUERY_SERVICE,
    PRESENTON_SLIDES_COLLECTION,
)


class _FakeCursor:
    def __init__(self, docs):
        self._docs = list(docs)
        self._skip = 0
        self._limit = None

    def sort(self, key, direction=None):
        if isinstance(key, list):
            for field, order in reversed(key):
                reverse = int(order) < 0
                self._docs.sort(key=lambda item: item.get(field), reverse=reverse)
            return self
        reverse = int(direction or 1) < 0
        self._docs.sort(key=lambda item: item.get(key), reverse=reverse)
        return self

    def skip(self, value):
        self._skip = max(0, int(value or 0))
        return self

    def limit(self, value):
        self._limit = max(0, int(value or 0))
        return self

    async def to_list(self, length=None):
        docs = self._docs[self._skip:]
        cap = self._limit if self._limit is not None else length
        if cap is not None:
            docs = docs[:cap]
        return [dict(item) for item in docs]


def _matches_regex(value, pattern: dict) -> bool:
    needle = str(pattern.get("$regex") or "")
    if not needle:
        return False
    haystack = str(value or "")
    return bool(re.search(needle, haystack, re.IGNORECASE))


def _matches_query(doc: dict, query: dict) -> bool:
    for field, expected in query.items():
        if field == "$or":
            if not any(_matches_query(doc, item) for item in expected):
                return False
            continue

        value = doc.get(field)
        if isinstance(expected, dict):
            if "$in" in expected:
                if value not in expected["$in"]:
                    return False
                continue
            if "$regex" in expected:
                if not _matches_regex(value, expected):
                    return False
                continue
        if value != expected:
            return False
    return True


class _FakeCollection:
    def __init__(self, docs):
        self._docs = [dict(item) for item in docs]

    async def count_documents(self, query):
        return len([doc for doc in self._docs if _matches_query(doc, query)])

    async def find_one(self, query):
        for doc in self._docs:
            if _matches_query(doc, query):
                return dict(doc)
        return None

    def find(self, query):
        return _FakeCursor([doc for doc in self._docs if _matches_query(doc, query)])

    async def distinct(self, field, query):
        values = []
        for doc in self._docs:
            if not _matches_query(doc, query):
                continue
            value = doc.get(field)
            if value not in values:
                values.append(value)
        return values


class _FakeDatabase:
    def __init__(self, docs_by_collection):
        self._collections = {
            name: _FakeCollection(items)
            for name, items in docs_by_collection.items()
        }

    def __getitem__(self, name):
        return self._collections[name]


def _build_fake_db():
    now = datetime.now(timezone.utc)
    owner_1 = "user-1"
    owner_2 = "user-2"
    presentation_a = "pres-a"
    presentation_b = "pres-b"
    presentation_c = "pres-c"
    conversation_1 = "conv-1"
    conversation_2 = "conv-2"

    return _FakeDatabase(
        {
            PRESENTON_PRESENTATIONS_COLLECTION: [
                {
                    "_id": ObjectId(),
                    "presentonPresentationId": presentation_a,
                    "ownerUserId": owner_1,
                    "title": "Photosynthesis Basics",
                    "language": "zh",
                    "nSlides": 3,
                    "slideCount": 3,
                    "theme": {"id": "forest"},
                    "filePaths": ["app_data/source-a.md"],
                    "searchText": "Photosynthesis Basics chlorophyll sunlight",
                    "createdAt": now - timedelta(days=2),
                    "updatedAt": now,
                    "syncedAt": now,
                    "syncSource": "presenton_sqlite",
                },
                {
                    "_id": ObjectId(),
                    "presentonPresentationId": presentation_b,
                    "ownerUserId": owner_1,
                    "title": "Heat Transfer",
                    "language": "en",
                    "nSlides": 2,
                    "slideCount": 2,
                    "theme": {"id": "industrial"},
                    "filePaths": [],
                    "searchText": "conduction convection radiation",
                    "createdAt": now - timedelta(days=3),
                    "updatedAt": now - timedelta(hours=3),
                    "syncedAt": now - timedelta(hours=3),
                    "syncSource": "presenton_sqlite",
                },
                {
                    "_id": ObjectId(),
                    "presentonPresentationId": presentation_c,
                    "ownerUserId": owner_2,
                    "title": "Other User Deck",
                    "language": "en",
                    "nSlides": 1,
                    "slideCount": 1,
                    "theme": {"id": "clean"},
                    "filePaths": [],
                    "searchText": "private deck",
                    "createdAt": now - timedelta(days=1),
                    "updatedAt": now - timedelta(minutes=10),
                    "syncedAt": now - timedelta(minutes=10),
                    "syncSource": "presenton_sqlite",
                },
            ],
            PRESENTON_SLIDES_COLLECTION: [
                {
                    "_id": ObjectId(),
                    "presentonPresentationId": presentation_a,
                    "ownerUserId": owner_1,
                    "slideId": "slide-a-1",
                    "index": 0,
                    "content": {"title": "Intro"},
                    "contentText": "chlorophyll and leaves",
                    "speakerNote": "start with the leaf",
                    "searchText": "chlorophyll and leaves start with the leaf",
                    "syncedAt": now,
                    "syncSource": "presenton_sqlite",
                },
                {
                    "_id": ObjectId(),
                    "presentonPresentationId": presentation_a,
                    "ownerUserId": owner_1,
                    "slideId": "slide-a-2",
                    "index": 1,
                    "content": {"title": "Process"},
                    "contentText": "sunlight water glucose",
                    "speakerNote": "connect the arrows",
                    "searchText": "sunlight water glucose connect the arrows",
                    "syncedAt": now,
                    "syncSource": "presenton_sqlite",
                },
                {
                    "_id": ObjectId(),
                    "presentonPresentationId": presentation_b,
                    "ownerUserId": owner_1,
                    "slideId": "slide-b-1",
                    "index": 0,
                    "content": {"title": "Conduction"},
                    "contentText": "metal rod thermodynamics contact",
                    "speakerNote": "heat moves in solids",
                    "searchText": "metal rod thermodynamics contact heat moves in solids",
                    "syncedAt": now,
                    "syncSource": "presenton_sqlite",
                },
                {
                    "_id": ObjectId(),
                    "presentonPresentationId": presentation_c,
                    "ownerUserId": owner_2,
                    "slideId": "slide-c-1",
                    "index": 0,
                    "content": {"title": "Hidden"},
                    "contentText": "should never leak",
                    "speakerNote": "",
                    "searchText": "should never leak",
                    "syncedAt": now,
                    "syncSource": "presenton_sqlite",
                },
            ],
            PRESENTON_CHAT_MESSAGES_COLLECTION: [
                {
                    "_id": ObjectId(),
                    "presentonPresentationId": presentation_a,
                    "ownerUserId": owner_1,
                    "messageId": "msg-1",
                    "conversationId": conversation_1,
                    "position": 1,
                    "role": "user",
                    "content": "Can we simplify slide one?",
                    "createdAt": now - timedelta(minutes=5),
                    "syncedAt": now,
                    "syncSource": "presenton_sqlite",
                },
                {
                    "_id": ObjectId(),
                    "presentonPresentationId": presentation_a,
                    "ownerUserId": owner_1,
                    "messageId": "msg-2",
                    "conversationId": conversation_1,
                    "position": 2,
                    "role": "assistant",
                    "content": "Yes, reduce the bullet count.",
                    "createdAt": now - timedelta(minutes=4),
                    "syncedAt": now,
                    "syncSource": "presenton_sqlite",
                },
                {
                    "_id": ObjectId(),
                    "presentonPresentationId": presentation_a,
                    "ownerUserId": owner_1,
                    "messageId": "msg-3",
                    "conversationId": conversation_2,
                    "position": 1,
                    "role": "user",
                    "content": "Need a stronger ending.",
                    "createdAt": now - timedelta(minutes=2),
                    "syncedAt": now,
                    "syncSource": "presenton_sqlite",
                },
                {
                    "_id": ObjectId(),
                    "presentonPresentationId": presentation_c,
                    "ownerUserId": owner_2,
                    "messageId": "msg-hidden",
                    "conversationId": "conv-hidden",
                    "position": 1,
                    "role": "user",
                    "content": "Private",
                    "createdAt": now - timedelta(minutes=1),
                    "syncedAt": now,
                    "syncSource": "presenton_sqlite",
                },
            ],
        }
    )


def test_list_presentations_filters_by_owner_and_sorts_latest_first(monkeypatch):
    fake_db = _build_fake_db()
    monkeypatch.setattr("backend.services.presenton.presenton_projection_query_service.db", fake_db)

    items, total = asyncio.run(
        PRESENTON_PROJECTION_QUERY_SERVICE.list_presentations(
            owner_user_id="user-1",
            page=1,
            page_size=10,
        )
    )

    assert total == 2
    assert [item["presentonPresentationId"] for item in items] == ["pres-a", "pres-b"]
    assert all(item["ownerUserId"] == "user-1" for item in items)


def test_get_presentation_detail_returns_sorted_slides_and_grouped_chats(monkeypatch):
    fake_db = _build_fake_db()
    monkeypatch.setattr("backend.services.presenton.presenton_projection_query_service.db", fake_db)

    detail = asyncio.run(
        PRESENTON_PROJECTION_QUERY_SERVICE.get_presentation_detail(
            owner_user_id="user-1",
            presentation_id="pres-a",
        )
    )

    assert detail is not None
    assert detail["presentation"]["presentonPresentationId"] == "pres-a"
    assert [slide["index"] for slide in detail["slides"]] == [0, 1]
    assert detail["chatSummary"]["conversationCount"] == 2
    assert detail["chatSummary"]["messageCount"] == 3
    assert detail["chatConversations"][0]["conversationId"] == "conv-2"
    assert detail["chatConversations"][0]["messageCount"] == 1


def test_search_presentations_matches_slide_projection_text(monkeypatch):
    fake_db = _build_fake_db()
    monkeypatch.setattr("backend.services.presenton.presenton_projection_query_service.db", fake_db)

    items, total = asyncio.run(
        PRESENTON_PROJECTION_QUERY_SERVICE.search_presentations(
            owner_user_id="user-1",
            query="thermodynamics",
            page=1,
            page_size=10,
        )
    )

    assert total == 1
    assert items[0]["presentonPresentationId"] == "pres-b"
    assert items[0]["matchedSlidesCount"] == 1
    assert items[0]["matchedSlides"][0]["contentText"] == "metal rod thermodynamics contact"

