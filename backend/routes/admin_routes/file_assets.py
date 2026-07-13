"""File asset CRUD, download, audit, and stats endpoints."""
from __future__ import annotations

import base64
import os

from fastapi import Depends, HTTPException, Query
from fastapi.responses import FileResponse, Response

from backend.config import Config
from backend.core.security import get_admin_user
from backend.repositories import ai_session_repo, file_asset_repo
from backend.services.files.file_asset_service import (
    list_assets, get_asset, soft_delete_asset,
    restore_asset, hard_delete_asset, run_audit,
    _absolute_from_storage_path,
)
from fastapi import APIRouter
router = APIRouter()


@router.get("/files/assets")
async def list_file_assets(
    file_type: str = Query(default="", max_length=64),
    status: str = Query(default="", max_length=32),
    owner_type: str = Query(default="", max_length=64),
    course_id: str = Query(default="", max_length=128),
    created_by: str = Query(default="", max_length=64),
    q: str = Query(default="", max_length=120),
    limit: int = Query(default=100, ge=1, le=300),
    skip: int = Query(default=0, ge=0),
    admin: dict = Depends(get_admin_user),
):
    data = await list_assets(
        file_type=file_type,
        status=status,
        owner_type=owner_type,
        course_id=course_id,
        created_by=created_by,
        q=q,
        limit=limit,
        skip=skip,
    )
    return data


@router.get("/files/assets/{asset_id}")
async def get_file_asset(asset_id: str, admin: dict = Depends(get_admin_user)):
    asset = await get_asset(asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return {"asset": asset}


@router.post("/files/assets/{asset_id}/soft-delete")
async def soft_delete_file_asset(asset_id: str, req: dict, admin: dict = Depends(get_admin_user)):
    actor_id = str(admin.get("_id", ""))
    reason = str((req or {}).get("reason", "") or "").strip()
    asset = await soft_delete_asset(asset_id, actor_id=actor_id, reason=reason)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return {"asset": asset}


@router.post("/files/assets/{asset_id}/restore")
async def restore_file_asset(asset_id: str, admin: dict = Depends(get_admin_user)):
    actor_id = str(admin.get("_id", ""))
    asset = await restore_asset(asset_id, actor_id=actor_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found or not soft deleted")
    return {"asset": asset}


@router.post("/files/assets/{asset_id}/hard-delete")
async def hard_delete_file_asset(asset_id: str, admin: dict = Depends(get_admin_user)):
    actor_id = str(admin.get("_id", ""))
    result = await hard_delete_asset(asset_id, actor_id=actor_id)
    if not result:
        raise HTTPException(status_code=404, detail="Asset not found")
    if result.get("blocked"):
        raise HTTPException(status_code=409, detail=f"Delete blocked: {result.get('reason', 'referenced')}")
    return {"asset": result}


@router.get("/files/assets/{asset_id}/download")
async def download_file_asset(asset_id: str, admin: dict = Depends(get_admin_user)):
    asset = await get_asset(asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    storage_path = str(asset.get("storage_path", ""))
    if storage_path.startswith("mongo://"):
        session_id = asset.get("session_id")
        meta = asset.get("metadata", {})
        msg_idx = meta.get("message_index")
        img_idx = meta.get("image_index")
        sess = await ai_session_repo.find_by_id(session_id)
        if sess:
            msgs = sess.get("messages", [])
            if 0 <= msg_idx < len(msgs):
                imgs = msgs[msg_idx].get("images", [])
                if 0 <= img_idx < len(imgs):
                    b64_data = imgs[img_idx]
                    if b64_data.startswith("data:image"):
                        _, b64_data = b64_data.split(",", 1)
                    content = base64.b64decode(b64_data)
                    return Response(content=content, media_type="image/jpeg", headers={"Content-Disposition": f"attachment; filename=\"{asset.get('filename')}\""})
        raise HTTPException(status_code=404, detail="Mongo base64 image not found")

    path = _absolute_from_storage_path(storage_path)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File missing from disk")
    return FileResponse(path, filename=asset.get("filename", "download"))


@router.get("/files/audit")
async def audit_file_assets(admin: dict = Depends(get_admin_user)):
    result = await run_audit()
    return result


@router.get("/files/stats")
async def file_asset_stats(admin: dict = Depends(get_admin_user)):
    rows = []
    for item in await file_asset_repo.aggregate_stats_by_type_and_status():
        rows.append({
            "file_type": item.get("_id", {}).get("file_type", ""),
            "status": item.get("_id", {}).get("status", ""),
            "count": int(item.get("count", 0) or 0),
            "total_size": int(item.get("total_size", 0) or 0),
        })
    return {"rows": rows}

