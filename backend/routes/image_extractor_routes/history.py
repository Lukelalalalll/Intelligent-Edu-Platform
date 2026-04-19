"""Image extractor generation history endpoints."""
import json
import logging

from fastapi import Depends, HTTPException, Query

from backend.core.database import db
from backend.core.security import get_current_user
from .router import image_extractor_router

_logger = logging.getLogger(__name__)


@image_extractor_router.get("/generation_history")
async def list_image_extractor_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    user: dict = Depends(get_current_user),
):
    user_id = user.get("id", "")
    skip = (page - 1) * page_size
    cursor = (
        db.sub3_generation_history
        .find({"user_id": user_id}, {"result_full": 0})
        .sort("created_at", -1)
        .skip(skip)
        .limit(page_size)
    )
    items = []
    async for doc in cursor:
        items.append({
            "id": str(doc["_id"]),
            "tool": doc.get("tool", ""),
            "params": doc.get("params", {}),
            "preview": doc.get("result_preview", ""),
            "created_at": doc.get("created_at", "").isoformat() if hasattr(doc.get("created_at", ""), "isoformat") else str(doc.get("created_at", "")),
        })
    total = await db.sub3_generation_history.count_documents({"user_id": user_id})
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@image_extractor_router.get("/generation_history/{history_id}")
async def get_image_extractor_history_detail(
    history_id: str,
    user: dict = Depends(get_current_user),
):
    from bson import ObjectId

    try:
        oid = ObjectId(history_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid history ID format")
    doc = await db.sub3_generation_history.find_one(
        {"_id": oid, "user_id": user.get("id", "")}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="History record not found")
    return {
        "success": True,
        "id": str(doc.get("_id")),
        "params": doc.get("params", {}),
        "result": doc.get("result_full", ""),
        "created_at": doc.get("created_at", "").isoformat() if hasattr(doc.get("created_at", ""), "isoformat") else str(doc.get("created_at", "")),
    }


@image_extractor_router.post("/generation_history/{history_id}/replay")
async def replay_image_extractor_history(
    history_id: str,
    user: dict = Depends(get_current_user),
):
    from bson import ObjectId

    doc = await db.sub3_generation_history.find_one(
        {"_id": ObjectId(history_id), "user_id": user.get("id", "")}
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
