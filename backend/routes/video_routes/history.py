from __future__ import annotations

from fastapi import Depends, HTTPException, Query

from backend.core.security import get_current_user
from backend.services.history_service import get_history_document, list_history, serialize_history_doc

from .router import router


@router.get("/generation_history")
async def list_video_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    current_user: dict = Depends(get_current_user),
):
    docs, total = await list_history(
        tools=("video",),
        user_id=current_user.get("id", ""),
        page=page,
        page_size=page_size,
    )
    return {"items": [serialize_history_doc(doc) for doc in docs], "total": total, "page": page, "page_size": page_size}


@router.get("/generation_history/{history_id}")
async def get_video_history_detail(
    history_id: str,
    current_user: dict = Depends(get_current_user),
):
    doc = await get_history_document(
        tools=("video",),
        history_id=history_id,
        user_id=current_user.get("id", ""),
    )
    if not doc:
        raise HTTPException(status_code=404, detail="History record not found")
    return {"success": True, **serialize_history_doc(doc, include_result=True)}
