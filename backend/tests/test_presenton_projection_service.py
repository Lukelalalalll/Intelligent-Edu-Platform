from __future__ import annotations

import asyncio
import types
import uuid
from unittest.mock import AsyncMock

from backend.services.presenton.presenton_projection_service import (
    PRESENTON_MONGO_PROJECTION_SERVICE,
    PRESENTON_PROJECTION_REPAIR_JOB_TYPE,
    _run_presenton_projection_repair_dispatch_job,
)


def test_sync_presentation_bundle_returns_retired_compat_payload():
    result = asyncio.run(
        PRESENTON_MONGO_PROJECTION_SERVICE.sync_presentation_bundle(
            object(),
            presentation_id=uuid.uuid4(),
            owner_user_id="user-1",
        )
    )

    assert result["disabled"] is True
    assert result["reason"] == "mongo_projection_retired"
    assert result["ownerUserId"] == "user-1"
    assert result["slidesCount"] == 0


def test_sync_chat_conversation_returns_retired_compat_payload():
    conversation_id = uuid.uuid4()
    result = asyncio.run(
        PRESENTON_MONGO_PROJECTION_SERVICE.sync_chat_conversation(
            object(),
            presentation_id=uuid.uuid4(),
            conversation_id=conversation_id,
            owner_user_id="user-2",
        )
    )

    assert result["disabled"] is True
    assert result["reason"] == "mongo_projection_retired"
    assert result["conversationId"] == str(conversation_id)
    assert result["messagesCount"] == 0


def test_safe_delete_projection_is_stable_noop():
    result = asyncio.run(
        PRESENTON_MONGO_PROJECTION_SERVICE.safe_delete_projection(
            presentation_id=uuid.uuid4(),
            owner_user_id="user-3",
            reason="cleanup",
        )
    )

    assert result["disabled"] is True
    assert result["reason"] == "mongo_projection_retired"
    assert result["requestedReason"] == "cleanup"


def test_repair_dispatch_job_marks_done_as_ignored(monkeypatch):
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
        "backend.services.presenton.presenton_projection_service.background_job_dispatcher",
        types.SimpleNamespace(
            claim=AsyncMock(return_value=claimed),
            mark_done=mark_done,
            mark_failed=mark_failed,
        ),
    )

    asyncio.run(_run_presenton_projection_repair_dispatch_job("dispatch-job-2"))

    assert mark_failed.await_count == 0
    assert mark_done.await_count == 1
    kwargs = mark_done.await_args.kwargs
    assert kwargs["job_id"] == "dispatch-job-2"
    assert kwargs["result"]["disabled"] is True
    assert kwargs["result"]["ignored"] is True
    assert kwargs["result"]["jobType"] == PRESENTON_PROJECTION_REPAIR_JOB_TYPE


def test_repair_dispatch_job_returns_when_claim_not_found(monkeypatch):
    mark_done = AsyncMock()
    mark_failed = AsyncMock()
    monkeypatch.setattr(
        "backend.services.presenton.presenton_projection_service.background_job_dispatcher",
        types.SimpleNamespace(
            claim=AsyncMock(return_value=None),
            mark_done=mark_done,
            mark_failed=mark_failed,
        ),
    )

    asyncio.run(_run_presenton_projection_repair_dispatch_job("dispatch-job-3"))

    assert mark_done.await_count == 0
    assert mark_failed.await_count == 0
