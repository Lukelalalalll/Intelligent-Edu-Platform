from __future__ import annotations

from backend.services.background_job_dispatcher import background_job_dispatcher

from .presenton_projection.constants import (
    PRESENTON_CHAT_MESSAGES_COLLECTION,
    PRESENTON_PRESENTATIONS_COLLECTION,
    PRESENTON_PROJECTION_REPAIR_JOB_TYPE,
    PRESENTON_PROJECTION_REPAIR_LEASE_SECONDS,
    PRESENTON_PROJECTION_REPAIR_MAX_ATTEMPTS,
    PRESENTON_PROJECTION_REPAIR_RETRY_DELAY_SECONDS,
    PRESENTON_SLIDES_COLLECTION,
)
from .presenton_projection.repair_jobs import run_presenton_projection_repair_dispatch_job


def _normalize_owner_user_id(owner_user_id: str | None) -> str:
    return str(owner_user_id or "").strip()


def _compat_payload(
    *,
    presentation_id,
    owner_user_id: str | None,
    action: str,
    conversation_id=None,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "presentationId": str(presentation_id),
        "ownerUserId": _normalize_owner_user_id(owner_user_id),
        "disabled": True,
        "reason": "mongo_projection_retired",
        "action": action,
    }
    if conversation_id is not None:
        payload["conversationId"] = str(conversation_id)
    return payload


class _RetiredProjectionService:
    async def sync_presentation_bundle(
        self,
        _sql_session,
        *,
        presentation_id,
        owner_user_id: str | None = None,
    ) -> dict[str, object]:
        payload = _compat_payload(
            presentation_id=presentation_id,
            owner_user_id=owner_user_id,
            action="sync_presentation_bundle",
        )
        payload["slidesCount"] = 0
        return payload

    async def sync_chat_conversation(
        self,
        _sql_session,
        *,
        presentation_id,
        conversation_id,
        owner_user_id: str | None = None,
    ) -> dict[str, object]:
        payload = _compat_payload(
            presentation_id=presentation_id,
            conversation_id=conversation_id,
            owner_user_id=owner_user_id,
            action="sync_chat_conversation",
        )
        payload["messagesCount"] = 0
        return payload

    async def delete_projection(
        self,
        *,
        presentation_id,
        owner_user_id: str | None = None,
    ) -> dict[str, object]:
        return _compat_payload(
            presentation_id=presentation_id,
            owner_user_id=owner_user_id,
            action="delete_projection",
        )

    async def safe_sync_presentation_bundle(
        self,
        sql_session,
        *,
        presentation_id,
        owner_user_id: str | None = None,
        reason: str,
    ) -> dict[str, object]:
        payload = await self.sync_presentation_bundle(
            sql_session,
            presentation_id=presentation_id,
            owner_user_id=owner_user_id,
        )
        payload["requestedReason"] = str(reason or "")
        return payload

    async def safe_sync_chat_conversation(
        self,
        sql_session,
        *,
        presentation_id,
        conversation_id,
        owner_user_id: str | None = None,
        reason: str,
    ) -> dict[str, object]:
        payload = await self.sync_chat_conversation(
            sql_session,
            presentation_id=presentation_id,
            conversation_id=conversation_id,
            owner_user_id=owner_user_id,
        )
        payload["requestedReason"] = str(reason or "")
        return payload

    async def safe_delete_projection(
        self,
        *,
        presentation_id,
        owner_user_id: str | None = None,
        reason: str,
    ) -> dict[str, object]:
        payload = await self.delete_projection(
            presentation_id=presentation_id,
            owner_user_id=owner_user_id,
        )
        payload["requestedReason"] = str(reason or "")
        return payload


PRESENTON_MONGO_PROJECTION_SERVICE = _RetiredProjectionService()


async def _run_presenton_projection_repair_dispatch_job(dispatch_job_id: str) -> None:
    await run_presenton_projection_repair_dispatch_job(
        dispatch_job_id,
        dispatcher=background_job_dispatcher,
        replay_payload=None,
    )


PPT_GENERATOR_MONGO_PROJECTION_SERVICE = PRESENTON_MONGO_PROJECTION_SERVICE
