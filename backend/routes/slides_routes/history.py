"""Slides generation history: list, detail, replay."""

from fastapi import Depends, HTTPException, Query

from backend.core.security import get_current_user
from backend.services.history_service import enrich_slides_history_detail, get_history_document, list_history, serialize_history_doc

from .router import slides_router


@slides_router.get("/generation_history")
async def get_generation_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    user: dict = Depends(get_current_user),
):
    docs, total = await list_history(
        tools=("slides",),
        user_id=user.get("id", ""),
        page=page,
        page_size=page_size,
    )
    return {
        "success": True,
        "items": [serialize_history_doc(doc) for doc in docs],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@slides_router.get("/generation_history/{history_id}")
async def get_generation_detail(history_id: str, user: dict = Depends(get_current_user)):
    doc = await get_history_document(
        tools=("slides",),
        history_id=history_id,
        user_id=user.get("id", ""),
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Record not found")
    payload = serialize_history_doc(doc, include_result=True)
    if payload.get("tool_key") == "slides":
        payload = await enrich_slides_history_detail(payload)
    return {"success": True, **payload}


@slides_router.post("/generation_history/{history_id}/replay")
async def replay_generation_history(history_id: str, user: dict = Depends(get_current_user)):
    doc = await get_history_document(
        tools=("slides",),
        history_id=history_id,
        user_id=user.get("id", ""),
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Record not found")
    params = doc.get("params", {})
    source = doc.get("source", {})
    return {"success": True, "params": params, "source": source, "tool": params.get("tool", "")}
