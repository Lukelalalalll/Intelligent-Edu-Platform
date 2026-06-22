"""File Center: unified tool-history browsing for users and admins."""

from fastapi import Depends, HTTPException, Query

from backend.core.security import get_admin_user, get_current_user
from backend.services.history_service import (
    TOOL_COLLECTIONS,
    batch_hard_delete_history,
    batch_soft_delete_history,
    enrich_slides_history_detail,
    get_history_document,
    hard_delete_history,
    list_history,
    list_history_users,
    serialize_history_doc,
    soft_delete_history,
    summarize_tools,
)

from .router import file_center_router

ALL_TOOLS = list(TOOL_COLLECTIONS.keys())


@file_center_router.get("/tool-history/summary")
async def tool_history_summary(user: dict = Depends(get_current_user)):
    return {"success": True, "tools": await summarize_tools(user_id=user.get("id", ""))}


@file_center_router.get("/tool-history")
async def tool_history_list(
    tool: str = Query(..., description="Tool key, e.g. slides"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    search: str = Query("", description="Text search in preview/params"),
    user: dict = Depends(get_current_user),
):
    docs, total = await list_history(
        tools=(tool,),
        user_id=user.get("id", ""),
        page=page,
        page_size=page_size,
        search=search,
    )
    return {
        "success": True,
        "items": [serialize_history_doc(doc) for doc in docs],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@file_center_router.get("/tool-history/{history_id}")
async def tool_history_detail(
    history_id: str,
    tool: str = Query(...),
    user: dict = Depends(get_current_user),
):
    doc = await get_history_document(
        tools=(tool,),
        history_id=history_id,
        user_id=user.get("id", ""),
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Record not found")
    payload = serialize_history_doc(doc, include_result=True)
    if tool == "slides":
        payload = await enrich_slides_history_detail(payload)
    return {"success": True, **payload}


@file_center_router.delete("/tool-history/{history_id}")
async def tool_history_soft_delete(
    history_id: str,
    tool: str = Query(...),
    user: dict = Depends(get_current_user),
):
    if await soft_delete_history(tool=tool, history_id=history_id, user_id=user.get("id", "")) == 0:
        raise HTTPException(status_code=404, detail="Record not found or already deleted")
    return {"success": True}


@file_center_router.post("/tool-history/batch-delete")
async def tool_history_batch_delete(
    body: dict,
    user: dict = Depends(get_current_user),
):
    tool = body.get("tool", "")
    ids = body.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="No IDs provided")
    deleted_count = await batch_soft_delete_history(tool=tool, history_ids=ids, user_id=user.get("id", ""))
    return {"success": True, "deleted_count": deleted_count}


@file_center_router.get("/admin/tool-history/users")
async def admin_list_history_users(admin: dict = Depends(get_admin_user)):
    return {"success": True, "users": await list_history_users()}


@file_center_router.get("/admin/tool-history")
async def admin_tool_history_list(
    tool: str = Query(...),
    user_id: str = Query("", description="Filter by user ID"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    search: str = Query(""),
    admin: dict = Depends(get_admin_user),
):
    docs, total = await list_history(
        tools=(tool,),
        user_id=user_id or None,
        page=page,
        page_size=page_size,
        search=search,
    )
    return {
        "success": True,
        "items": [serialize_history_doc(doc) for doc in docs],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@file_center_router.get("/admin/tool-history/summary")
async def admin_tool_history_summary(
    user_id: str = Query("", description="Optional user filter"),
    admin: dict = Depends(get_admin_user),
):
    return {"success": True, "tools": await summarize_tools(user_id=user_id or None)}


@file_center_router.delete("/admin/tool-history/{history_id}")
async def admin_tool_history_hard_delete(
    history_id: str,
    tool: str = Query(...),
    admin: dict = Depends(get_admin_user),
):
    if await hard_delete_history(tool=tool, history_id=history_id) == 0:
        raise HTTPException(status_code=404, detail="Record not found")
    return {"success": True}


@file_center_router.post("/admin/tool-history/batch-delete")
async def admin_tool_history_batch_hard_delete(
    body: dict,
    admin: dict = Depends(get_admin_user),
):
    tool = body.get("tool", "")
    ids = body.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="No IDs provided")
    deleted_count = await batch_hard_delete_history(tool=tool, history_ids=ids)
    return {"success": True, "deleted_count": deleted_count}
