from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from bson import ObjectId

from backend.core.database import db

PRESENTON_PRESENTATIONS_COLLECTION = "presenton_presentations"
PRESENTON_SLIDES_COLLECTION = "presenton_slides"
PRESENTON_CHAT_MESSAGES_COLLECTION = "presenton_chat_messages"


def _serialize_value(value: Any) -> Any:
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): _serialize_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_serialize_value(item) for item in value]
    return value


def _normalize_owner_user_id(owner_user_id: str) -> str:
    return str(owner_user_id or "").strip()


def _normalize_search_query(query: str) -> str:
    return " ".join(str(query or "").split()).strip()


def _regex_filter(query: str) -> dict[str, str]:
    return {"$regex": re.escape(query), "$options": "i"}


def _serialize_presentation_summary(doc: dict[str, Any]) -> dict[str, Any]:
    payload = _serialize_value(dict(doc))
    payload.pop("_id", None)
    return {
        "presentonPresentationId": payload.get("presentonPresentationId", ""),
        "ownerUserId": payload.get("ownerUserId", ""),
        "title": payload.get("title", ""),
        "language": payload.get("language", ""),
        "nSlides": int(payload.get("nSlides") or 0),
        "slideCount": int(payload.get("slideCount") or 0),
        "theme": payload.get("theme"),
        "filePaths": payload.get("filePaths") or [],
        "createdAt": payload.get("createdAt"),
        "updatedAt": payload.get("updatedAt"),
        "syncedAt": payload.get("syncedAt"),
        "syncSource": payload.get("syncSource"),
    }


def _serialize_presentation_detail(doc: dict[str, Any]) -> dict[str, Any]:
    payload = _serialize_value(dict(doc))
    payload.pop("_id", None)
    payload.pop("searchText", None)
    return payload


def _serialize_slide_detail(doc: dict[str, Any]) -> dict[str, Any]:
    payload = _serialize_value(dict(doc))
    payload.pop("_id", None)
    payload.pop("searchText", None)
    return payload


def _serialize_chat_detail(doc: dict[str, Any]) -> dict[str, Any]:
    payload = _serialize_value(dict(doc))
    payload.pop("_id", None)
    return payload


def _build_slide_match_preview(slides: list[dict[str, Any]]) -> list[dict[str, Any]]:
    previews: list[dict[str, Any]] = []
    for slide in slides:
        previews.append(
            {
                "index": int(slide.get("index") or 0),
                "contentText": str(slide.get("contentText") or ""),
                "speakerNote": str(slide.get("speakerNote") or ""),
            }
        )
    return previews


class PresentonProjectionQueryService:
    async def list_presentations(
        self,
        *,
        owner_user_id: str,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[dict[str, Any]], int]:
        owner_id = _normalize_owner_user_id(owner_user_id)
        skip = max(0, (page - 1) * page_size)
        query = {"ownerUserId": owner_id}

        total = await db[PRESENTON_PRESENTATIONS_COLLECTION].count_documents(query)
        docs = await (
            db[PRESENTON_PRESENTATIONS_COLLECTION]
            .find(query)
            .sort("updatedAt", -1)
            .skip(skip)
            .limit(page_size)
            .to_list(length=page_size)
        )
        return [_serialize_presentation_summary(doc) for doc in docs], int(total)

    async def get_presentation_detail(
        self,
        *,
        owner_user_id: str,
        presentation_id: str,
    ) -> dict[str, Any] | None:
        owner_id = _normalize_owner_user_id(owner_user_id)
        presentation_key = str(presentation_id or "").strip()
        if not owner_id or not presentation_key:
            return None

        presentation = await db[PRESENTON_PRESENTATIONS_COLLECTION].find_one(
            {
                "ownerUserId": owner_id,
                "presentonPresentationId": presentation_key,
            }
        )
        if not presentation:
            return None

        slides = await (
            db[PRESENTON_SLIDES_COLLECTION]
            .find(
                {
                    "ownerUserId": owner_id,
                    "presentonPresentationId": presentation_key,
                }
            )
            .sort("index", 1)
            .to_list(length=500)
        )
        messages = await (
            db[PRESENTON_CHAT_MESSAGES_COLLECTION]
            .find(
                {
                    "ownerUserId": owner_id,
                    "presentonPresentationId": presentation_key,
                }
            )
            .sort([("conversationId", 1), ("position", 1)])
            .to_list(length=5000)
        )

        conversations_by_id: dict[str, dict[str, Any]] = {}
        for message in messages:
            serialized = _serialize_chat_detail(message)
            conversation_id = str(serialized.get("conversationId") or "")
            bucket = conversations_by_id.setdefault(
                conversation_id,
                {
                    "conversationId": conversation_id,
                    "messageCount": 0,
                    "createdAt": serialized.get("createdAt"),
                    "lastMessageAt": serialized.get("createdAt"),
                    "messages": [],
                },
            )
            bucket["messages"].append(serialized)
            bucket["messageCount"] += 1
            bucket["lastMessageAt"] = serialized.get("createdAt")

        conversations = list(conversations_by_id.values())
        conversations.sort(key=lambda item: str(item.get("lastMessageAt") or ""), reverse=True)

        return {
            "presentation": _serialize_presentation_detail(presentation),
            "slides": [_serialize_slide_detail(doc) for doc in slides],
            "chatConversations": conversations,
            "chatSummary": {
                "conversationCount": len(conversations),
                "messageCount": len(messages),
            },
        }

    async def search_presentations(
        self,
        *,
        owner_user_id: str,
        query: str,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[dict[str, Any]], int]:
        owner_id = _normalize_owner_user_id(owner_user_id)
        normalized_query = _normalize_search_query(query)
        if not normalized_query:
            return await self.list_presentations(
                owner_user_id=owner_id,
                page=page,
                page_size=page_size,
            )

        regex = _regex_filter(normalized_query)
        presentation_query = {
            "ownerUserId": owner_id,
            "$or": [
                {"title": regex},
                {"searchText": regex},
            ],
        }
        slide_query = {
            "ownerUserId": owner_id,
            "searchText": regex,
        }

        presentation_ids = await db[PRESENTON_PRESENTATIONS_COLLECTION].distinct(
            "presentonPresentationId",
            presentation_query,
        )
        slide_ids = await db[PRESENTON_SLIDES_COLLECTION].distinct(
            "presentonPresentationId",
            slide_query,
        )

        ordered_ids: list[str] = []
        for candidate in [*presentation_ids, *slide_ids]:
            candidate_id = str(candidate or "").strip()
            if candidate_id and candidate_id not in ordered_ids:
                ordered_ids.append(candidate_id)

        if not ordered_ids:
            return [], 0

        docs = await (
            db[PRESENTON_PRESENTATIONS_COLLECTION]
            .find(
                {
                    "ownerUserId": owner_id,
                    "presentonPresentationId": {"$in": ordered_ids},
                }
            )
            .sort("updatedAt", -1)
            .to_list(length=max(page_size * 5, 100))
        )
        docs_by_id = {
            str(doc.get("presentonPresentationId") or ""): doc
            for doc in docs
        }

        slide_matches = await (
            db[PRESENTON_SLIDES_COLLECTION]
            .find(
                {
                    "ownerUserId": owner_id,
                    "presentonPresentationId": {"$in": ordered_ids},
                    "searchText": regex,
                }
            )
            .sort([("presentonPresentationId", 1), ("index", 1)])
            .to_list(length=500)
        )
        slide_matches_by_presentation: dict[str, list[dict[str, Any]]] = {}
        for doc in slide_matches:
            presentation_id = str(doc.get("presentonPresentationId") or "")
            slide_matches_by_presentation.setdefault(presentation_id, []).append(doc)

        ordered_docs = [
            docs_by_id[presentation_id]
            for presentation_id in ordered_ids
            if presentation_id in docs_by_id
        ]
        ordered_docs.sort(
            key=lambda item: str(_serialize_value(item.get("updatedAt")) or ""),
            reverse=True,
        )

        total = len(ordered_docs)
        skip = max(0, (page - 1) * page_size)
        page_docs = ordered_docs[skip:skip + page_size]

        items: list[dict[str, Any]] = []
        for doc in page_docs:
            presentation_id = str(doc.get("presentonPresentationId") or "")
            summary = _serialize_presentation_summary(doc)
            matched_slides = _build_slide_match_preview(
                slide_matches_by_presentation.get(presentation_id, [])
            )
            summary["matchedSlides"] = matched_slides
            summary["matchedSlidesCount"] = len(matched_slides)
            items.append(summary)
        return items, total


PRESENTON_PROJECTION_QUERY_SERVICE = PresentonProjectionQueryService()
