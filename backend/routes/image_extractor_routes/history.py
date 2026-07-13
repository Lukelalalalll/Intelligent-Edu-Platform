"""Image extractor generation history endpoints."""
import json

from fastapi import Depends, HTTPException, Query

from backend.core.security import get_current_user
from backend.services.history_service import get_history_document, list_history, serialize_history_doc

from .router import image_extractor_router


@image_extractor_router.get("/generation_history")
async def list_image_extractor_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    user: dict = Depends(get_current_user),
):
    docs, total = await list_history(
        tools=("image_extractor",),
        user_id=user.get("id", ""),
        page=page,
        page_size=page_size,
    )
    return {
        "items": [serialize_history_doc(doc) for doc in docs],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@image_extractor_router.get("/generation_history/{history_id}")
async def get_image_extractor_history_detail(
    history_id: str,
    user: dict = Depends(get_current_user),
):
    doc = await get_history_document(
        tools=("image_extractor",),
        history_id=history_id,
        user_id=user.get("id", ""),
    )
    if not doc:
        raise HTTPException(status_code=404, detail="History record not found")
    return {"success": True, **serialize_history_doc(doc, include_result=True)}


@image_extractor_router.post("/generation_history/{history_id}/replay")
async def replay_image_extractor_history(
    history_id: str,
    user: dict = Depends(get_current_user),
):
    doc = await get_history_document(
        tools=("image_extractor",),
        history_id=history_id,
        user_id=user.get("id", ""),
    )
    if not doc:
        raise HTTPException(status_code=404, detail="History record not found")
    result_full = doc.get("result_full", "{}")
    try:
        data = json.loads(result_full)
    except json.JSONDecodeError:
        data = {}
    return {
        "tool": doc.get("tool"),
        "params": doc.get("params", {}),
        "data": data,
    }
