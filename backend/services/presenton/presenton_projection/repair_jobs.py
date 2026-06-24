from __future__ import annotations

import uuid
from typing import Any, Awaitable, Callable

from .constants import (
    PRESENTON_PROJECTION_REPAIR_JOB_TYPE,
    PRESENTON_PROJECTION_REPAIR_LEASE_SECONDS,
    PRESENTON_PROJECTION_REPAIR_MAX_ATTEMPTS,
    PRESENTON_PROJECTION_REPAIR_RETRY_DELAY_SECONDS,
)
from .serialization import require_owner_user_id


def parse_required_uuid(raw_value: str, *, label: str) -> uuid.UUID:
    value = str(raw_value or "").strip()
    if not value:
        raise ValueError(f"Missing required {label}.")
    return uuid.UUID(value)


def parse_optional_uuid(raw_value: str | None) -> uuid.UUID | None:
    value = str(raw_value or "").strip()
    if not value:
        return None
    return uuid.UUID(value)


async def replay_presenton_projection_payload(
    payload: dict[str, Any],
    *,
    projection_service,
    get_async_session_maker: Callable[[], Any],
    sleep: Callable[[float], Awaitable[None]],
) -> dict[str, Any]:
    kind = str(payload.get("kind") or "").strip()
    owner_user_id = require_owner_user_id(str(payload.get("ownerUserId") or ""))
    presentation_id = parse_required_uuid(
        str(payload.get("presentationId") or ""),
        label="presentationId",
    )
    conversation_id = parse_optional_uuid(payload.get("conversationId"))

    last_error: BaseException | None = None
    for attempt in range(1, PRESENTON_PROJECTION_REPAIR_MAX_ATTEMPTS + 1):
        try:
            if kind == "delete_projection":
                await projection_service.delete_projection(
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

            async_session_maker = get_async_session_maker()
            async with async_session_maker() as sql_session:
                if kind == "presentation_bundle":
                    result = await projection_service.sync_presentation_bundle(
                        sql_session,
                        presentation_id=presentation_id,
                        owner_user_id=owner_user_id,
                    )
                elif kind == "chat_conversation":
                    if conversation_id is None:
                        raise ValueError("conversationId is required for chat_conversation repair.")
                    result = await projection_service.sync_chat_conversation(
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
            await sleep(PRESENTON_PROJECTION_REPAIR_RETRY_DELAY_SECONDS * attempt)

    assert last_error is not None
    raise last_error


async def run_presenton_projection_repair_dispatch_job(
    dispatch_job_id: str,
    *,
    dispatcher,
    replay_payload: Callable[[dict[str, Any]], Awaitable[dict[str, Any]]],
) -> None:
    worker_id = f"api-presenton-projection-{str(dispatch_job_id or '')[:16]}"
    claimed = await dispatcher.claim(
        worker_id=worker_id,
        job_types=[PRESENTON_PROJECTION_REPAIR_JOB_TYPE],
        job_id=dispatch_job_id,
        lease_seconds=PRESENTON_PROJECTION_REPAIR_LEASE_SECONDS,
    )
    if not claimed:
        return

    payload = dict(claimed.get("payload") or {})
    try:
        result = await replay_payload(payload)
    except Exception as exc:  # noqa: BLE001
        await dispatcher.mark_failed(
            job_id=dispatch_job_id,
            worker_id=worker_id,
            error=str(exc),
        )
        return

    await dispatcher.mark_done(
        job_id=dispatch_job_id,
        worker_id=worker_id,
        result=result,
    )
