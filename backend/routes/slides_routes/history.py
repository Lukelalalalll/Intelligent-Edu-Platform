"""Slides generation history: list, detail, replay."""
import logging
from fastapi import HTTPException, Depends
from fastapi.responses import JSONResponse

from backend.core.database import db
from backend.core.security import get_current_user
from .router import slides_router

logger = logging.getLogger(__name__)


@slides_router.get("/generation_history")
async def get_generation_history(
    page: int = 1,
    page_size: int = 10,
    user: dict = Depends(get_current_user),
):
    try:
        user_id = user.get("id", "")
        skip = (page - 1) * page_size
        cursor = (
            db.sub1_generation_history
            .find({"user_id": user_id}, {"result_full": 0})
            .sort("created_at", -1)
            .skip(skip)
            .limit(page_size)
        )
        items = []
        async for doc in cursor:
            created = doc.get("created_at", "")
            items.append({
                "id": str(doc["_id"]),
                "params": doc.get("params", {}),
                "preview": doc.get("result_preview", ""),
                "created_at": created.isoformat() if hasattr(created, "isoformat") else str(created),
            })
        total = await db.sub1_generation_history.count_documents({"user_id": user_id})
        return {"success": True, "items": items, "total": total, "page": page, "page_size": page_size}
    except Exception as e:
        return JSONResponse(content={"success": False, "error": str(e)}, status_code=500)


@slides_router.get("/generation_history/{history_id}")
async def get_generation_detail(history_id: str, user: dict = Depends(get_current_user)):
    try:
        from bson import ObjectId
        from bson.errors import InvalidId
        try:
            oid = ObjectId(history_id)
        except (InvalidId, Exception):
            return JSONResponse(content={"success": False, "error": "Invalid history ID format"},
                                status_code=400)
        doc = await db.sub1_generation_history.find_one(
            {"_id": oid, "user_id": user.get("id", "")}
        )
        if not doc:
            return JSONResponse(content={"success": False, "error": "Record not found"}, status_code=404)
        created = doc.get("created_at", "")
        return {
            "success": True,
            "id": str(doc["_id"]),
            "params": doc.get("params", {}),
            "result": doc.get("result_full", ""),
            "created_at": created.isoformat() if hasattr(created, "isoformat") else str(created),
        }
    except Exception as e:
        return JSONResponse(content={"success": False, "error": str(e)}, status_code=500)


@slides_router.post("/generation_history/{history_id}/replay")
async def replay_generation_history(history_id: str, user: dict = Depends(get_current_user)):
    try:
        from bson import ObjectId
        from bson.errors import InvalidId
        try:
            oid = ObjectId(history_id)
        except (InvalidId, Exception):
            return JSONResponse(content={"success": False, "error": "Invalid history ID format"},
                                status_code=400)
        doc = await db.sub1_generation_history.find_one(
            {"_id": oid, "user_id": user.get("id", "")}
        )
        if not doc:
            return JSONResponse(content={"success": False, "error": "Record not found"}, status_code=404)
        params = doc.get("params", {})
        source = doc.get("source", {})
        return {"success": True, "params": params, "source": source, "tool": params.get("tool", "")}
    except Exception as e:
        return JSONResponse(content={"success": False, "error": str(e)}, status_code=500)
