"""File Center — unified tool-history browsing for all users + admin override."""
import logging
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from backend.core.database import db
from backend.core.security import get_current_user, get_admin_user
from .router import file_center_router

logger = logging.getLogger(__name__)

# ── Tool → MongoDB collection mapping ──────────────────────────────────────

TOOL_COLLECTIONS: dict[str, str] = {
    "slides": "sub1_generation_history",
    "questions": "sub2_generation_history",
    "image_extractor": "sub3_generation_history",
    "diagram": "sub4_generation_history",
    "study_notes": "sub5_generation_history",
    "video": "video_generation_history",
}

TOOL_LABELS: dict[str, str] = {
    "slides": "PPT Generation",
    "questions": "Question Bank",
    "image_extractor": "Image Extraction",
    "diagram": "Diagram Generation",
    "study_notes": "Study Notes",
    "video": "Video Generation",
}

ALL_TOOLS = list(TOOL_COLLECTIONS.keys())


def _get_collection(tool: str):
    name = TOOL_COLLECTIONS.get(tool)
    if not name:
        raise HTTPException(status_code=400, detail=f"Unknown tool: {tool}")
    return db[name]


def _base_filter(user_id: str) -> dict:
    return {"user_id": user_id, "deleted_at": {"$exists": False}}


def _serialize_doc(doc: dict) -> dict:
    created = doc.get("created_at", "")
    return {
        "id": str(doc["_id"]),
        "tool": doc.get("tool", doc.get("params", {}).get("tool", "")),
        "params": doc.get("params", {}),
        "preview": doc.get("result_preview", ""),
        "source": doc.get("source", {}),
        "created_at": created.isoformat() if hasattr(created, "isoformat") else str(created),
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  USER endpoints — any logged-in user, scoped to their own data
# ═══════════════════════════════════════════════════════════════════════════════


@file_center_router.get("/tool-history/summary")
async def tool_history_summary(user: dict = Depends(get_current_user)):
    """Return per-tool item counts for the current user."""
    user_id = user.get("id", "")
    result: list[dict] = []
    for tool, col_name in TOOL_COLLECTIONS.items():
        count = await db[col_name].count_documents(_base_filter(user_id))
        result.append({"tool": tool, "label": TOOL_LABELS[tool], "count": count})
    return {"success": True, "tools": result}


@file_center_router.get("/tool-history")
async def tool_history_list(
    tool: str = Query(..., description="Tool key, e.g. slides"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    search: str = Query("", description="Text search in preview/params"),
    user: dict = Depends(get_current_user),
):
    """List history items for one tool, scoped to the current user."""
    col = _get_collection(tool)
    user_id = user.get("id", "")
    filt = _base_filter(user_id)
    if search:
        filt["$or"] = [
            {"result_preview": {"$regex": search, "$options": "i"}},
            {"params.filename": {"$regex": search, "$options": "i"}},
            {"params.source_filename": {"$regex": search, "$options": "i"}},
            {"source.file_name": {"$regex": search, "$options": "i"}},
        ]
    total = await col.count_documents(filt)
    skip = (page - 1) * page_size
    cursor = col.find(filt, {"result_full": 0}).sort("created_at", -1).skip(skip).limit(page_size)
    items = [_serialize_doc(doc) async for doc in cursor]
    return {"success": True, "items": items, "total": total, "page": page, "page_size": page_size}


@file_center_router.get("/tool-history/{history_id}")
async def tool_history_detail(
    history_id: str,
    tool: str = Query(...),
    user: dict = Depends(get_current_user),
):
    """Get full detail of one history item (owner check)."""
    col = _get_collection(tool)
    try:
        oid = ObjectId(history_id)
    except (InvalidId, Exception):
        raise HTTPException(status_code=400, detail="Invalid history ID")
    doc = await col.find_one({"_id": oid, "user_id": user.get("id", ""), "deleted_at": {"$exists": False}})
    if not doc:
        raise HTTPException(status_code=404, detail="Record not found")
    data = _serialize_doc(doc)
    data["result"] = doc.get("result_full", "")
    return {"success": True, **data}


@file_center_router.delete("/tool-history/{history_id}")
async def tool_history_soft_delete(
    history_id: str,
    tool: str = Query(...),
    user: dict = Depends(get_current_user),
):
    """Soft-delete a history item (set deleted_at)."""
    col = _get_collection(tool)
    try:
        oid = ObjectId(history_id)
    except (InvalidId, Exception):
        raise HTTPException(status_code=400, detail="Invalid history ID")
    result = await col.update_one(
        {"_id": oid, "user_id": user.get("id", ""), "deleted_at": {"$exists": False}},
        {"$set": {"deleted_at": datetime.now(timezone.utc)}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Record not found or already deleted")
    return {"success": True}


@file_center_router.post("/tool-history/batch-delete")
async def tool_history_batch_delete(
    body: dict,
    user: dict = Depends(get_current_user),
):
    """Batch soft-delete: { tool, ids: [...] }."""
    tool = body.get("tool", "")
    ids = body.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="No IDs provided")
    col = _get_collection(tool)
    oids = []
    for h_id in ids:
        try:
            oids.append(ObjectId(h_id))
        except (InvalidId, Exception):
            pass
    if not oids:
        raise HTTPException(status_code=400, detail="No valid IDs")
    result = await col.update_many(
        {"_id": {"$in": oids}, "user_id": user.get("id", ""), "deleted_at": {"$exists": False}},
        {"$set": {"deleted_at": datetime.now(timezone.utc)}},
    )
    return {"success": True, "deleted_count": result.modified_count}


# ═══════════════════════════════════════════════════════════════════════════════
#  ADMIN endpoints — can access any user's history
# ═══════════════════════════════════════════════════════════════════════════════


@file_center_router.get("/admin/tool-history/users")
async def admin_list_history_users(admin: dict = Depends(get_admin_user)):
    """List all users who have at least one history record across all tools."""
    user_ids: set[str] = set()
    for col_name in TOOL_COLLECTIONS.values():
        ids = await db[col_name].distinct("user_id", {"deleted_at": {"$exists": False}})
        user_ids.update(ids)
    # Lookup usernames
    users: list[dict] = []
    if user_ids:
        from backend.core.utils import safe_object_id
        oids = [safe_object_id(uid, label="user") for uid in user_ids if uid]
        oids = [o for o in oids if o is not None]
        cursor = db.users.find({"_id": {"$in": oids}}, {"username": 1, "email": 1, "role": 1})
        async for u in cursor:
            users.append({
                "id": str(u["_id"]),
                "username": u.get("username", ""),
                "email": u.get("email", ""),
                "role": u.get("role", ""),
            })
    return {"success": True, "users": users}


@file_center_router.get("/admin/tool-history")
async def admin_tool_history_list(
    tool: str = Query(...),
    user_id: str = Query("", description="Filter by user ID"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    search: str = Query(""),
    admin: dict = Depends(get_admin_user),
):
    """Admin: list history items for a tool, optionally filtered by user."""
    col = _get_collection(tool)
    filt: dict = {"deleted_at": {"$exists": False}}
    if user_id:
        filt["user_id"] = user_id
    if search:
        filt["$or"] = [
            {"result_preview": {"$regex": search, "$options": "i"}},
            {"params.filename": {"$regex": search, "$options": "i"}},
            {"source.file_name": {"$regex": search, "$options": "i"}},
        ]
    total = await col.count_documents(filt)
    skip = (page - 1) * page_size
    cursor = col.find(filt, {"result_full": 0}).sort("created_at", -1).skip(skip).limit(page_size)
    items = [_serialize_doc(doc) async for doc in cursor]
    return {"success": True, "items": items, "total": total, "page": page, "page_size": page_size}


@file_center_router.get("/admin/tool-history/summary")
async def admin_tool_history_summary(
    user_id: str = Query("", description="Optional user filter"),
    admin: dict = Depends(get_admin_user),
):
    """Admin: per-tool counts, optionally for a specific user."""
    result: list[dict] = []
    for tool, col_name in TOOL_COLLECTIONS.items():
        filt: dict = {"deleted_at": {"$exists": False}}
        if user_id:
            filt["user_id"] = user_id
        count = await db[col_name].count_documents(filt)
        result.append({"tool": tool, "label": TOOL_LABELS[tool], "count": count})
    return {"success": True, "tools": result}


@file_center_router.delete("/admin/tool-history/{history_id}")
async def admin_tool_history_hard_delete(
    history_id: str,
    tool: str = Query(...),
    admin: dict = Depends(get_admin_user),
):
    """Admin: hard-delete a history item."""
    col = _get_collection(tool)
    try:
        oid = ObjectId(history_id)
    except (InvalidId, Exception):
        raise HTTPException(status_code=400, detail="Invalid history ID")
    result = await col.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Record not found")
    return {"success": True}


@file_center_router.post("/admin/tool-history/batch-delete")
async def admin_tool_history_batch_hard_delete(
    body: dict,
    admin: dict = Depends(get_admin_user),
):
    """Admin: batch hard-delete: { tool, ids: [...] }."""
    tool = body.get("tool", "")
    ids = body.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="No IDs provided")
    col = _get_collection(tool)
    oids = []
    for h_id in ids:
        try:
            oids.append(ObjectId(h_id))
        except (InvalidId, Exception):
            pass
    if not oids:
        raise HTTPException(status_code=400, detail="No valid IDs")
    result = await col.delete_many({"_id": {"$in": oids}})
    return {"success": True, "deleted_count": result.deleted_count}
