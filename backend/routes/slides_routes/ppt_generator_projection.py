from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.core.security import get_current_user
from backend.services.slides.ppt_generator.projection_query_service import (
    get_ppt_generator_presentation_detail as fetch_ppt_generator_presentation_detail,
    list_ppt_generator_presentations as fetch_ppt_generator_presentations,
    search_ppt_generator_presentations as search_ppt_generator_presentation_records,
)

router = APIRouter()


def _resolve_owner_user_id(current_user: dict) -> str:
    return str(current_user.get("id") or current_user.get("_id") or "").strip()


@router.get("/ppt_generator/presentations/search")
async def search_ppt_generator_presentations(
    q: str = Query("", alias="q"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    owner_user_id = _resolve_owner_user_id(current_user)
    items, total = await search_ppt_generator_presentation_records(
        owner_user_id=owner_user_id,
        query=q,
        page=page,
        page_size=page_size,
    )
    return {
        "success": True,
        "query": q,
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/ppt_generator/presentations")
async def list_ppt_generator_presentations(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    owner_user_id = _resolve_owner_user_id(current_user)
    items, total = await fetch_ppt_generator_presentations(
        owner_user_id=owner_user_id,
        page=page,
        page_size=page_size,
    )
    return {
        "success": True,
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/ppt_generator/presentations/{presentation_id}")
async def get_ppt_generator_presentation_detail(
    presentation_id: str,
    current_user: dict = Depends(get_current_user),
):
    owner_user_id = _resolve_owner_user_id(current_user)
    detail = await fetch_ppt_generator_presentation_detail(
        owner_user_id=owner_user_id,
        presentation_id=presentation_id,
    )
    if not detail:
        raise HTTPException(status_code=404, detail="Presentation not found")
    return {
        "success": True,
        **detail,
    }

