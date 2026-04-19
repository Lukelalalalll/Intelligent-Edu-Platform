"""Study notes generation history endpoints."""
import json
import logging

from fastapi import Depends
from fastapi.responses import JSONResponse

from backend.core.database import db
from backend.core.security import get_current_user
from .router import study_notes_router

logger = logging.getLogger(__name__)


@study_notes_router.get("/generation_history")
async def get_generation_history(
    page: int = 1,
    page_size: int = 10,
    current_user: dict = Depends(get_current_user),
):
    """Return paginated generation history for the current user."""
    try:
        user_id = str(current_user.get("id") or current_user.get("_id") or "")
        skip = (page - 1) * page_size
        cursor = db.sub5_generation_history.find(
            {"user_id": user_id},
            {"result_full": 0},
        ).sort("created_at", -1).skip(skip).limit(page_size)

        items = []
        async for doc in cursor:
            items.append({
                "id": str(doc["_id"]),
                "params": doc.get("params", {}),
                "preview": doc.get("result_preview", ""),
                "created_at": doc.get("created_at", "").isoformat() if hasattr(doc.get("created_at", ""), "isoformat") else str(doc.get("created_at", "")),
            })

        total = await db.sub5_generation_history.count_documents({"user_id": user_id})
        return {"success": True, "items": items, "total": total, "page": page, "page_size": page_size}
    except Exception as e:
        return JSONResponse(content={"success": False, "error": str(e)}, status_code=500)


@study_notes_router.get("/generation_history/{history_id}")
async def get_generation_detail(history_id: str, current_user: dict = Depends(get_current_user)):
    """Return full generation result for review."""
    try:
        from bson import ObjectId
        from bson.errors import InvalidId
        try:
            oid = ObjectId(history_id)
        except (InvalidId, Exception):
            return JSONResponse(content={"success": False, "error": "Invalid history ID format"}, status_code=400)
        user_id = str(current_user.get("id") or current_user.get("_id") or "")
        doc = await db.sub5_generation_history.find_one({"_id": oid, "user_id": user_id})
        if not doc:
            return JSONResponse(content={"success": False, "error": "Record not found"}, status_code=404)
        return {
            "success": True,
            "id": str(doc.get("_id")),
            "params": doc.get("params", {}),
            "result": doc.get("result_full", ""),
            "created_at": doc.get("created_at", "").isoformat() if hasattr(doc.get("created_at", ""), "isoformat") else str(doc.get("created_at", "")),
        }
    except Exception as e:
        return JSONResponse(content={"success": False, "error": str(e)}, status_code=500)


@study_notes_router.post("/generation_history/{history_id}/replay")
async def replay_generation_history(history_id: str, current_user: dict = Depends(get_current_user)):
    """Return stored result for replay — no re-generation needed."""
    try:
        from bson import ObjectId
        from bson.errors import InvalidId
        try:
            oid = ObjectId(history_id)
        except (InvalidId, Exception):
            return JSONResponse(content={"success": False, "error": "Invalid history ID format"}, status_code=400)
        user_id = str(current_user.get("id") or current_user.get("_id") or "")
        doc = await db.sub5_generation_history.find_one({"_id": oid, "user_id": user_id})
        if not doc:
            return JSONResponse(content={"success": False, "error": "Record not found"}, status_code=404)

        params = doc.get("params", {})
        result_full = doc.get("result_full", "")

        parsed_result = {}
        if params.get("tool") == "generate_flashcards":
            try:
                parsed_result = json.loads(result_full) if isinstance(result_full, str) else result_full
            except (json.JSONDecodeError, TypeError):
                parsed_result = {"raw": result_full}
        else:
            parsed_result = {"notes": result_full}

        return {
            "success": True,
            "params": params,
            "result": parsed_result,
        }
    except Exception as e:
        return JSONResponse(content={"success": False, "error": str(e)}, status_code=500)
