from __future__ import annotations

import uuid
from typing import Any

from pymongo import UpdateOne

from .constants import (
    PRESENTON_CHAT_MESSAGES_COLLECTION,
    PRESENTON_PRESENTATIONS_COLLECTION,
    PRESENTON_SLIDES_COLLECTION,
)
from .runtime_bootstrap import ChatHistoryMessageModel, SlideModel
from .serialization import serialize_chat_message, serialize_presentation, serialize_slide


async def sync_presentation_document(
    mongo_db,
    *,
    presentation,
    slides: list[SlideModel],
    owner_user_id: str,
) -> None:
    presentation_doc = serialize_presentation(
        presentation,
        owner_user_id=owner_user_id,
        slide_count=len(slides),
    )
    await mongo_db[PRESENTON_PRESENTATIONS_COLLECTION].update_one(
        {"presentonPresentationId": str(presentation.id)},
        {"$set": presentation_doc},
        upsert=True,
    )
    await replace_slides(
        mongo_db,
        presentation_id=presentation.id,
        owner_user_id=owner_user_id,
        slides=slides,
    )


async def replace_slides(
    mongo_db,
    *,
    presentation_id: uuid.UUID,
    owner_user_id: str,
    slides: list[SlideModel],
) -> None:
    presentation_key = str(presentation_id)
    collection = mongo_db[PRESENTON_SLIDES_COLLECTION]
    operations = [
        UpdateOne(
            {"presentonPresentationId": presentation_key, "index": int(slide.index)},
            {"$set": serialize_slide(slide, owner_user_id=owner_user_id)},
            upsert=True,
        )
        for slide in slides
    ]
    if operations:
        await collection.bulk_write(operations, ordered=False)

    existing_indexes = [int(slide.index) for slide in slides]
    delete_filter: dict[str, Any] = {"presentonPresentationId": presentation_key}
    if existing_indexes:
        delete_filter["index"] = {"$nin": existing_indexes}
    await collection.delete_many(delete_filter)


async def replace_chat_messages(
    mongo_db,
    *,
    presentation_id: uuid.UUID,
    conversation_id: uuid.UUID,
    owner_user_id: str,
    messages: list[ChatHistoryMessageModel],
) -> None:
    presentation_key = str(presentation_id)
    conversation_key = str(conversation_id)
    collection = mongo_db[PRESENTON_CHAT_MESSAGES_COLLECTION]
    operations = [
        UpdateOne(
            {
                "presentonPresentationId": presentation_key,
                "conversationId": conversation_key,
                "position": int(message.position),
            },
            {"$set": serialize_chat_message(message, owner_user_id=owner_user_id)},
            upsert=True,
        )
        for message in messages
    ]
    if operations:
        await collection.bulk_write(operations, ordered=False)

    existing_positions = [int(message.position) for message in messages]
    delete_filter: dict[str, Any] = {
        "presentonPresentationId": presentation_key,
        "conversationId": conversation_key,
    }
    if existing_positions:
        delete_filter["position"] = {"$nin": existing_positions}
    await collection.delete_many(delete_filter)


async def delete_projection_documents(
    mongo_db,
    *,
    presentation_id: uuid.UUID,
) -> None:
    presentation_key = str(presentation_id)
    await mongo_db[PRESENTON_PRESENTATIONS_COLLECTION].delete_many(
        {"presentonPresentationId": presentation_key}
    )
    await mongo_db[PRESENTON_SLIDES_COLLECTION].delete_many(
        {"presentonPresentationId": presentation_key}
    )
    await mongo_db[PRESENTON_CHAT_MESSAGES_COLLECTION].delete_many(
        {"presentonPresentationId": presentation_key}
    )
