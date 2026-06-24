from __future__ import annotations

import logging
import uuid
from typing import Any, Callable

from sqlalchemy.ext.asyncio import AsyncSession

from .bundle_loader import load_chat_messages, load_presentation_bundle
from .constants import PRESENTON_PROJECTION_REPAIR_JOB_TYPE
from .mongo_sync import (
    delete_projection_documents,
    replace_chat_messages,
    sync_presentation_document,
)
from .serialization import normalize_owner_user_id, require_owner_user_id

LOGGER = logging.getLogger(__name__)


class PresentonMongoProjectionService:
    def __init__(
        self,
        *,
        get_db: Callable[[], Any],
        get_background_job_dispatcher: Callable[[], Any],
        get_spawn_background_coro: Callable[[], Callable[..., Any]],
        run_repair_dispatch_job: Callable[[str], Any],
    ) -> None:
        self._get_db = get_db
        self._get_background_job_dispatcher = get_background_job_dispatcher
        self._get_spawn_background_coro = get_spawn_background_coro
        self._run_repair_dispatch_job = run_repair_dispatch_job

    async def load_presentation_bundle(
        self,
        sql_session: AsyncSession,
        *,
        presentation_id: uuid.UUID,
    ):
        return await load_presentation_bundle(sql_session, presentation_id=presentation_id)

    async def load_chat_messages(
        self,
        sql_session: AsyncSession,
        *,
        presentation_id: uuid.UUID,
        conversation_id: uuid.UUID,
    ):
        return await load_chat_messages(
            sql_session,
            presentation_id=presentation_id,
            conversation_id=conversation_id,
        )

    async def sync_presentation_bundle(
        self,
        sql_session: AsyncSession,
        *,
        presentation_id: uuid.UUID,
        owner_user_id: str | None = None,
    ) -> dict[str, Any]:
        owner = require_owner_user_id(owner_user_id)
        bundle = await self.load_presentation_bundle(sql_session, presentation_id=presentation_id)
        await sync_presentation_document(
            self._get_db(),
            presentation=bundle.presentation,
            slides=bundle.slides,
            owner_user_id=owner,
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
        owner = require_owner_user_id(owner_user_id)
        messages = await self.load_chat_messages(
            sql_session,
            presentation_id=presentation_id,
            conversation_id=conversation_id,
        )
        await replace_chat_messages(
            self._get_db(),
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
        require_owner_user_id(owner_user_id)
        await delete_projection_documents(self._get_db(), presentation_id=presentation_id)

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
                owner_user_id=normalize_owner_user_id(owner_user_id),
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
                owner_user_id=normalize_owner_user_id(owner_user_id),
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
                owner_user_id=normalize_owner_user_id(owner_user_id),
                reason=reason,
                error=str(exc),
            )
            LOGGER.exception(
                "Presenton projection delete failed (presentation_id=%s, reason=%s)",
                presentation_id,
                reason,
            )

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

        dispatcher = self._get_background_job_dispatcher()
        dispatch_job = await dispatcher.enqueue(
            job_type=PRESENTON_PROJECTION_REPAIR_JOB_TYPE,
            queue="presenton",
            payload={
                "kind": kind,
                "presentationId": str(presentation_id),
                "conversationId": str(conversation_id) if conversation_id else "",
                "ownerUserId": owner_user_id,
                "reason": reason,
            },
            metadata={"source": "presenton_projection_service", "error": error},
        )
        self._get_spawn_background_coro()(
            self._run_repair_dispatch_job(dispatch_job["job_id"]),
            label=f"presenton-projection-repair:{dispatch_job['job_id']}",
        )
