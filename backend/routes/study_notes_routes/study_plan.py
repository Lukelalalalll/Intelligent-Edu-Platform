"""Study plan generation and spaced-repetition review endpoints."""
from fastapi import Depends

from backend.core.security import get_current_user
from backend.services.study.study_plan_service import (
    generate_study_plan as generate_study_plan_service,
)
from backend.services.study.study_plan_service import (
    get_next_review_item as get_next_review_item_service,
)
from backend.services.study.study_plan_service import (
    get_study_plan as get_study_plan_service,
)
from backend.services.study.study_plan_service import (
    submit_review_feedback as submit_review_feedback_service,
)
from .helpers import (
    StudyPlanGenerateSchema,
    StudyReviewSubmitSchema,
)
from .router import study_notes_router


@study_notes_router.post("/plan/generate")
async def generate_study_plan(
    payload: StudyPlanGenerateSchema,
    current_user: dict = Depends(get_current_user),
):
    return await generate_study_plan_service(payload=payload, current_user=current_user)


@study_notes_router.get("/plan/{plan_id}")
async def get_study_plan(plan_id: str, current_user: dict = Depends(get_current_user)):
    return await get_study_plan_service(plan_id=plan_id, current_user=current_user)


@study_notes_router.post("/review/next")
async def get_next_review_item(plan_id: str | None = None, current_user: dict = Depends(get_current_user)):
    return await get_next_review_item_service(plan_id=plan_id, current_user=current_user)


@study_notes_router.post("/review/submit")
async def submit_review_feedback(payload: StudyReviewSubmitSchema, current_user: dict = Depends(get_current_user)):
    return await submit_review_feedback_service(payload=payload, current_user=current_user)

