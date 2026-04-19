"""Diagram generation history: list, detail, replay."""
import json
import logging

from fastapi import Depends, Query
from fastapi.responses import JSONResponse

from backend.core.database import db
from backend.core.security import get_current_user
from .router import diagram_router

logger = logging.getLogger(__name__)


@diagram_router.get("/generation_history")
async def get_generation_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    user: dict = Depends(get_current_user),
):
    """Return paginated visual-tool history (diagram + image-extract) for the current user."""
    try:
        user_id = user.get("id", "")
        skip = (page - 1) * page_size

        # Merge sub4 (diagram/extract) and sub3 (image-extractor) via $unionWith aggregation.
        pipeline = [
            {"$match": {"user_id": user_id}},
            {"$project": {"result_full": 0}},
            {"$addFields": {"_source_coll": "sub4"}},
            {"$unionWith": {
                "coll": "sub3_generation_history",
                "pipeline": [
                    {"$match": {"user_id": user_id}},
                    {"$project": {"result_full": 0}},
                    {"$addFields": {"_source_coll": "sub3"}},
                ],
            }},
            {"$sort": {"created_at": -1}},
            {"$facet": {
                "items": [{"$skip": skip}, {"$limit": page_size}],
                "total_count": [{"$count": "count"}],
            }},
        ]

        result = await db.sub4_generation_history.aggregate(pipeline).to_list(length=1)
        if not result:
            return {"success": True, "items": [], "total": 0, "page": page, "page_size": page_size}

        facet = result[0]
        raw_items = facet.get("items", [])
        total = (facet.get("total_count") or [{}])[0].get("count", 0)

        items = []
        for doc in raw_items:
            created = doc.get("created_at", "")
            items.append({
                "id": str(doc["_id"]),
                "tool": doc.get("tool") or doc.get("params", {}).get("service_type") or "",
                "source_coll": doc.get("_source_coll", "sub4"),
                "params": doc.get("params", {}),
                "preview": doc.get("result_preview", ""),
                "created_at": created.isoformat() if hasattr(created, "isoformat") else str(created),
            })

        return {"success": True, "items": items, "total": total, "page": page, "page_size": page_size}
    except Exception as e:
        return JSONResponse(content={"success": False, "error": str(e)}, status_code=500)


@diagram_router.get("/generation_history/{history_id}")
async def get_generation_detail(history_id: str, user: dict = Depends(get_current_user)):
    """Return full generation result — checks sub4 then sub3 (image-extractor)."""
    try:
        from bson import ObjectId
        from bson.errors import InvalidId
        try:
            oid = ObjectId(history_id)
        except (InvalidId, Exception):
            return JSONResponse(content={"success": False, "error": "Invalid history ID format"}, status_code=400)
        user_id = user.get("id", "")
        doc = await db.sub4_generation_history.find_one({"_id": oid, "user_id": user_id})
        if not doc:
            doc = await db.sub3_generation_history.find_one({"_id": oid, "user_id": user_id})
        if not doc:
            return JSONResponse(content={"success": False, "error": "Record not found"}, status_code=404)
        created = doc.get("created_at", "")
        return {
            "success": True,
            "id": str(doc.get("_id")),
            "tool": doc.get("tool") or doc.get("params", {}).get("service_type") or "",
            "params": doc.get("params", {}),
            "result": doc.get("result_full", ""),
            "created_at": created.isoformat() if hasattr(created, "isoformat") else str(created),
        }
    except Exception as e:
        return JSONResponse(content={"success": False, "error": str(e)}, status_code=500)


@diagram_router.post("/generation_history/{history_id}/replay")
async def replay_generation_history(history_id: str, user: dict = Depends(get_current_user)):
    """Return original prompt/params for replay — checks sub4 then sub3."""
    try:
        from bson import ObjectId
        from bson.errors import InvalidId
        try:
            oid = ObjectId(history_id)
        except (InvalidId, Exception):
            return JSONResponse(content={"success": False, "error": "Invalid history ID format"}, status_code=400)
        user_id = user.get("id", "")
        doc = await db.sub4_generation_history.find_one({"_id": oid, "user_id": user_id})
        if not doc:
            doc = await db.sub3_generation_history.find_one({"_id": oid, "user_id": user_id})
        if not doc:
            return JSONResponse(content={"success": False, "error": "Record not found"}, status_code=404)

        params = doc.get("params", {})
        source = doc.get("source", {})
        tool = doc.get("tool") or params.get("service_type") or ""
        return {
            "success": True,
            "tool": tool,
            "prompt": source.get("prompt", ""),
            "provider": params.get("provider", "local_ollama"),
            "service_type": params.get("service_type", "generate"),
        }
    except Exception as e:
        return JSONResponse(content={"success": False, "error": str(e)}, status_code=500)
