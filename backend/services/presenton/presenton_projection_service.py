from __future__ import annotations

import asyncio

from backend.core.database import db
from backend.services.background_job_dispatcher import background_job_dispatcher
from backend.services.background_job_runtime import spawn_background_coro

from .presenton_projection.constants import (
    PRESENTON_CHAT_MESSAGES_COLLECTION,
    PRESENTON_PRESENTATIONS_COLLECTION,
    PRESENTON_PROJECTION_REPAIR_JOB_TYPE,
    PRESENTON_PROJECTION_REPAIR_LEASE_SECONDS,
    PRESENTON_PROJECTION_REPAIR_MAX_ATTEMPTS,
    PRESENTON_PROJECTION_REPAIR_RETRY_DELAY_SECONDS,
    PRESENTON_SLIDES_COLLECTION,
)
from .presenton_projection.repair_jobs import (
    replay_presenton_projection_payload,
    run_presenton_projection_repair_dispatch_job,
)
from .presenton_projection.runtime_bootstrap import get_async_session_maker
from .presenton_projection.service import PresentonMongoProjectionService


PRESENTON_MONGO_PROJECTION_SERVICE = PresentonMongoProjectionService(
    get_db=lambda: db,
    get_background_job_dispatcher=lambda: background_job_dispatcher,
    get_spawn_background_coro=lambda: spawn_background_coro,
    run_repair_dispatch_job=lambda dispatch_job_id: _run_presenton_projection_repair_dispatch_job(
        dispatch_job_id
    ),
)


def _get_async_session_maker():
    return get_async_session_maker()


async def _replay_presenton_projection_payload(payload):
    return await replay_presenton_projection_payload(
        payload,
        projection_service=PRESENTON_MONGO_PROJECTION_SERVICE,
        get_async_session_maker=_get_async_session_maker,
        sleep=asyncio.sleep,
    )


async def _run_presenton_projection_repair_dispatch_job(dispatch_job_id: str) -> None:
    await run_presenton_projection_repair_dispatch_job(
        dispatch_job_id,
        dispatcher=background_job_dispatcher,
        replay_payload=_replay_presenton_projection_payload,
    )
