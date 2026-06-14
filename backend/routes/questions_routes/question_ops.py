"""QuestionOps Phase 1 MVP endpoints: runs, items, dedupe."""
from __future__ import annotations

from fastapi import Depends, Query, Request

from backend.core.security import get_current_user
from backend.schemas import QuestionOpsDedupeApplySchema, QuestionOpsRunCreateSchema
from backend.services.question_ops_service import (
    apply_question_ops_dedupe as apply_question_ops_dedupe_service,
)
from backend.services.question_ops_service import (
    create_question_ops_run as create_question_ops_run_service,
)
from backend.services.question_ops_service import (
    get_question_ops_items as get_question_ops_items_service,
)
from backend.services.question_ops_service import (
    get_question_ops_run as get_question_ops_run_service,
)

from .router import questions_router


@questions_router.post("/ops/runs")
async def create_question_ops_run(
    payload: QuestionOpsRunCreateSchema,
    request: Request,
    user: dict = Depends(get_current_user),
):
    return await create_question_ops_run_service(payload=payload, request=request, user=user)


@questions_router.get("/ops/runs/{run_id}")
async def get_question_ops_run(run_id: str, user: dict = Depends(get_current_user)):
    return await get_question_ops_run_service(run_id=run_id, user_id=user.get("id", ""))


@questions_router.get("/ops/runs/{run_id}/items")
async def get_question_ops_items(
    run_id: str,
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(get_current_user),
):
    return await get_question_ops_items_service(run_id=run_id, user_id=user.get("id", ""), limit=limit)


@questions_router.post("/ops/runs/{run_id}/apply-dedupe")
async def apply_question_ops_dedupe(
    run_id: str,
    payload: QuestionOpsDedupeApplySchema,
    user: dict = Depends(get_current_user),
):
    return await apply_question_ops_dedupe_service(
        run_id=run_id,
        payload=payload,
        user_id=user.get("id", ""),
    )
