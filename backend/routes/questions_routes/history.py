"""Generation history CRUD endpoints."""
from __future__ import annotations

import os
import uuid

from fastapi import Depends, HTTPException, Query, Request

from backend.config import Config
from backend.core.security import get_current_user
from backend.services.history_service import get_history_document, list_history, serialize_history_doc

from .router import questions_router, _set_task


@questions_router.get("/generation_history")
async def get_generation_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    user: dict = Depends(get_current_user),
):
    docs, total = await list_history(
        tools=("questions",),
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


@questions_router.get("/generation_history/{history_id}")
async def get_generation_detail(history_id: str, user: dict = Depends(get_current_user)):
    doc = await get_history_document(
        tools=("questions",),
        history_id=history_id,
        user_id=user.get("id", ""),
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Record not found")
    return {"success": True, **serialize_history_doc(doc, include_result=True)}


@questions_router.post("/generation_history/{history_id}/replay")
async def replay_generation_history(history_id: str, request: Request, user: dict = Depends(get_current_user)):
    """Rebuild a fresh sub2 task from a history record so replay can restore the uploaded source file context."""
    doc = await get_history_document(
        tools=("questions",),
        history_id=history_id,
        user_id=user.get("id", ""),
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Record not found")

    source = doc.get("source", {}) or {}
    source_path = str(source.get("file_path", "") or "")
    if not source_path:
        raise HTTPException(status_code=400, detail="This history record has no replayable source file.")

    source_abs = os.path.abspath(source_path)
    upload_root_abs = os.path.abspath(Config.UPLOAD_FOLDER_SUB2)
    if not source_abs.startswith(upload_root_abs):
        raise HTTPException(status_code=400, detail="Replay source path is invalid.")
    if not os.path.exists(source_abs):
        raise HTTPException(status_code=404, detail="Source file no longer exists on server.")

    file_type = str(source.get("file_type", "") or "").strip() or ("pdf" if source_abs.lower().endswith(".pdf") else "image")
    total_pages = int(source.get("total_pages", 0) or 0)
    if file_type == "pdf" and total_pages <= 0:
        try:
            import PyPDF2
            with open(source_abs, "rb") as f:
                reader = PyPDF2.PdfReader(f)
                total_pages = len(reader.pages)
        except Exception:
            total_pages = 0

    new_task_id = uuid.uuid4().hex[:12]
    replay_task = {
        "uploaded_file": source_abs,
        "uploaded_filename": str(source.get("file_name") or os.path.basename(source_abs)),
        "file_type": file_type,
        "total_pages": total_pages,
    }
    _set_task(request, new_task_id, replay_task)

    params = doc.get("params", {}) or {}
    return {
        "success": True,
        "task_id": new_task_id,
        "filename": replay_task["uploaded_filename"],
        "file_type": file_type,
        "total_pages": total_pages,
        "page_numbers": params.get("page_numbers", []),
        "source_type": params.get("source_type", "pdf"),
    }
