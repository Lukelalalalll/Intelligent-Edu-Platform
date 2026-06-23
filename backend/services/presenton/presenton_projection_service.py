from __future__ import annotations

import asyncio
import logging
import sys
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pymongo import UpdateOne
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from backend.core.database import db
from backend.presenton_runtime_context import get_presenton_owner_user_id
from backend.services.background_job_dispatcher import background_job_dispatcher
from backend.services.background_job_runtime import spawn_background_coro


def _ensure_presenton_runtime_path() -> None:
    runtime_root = Path(__file__).resolve().parents[2] / "presenton_runtime"
    runtime_root_str = str(runtime_root)
    if runtime_root_str not in sys.path:
        sys.path.insert(0, runtime_root_str)


_ensure_presenton_runtime_path()

from models.sql.chat_history_message import ChatHistoryMessageModel  # noqa: E402
from models.sql.presentation import PresentationModel  # noqa: E402
from models.sql.slide import SlideModel  # noqa: E402


LOGGER = logging.getLogger(__name__)

PRESENTON_PRESENTATIONS_COLLECTION = "presenton_presentations"
PRESENTON_SLIDES_COLLECTION = "presenton_slides"
PRESENTON_CHAT_MESSAGES_COLLECTION = "presenton_chat_messages"
PRESENTON_PROJECTION_REPAIR_JOB_TYPE = "presenton_projection_repair"
PRESENTON_PROJECTION_REPAIR_MAX_ATTEMPTS = 3
PRESENTON_PROJECTION_REPAIR_RETRY_DELAY_SECONDS = 5
PRESENTON_PROJECTION_REPAIR_LEASE_SECONDS = 180


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_owner_user_id(owner_user_id: str | None) -> str:
    explicit = str(owner_user_id or "").strip()
    if explicit:
        return explicit
    return get_presenton_owner_user_id()


def _normalize_value(value: Any) -> Any:
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, datetime):
        return value
    if isinstance(value, dict):
        return {
            str(key): _normalize_value(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_normalize_value(item) for item in value]
    if isinstance(value, tuple):
        return [_normalize_value(item) for item in value]
    return value


def _flatten_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return " ".join(
            fragment
            for fragment in (_flatten_text(item) for item in value.values())
            if fragment
        )
    if isinstance(value, (list, tuple, set)):
        return " ".join(
            fragment
            for fragment in (_flatten_text(item) for item in value)
            if fragment
        )
    return str(value)


def _require_owner_user_id(owner_user_id: str | None) -> str:
    resolved = _normalize_owner_user_id(owner_user_id)
    if resolved:
        return resolved
    raise ValueError("Presenton projection requires a non-empty owner user id.")


def _get_async_session_maker():
    from services.database import async_session_maker  # type: ignore[import-not-found]

    return async_session_maker


def _serialize_presentation(
    presentation: PresentationModel,
    *,
    owner_user_id: str,
    slide_count: int,
) -> dict[str, Any]:
    search_text = " ".join(
        fragment
        for fragment in [
            _flatten_text(presentation.title),
            _flatten_text(presentation.content),
            _flatten_text(presentation.outlines),
            _flatten_text(presentation.structure),
            _flatten_text(presentation.instructions),
        ]
        if fragment
    ).strip()
    return {
        "presentonPresentationId": str(presentation.id),
        "ownerUserId": owner_user_id,
        "content": presentation.content,
        "nSlides": int(presentation.n_slides),
        "slideCount": int(slide_count),
        "language": presentation.language,
        "title": presentation.title,
        "filePaths": _normalize_value(presentation.file_paths or []),
        "outlines": _normalize_value(presentation.outlines),
        "layout": _normalize_value(presentation.layout),
        "structure": _normalize_value(presentation.structure),
        "instructions": presentation.instructions,
        "tone": presentation.tone,
        "verbosity": presentation.verbosity,
        "includeTableOfContents": bool(presentation.include_table_of_contents),
        "includeTitleSlide": bool(presentation.include_title_slide),
        "webSearch": bool(presentation.web_search),
        "theme": _normalize_value(presentation.theme),
        "searchText": search_text,
        "createdAt": presentation.created_at,
        "updatedAt": presentation.updated_at,
        "syncedAt": _utcnow(),
        "syncSource": "presenton_sqlite",
    }


def _serialize_slide(
    slide: SlideModel,
    *,
    owner_user_id: str,
) -> dict[str, Any]:
    content_text = _flatten_text(slide.content).strip()
    search_text = " ".join(
        fragment
        for fragment in [
            content_text,
            _flatten_text(slide.html_content),
            _flatten_text(slide.speaker_note),
        ]
        if fragment
    ).strip()
    return {
        "presentonPresentationId": str(slide.presentation),
        "ownerUserId": owner_user_id,
        "slideId": str(slide.id),
        "layoutGroup": slide.layout_group,
        "layout": slide.layout,
        "index": int(slide.index),
        "content": _normalize_value(slide.content),
        "contentText": content_text,
        "htmlContent": slide.html_content,
        "speakerNote": slide.speaker_note,
        "properties": _normalize_value(slide.properties),
        "searchText": search_text,
        "syncedAt": _utcnow(),
        "syncSource": "presenton_sqlite",
    }


def _serialize_chat_message(
    message: ChatHistoryMessageModel,
    *,
    owner_user_id: str,
) -> dict[str, Any]:
    return {
        "presentonPresentationId": str(message.presentation_id),
        "ownerUserId": owner_user_id,
        "messageId": str(message.id),
        "conversationId": str(message.conversation_id),
        "position": int(message.position),
        "role": message.role,
        "content": message.content,
        "toolCalls": _normalize_value(message.tool_calls or []),
        "createdAt": message.created_at,
        "syncedAt": _utcnow(),
        "syncSource": "presenton_sqlite",
    }


@dataclass(frozen=True)
class PresentonProjectionBundle:
    presentation: PresentationModel
    slides: list[SlideModel]


class PresentonMongoProjectionService:
    async def load_presentation_bundle(
        self,
        sql_session: AsyncSession,
        *,
        presentation_id: uuid.UUID,
    ) -> PresentonProjectionBundle:
        presentation = await sql_session.get(PresentationModel, presentation_id)
        if not presentation:
            raise ValueError(f"Presentation not found: {presentation_id}")

        slides_result = await sql_session.scalars(
            select(SlideModel)
            .where(SlideModel.presentation == presentation_id)
            .order_by(SlideModel.index.asc())
        )
        return PresentonProjectionBundle(
            presentation=presentation,
            slides=list(slides_result),
        )

    async def load_chat_messages(
        self,
        sql_session: AsyncSession,
        *,
        presentation_id: uuid.UUID,
        conversation_id: uuid.UUID,
    ) -> list[ChatHistoryMessageModel]:
        rows = await sql_session.scalars(
            select(ChatHistoryMessageModel)
            .where(
                ChatHistoryMessageModel.presentation_id == presentation_id,
                ChatHistoryMessageModel.conversation_id == conversation_id,
            )
            .order_by(ChatHistoryMessageModel.position.asc())
        )
        return list(rows)

    async def sync_presentation_bundle(
        self,
        sql_session: AsyncSession,
        *,
        presentation_id: uuid.UUID,
        owner_user_id: str | None = None,
    ) -> dict[str, Any]:
        owner = _require_owner_user_id(owner_user_id)
        bundle = await self.load_presentation_bundle(
            sql_session,
            presentation_id=presentation_id,
        )

        presentation_doc = _serialize_presentation(
            bundle.presentation,
            owner_user_id=owner,
            slide_count=len(bundle.slides),
        )
        await db[PRESENTON_PRESENTATIONS_COLLECTION].update_one(
            {"presentonPresentationId": str(bundle.presentation.id)},
            {"$set": presentation_doc},
            upsert=True,
        )
        await self._replace_slides(
            presentation_id=bundle.presentation.id,
            owner_user_id=owner,
            slides=bundle.slides,
        )
        return {
            "presentationId": str(bundle.presentation.id),
            "slidesCount": len(bundle.slides),
            "ownerUserId": owner,
        }

    async def sync_chat_conversation(
        self,
        sql_session: AsyncSession,
        *,
        presentation_id: uuid.UUID,
        conversation_id: uuid.UUID,
        owner_user_id: str | None = None,
    ) -> dict[str, Any]:
        owner = _require_owner_user_id(owner_user_id)
        messages = await self.load_chat_messages(
            sql_session,
            presentation_id=presentation_id,
            conversation_id=conversation_id,
        )
        await self._replace_chat_messages(
            presentation_id=presentation_id,
            conversation_id=conversation_id,
            owner_user_id=owner,
            messages=messages,
        )
        return {
            "presentationId": str(presentation_id),
            "conversationId": str(conversation_id),
            "messagesCount": len(messages),
            "ownerUserId": owner,
        }

    async def delete_projection(
        self,
        *,
        presentation_id: uuid.UUID,
        owner_user_id: str | None = None,
    ) -> None:
        _require_owner_user_id(owner_user_id)
        presentation_key = str(presentation_id)
        await db[PRESENTON_PRESENTATIONS_COLLECTION].delete_many(
            {"presentonPresentationId": presentation_key}
        )
        await db[PRESENTON_SLIDES_COLLECTION].delete_many(
            {"presentonPresentationId": presentation_key}
        )
        await db[PRESENTON_CHAT_MESSAGES_COLLECTION].delete_many(
            {"presentonPresentationId": presentation_key}
        )

    async def safe_sync_presentation_bundle(
        self,
        sql_session: AsyncSession,
        *,
        presentation_id: uuid.UUID,
        owner_user_id: str | None = None,
        reason: str,
    ) -> dict[str, Any] | None:
        try:
            return await self.sync_presentation_bundle(
                sql_session,
                presentation_id=presentation_id,
                owner_user_id=owner_user_id,
            )
        except Exception as exc:  # noqa: BLE001
            await self._enqueue_repair_job(
                kind="presentation_bundle",
                presentation_id=presentation_id,
                conversation_id=None,
                owner_user_id=_normalize_owner_user_id(owner_user_id),
                reason=reason,
                error=str(exc),
            )
            LOGGER.exception(
                "Presenton projection sync failed (presentation_id=%s, reason=%s)",
                presentation_id,
                reason,
            )
            return None

    async def safe_sync_chat_conversation(
        self,
        sql_session: AsyncSession,
        *,
        presentation_id: uuid.UUID,
        conversation_id: uuid.UUID,
        owner_user_id: str | None = None,
        reason: str,
    ) -> dict[str, Any] | None:
        try:
            return await self.sync_chat_conversation(
                sql_session,
                presentation_id=presentation_id,
                conversation_id=conversation_id,
                owner_user_id=owner_user_id,
            )
        except Exception as exc:  # noqa: BLE001
            await self._enqueue_repair_job(
                kind="chat_conversation",
                presentation_id=presentation_id,
                conversation_id=conversation_id,
                owner_user_id=_normalize_owner_user_id(owner_user_id),
                reason=reason,
                error=str(exc),
            )
            LOGGER.exception(
                "Presenton chat projection sync failed (presentation_id=%s, conversation_id=%s, reason=%s)",
                presentation_id,
                conversation_id,
                reason,
            )
            return None

    async def safe_delete_projection(
        self,
        *,
        presentation_id: uuid.UUID,
        owner_user_id: str | None = None,
        reason: str,
    ) -> None:
        try:
            await self.delete_projection(
                presentation_id=presentation_id,
                owner_user_id=owner_user_id,
            )
        except Exception as exc:  # noqa: BLE001
            await self._enqueue_repair_job(
                kind="delete_projection",
                presentation_id=presentation_id,
                conversation_id=None,
                owner_user_id=_normalize_owner_user_id(owner_user_id),
                reason=reason,
                error=str(exc),
            )
            LOGGER.exception(
                "Presenton projection delete failed (presentation_id=%s, reason=%s)",
                presentation_id,
                reason,
            )

    async def _replace_slides(
        self,
        *,
        presentation_id: uuid.UUID,
        owner_user_id: str,
        slides: list[SlideModel],
    ) -> None:
        presentation_key = str(presentation_id)
        collection = db[PRESENTON_SLIDES_COLLECTION]
        operations = [
            UpdateOne(
                {
                    "presentonPresentationId": presentation_key,
                    "index": int(slide.index),
                },
                {"$set": _serialize_slide(slide, owner_user_id=owner_user_id)},
                upsert=True,
            )
            for slide in slides
        ]
        if operations:
            await collection.bulk_write(operations, ordered=False)

        existing_indexes = [int(slide.index) for slide in slides]
        delete_filter: dict[str, Any] = {
            "presentonPresentationId": presentation_key,
        }
        if existing_indexes:
            delete_filter["index"] = {"$nin": existing_indexes}
        await collection.delete_many(delete_filter)

    async def _replace_chat_messages(
        self,
        *,
        presentation_id: uuid.UUID,
        conversation_id: uuid.UUID,
        owner_user_id: str,
        messages: list[ChatHistoryMessageModel],
    ) -> None:
        presentation_key = str(presentation_id)
        conversation_key = str(conversation_id)
        collection = db[PRESENTON_CHAT_MESSAGES_COLLECTION]
        operations = [
            UpdateOne(
                {
                    "presentonPresentationId": presentation_key,
                    "conversationId": conversation_key,
                    "position": int(message.position),
                },
                {"$set": _serialize_chat_message(message, owner_user_id=owner_user_id)},
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

    async def _enqueue_repair_job(
        self,
        *,
        kind: str,
        presentation_id: uuid.UUID,
        conversation_id: uuid.UUID | None,
        owner_user_id: str,
        reason: str,
        error: str,
    ) -> None:
        if not owner_user_id:
            LOGGER.warning(
                "Skipping presenton repair job because owner user id is missing (presentation_id=%s, reason=%s)",
                presentation_id,
                reason,
            )
            return

        dispatch_job = await background_job_dispatcher.enqueue(
            job_type=PRESENTON_PROJECTION_REPAIR_JOB_TYPE,
            queue="presenton",
            payload={
                "kind": kind,
                "presentationId": str(presentation_id),
                "conversationId": str(conversation_id) if conversation_id else "",
                "ownerUserId": owner_user_id,
                "reason": reason,
            },
            metadata={
                "source": "presenton_projection_service",
                "error": error,
            },
        )
        spawn_background_coro(
            _run_presenton_projection_repair_dispatch_job(dispatch_job["job_id"]),
            label=f"presenton-projection-repair:{dispatch_job['job_id']}",
        )


PRESENTON_MONGO_PROJECTION_SERVICE = PresentonMongoProjectionService()


def _parse_required_uuid(raw_value: str, *, label: str) -> uuid.UUID:
    value = str(raw_value or "").strip()
    if not value:
        raise ValueError(f"Missing required {label}.")
    return uuid.UUID(value)


def _parse_optional_uuid(raw_value: str | None) -> uuid.UUID | None:
    value = str(raw_value or "").strip()
    if not value:
        return None
    return uuid.UUID(value)


async def _replay_presenton_projection_payload(
    payload: dict[str, Any]
) -> dict[str, Any]:
    kind = str(payload.get("kind") or "").strip()
    owner_user_id = _require_owner_user_id(str(payload.get("ownerUserId") or ""))
    presentation_id = _parse_required_uuid(
        str(payload.get("presentationId") or ""),
        label="presentationId",
    )
    conversation_id = _parse_optional_uuid(payload.get("conversationId"))

    last_error: BaseException | None = None
    for attempt in range(1, PRESENTON_PROJECTION_REPAIR_MAX_ATTEMPTS + 1):
        try:
            if kind == "delete_projection":
                await PRESENTON_MONGO_PROJECTION_SERVICE.delete_projection(
                    presentation_id=presentation_id,
                    owner_user_id=owner_user_id,
                )
                return {
                    "kind": kind,
                    "presentationId": str(presentation_id),
                    "ownerUserId": owner_user_id,
                    "attempt": attempt,
                    "deleted": True,
                }

            async_session_maker = _get_async_session_maker()
            async with async_session_maker() as sql_session:
                if kind == "presentation_bundle":
                    result = await PRESENTON_MONGO_PROJECTION_SERVICE.sync_presentation_bundle(
                        sql_session,
                        presentation_id=presentation_id,
                        owner_user_id=owner_user_id,
                    )
                elif kind == "chat_conversation":
                    if conversation_id is None:
                        raise ValueError(
                            "conversationId is required for chat_conversation repair."
                        )
                    result = await PRESENTON_MONGO_PROJECTION_SERVICE.sync_chat_conversation(
                        sql_session,
                        presentation_id=presentation_id,
                        conversation_id=conversation_id,
                        owner_user_id=owner_user_id,
                    )
                else:
                    raise ValueError(f"Unsupported presenton repair kind: {kind}")

            result["attempt"] = attempt
            result["kind"] = kind
            return result
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if attempt >= PRESENTON_PROJECTION_REPAIR_MAX_ATTEMPTS:
                break
            await asyncio.sleep(PRESENTON_PROJECTION_REPAIR_RETRY_DELAY_SECONDS * attempt)

    assert last_error is not None
    raise last_error


async def _run_presenton_projection_repair_dispatch_job(dispatch_job_id: str) -> None:
    worker_id = f"api-presenton-projection-{str(dispatch_job_id or '')[:16]}"
    claimed = await background_job_dispatcher.claim(
        worker_id=worker_id,
        job_types=[PRESENTON_PROJECTION_REPAIR_JOB_TYPE],
        job_id=dispatch_job_id,
        lease_seconds=PRESENTON_PROJECTION_REPAIR_LEASE_SECONDS,
    )
    if not claimed:
        return

    payload = dict(claimed.get("payload") or {})
    try:
        result = await _replay_presenton_projection_payload(payload)
    except Exception as exc:  # noqa: BLE001
        await background_job_dispatcher.mark_failed(
            job_id=dispatch_job_id,
            worker_id=worker_id,
            error=str(exc),
        )
        return

    await background_job_dispatcher.mark_done(
        job_id=dispatch_job_id,
        worker_id=worker_id,
        result=result,
    )
