"""Generation history CRUD endpoints."""
from __future__ import annotations

import json
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from backend.config import Config
from backend.core.security import get_current_user
from backend.schemas import QuestionHistoryFinalizeSchema
from backend.services.history_service import (
    get_history_document,
    list_history,
    serialize_history_doc,
    update_history_record,
)
from backend.services.questions import build_questions_markdown, normalize_question_drafts

from .router import _set_task

router = APIRouter()


def _serialize_question_history(doc: dict, *, include_result: bool = False) -> dict:
    payload = serialize_history_doc(doc, include_result=include_result)
    if not include_result:
        return payload

    raw_result = payload.get("result", "")
    parsed_result = raw_result
    if isinstance(raw_result, str):
        try:
            parsed_result = json.loads(raw_result)
        except Exception:
            parsed_result = raw_result

    if isinstance(parsed_result, dict):
        payload["result_data"] = parsed_result
        payload["result_markdown"] = str(parsed_result.get("markdown") or "")
        payload["question_drafts"] = normalize_question_drafts(parsed_result.get("questions") or [])
        payload["selected_question_ids"] = [
            str(item)
            for item in parsed_result.get("selected_question_ids", [])
            if str(item or "").strip()
        ]
    else:
        payload["result_markdown"] = str(parsed_result or "")
        payload["question_drafts"] = normalize_question_drafts([])
        payload["selected_question_ids"] = []
    return payload


@router.get("/generation_history")
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
        "items": [_serialize_question_history(doc) for doc in docs],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/generation_history/{history_id}")
async def get_generation_detail(history_id: str, user: dict = Depends(get_current_user)):
    doc = await get_history_document(
        tools=("questions",),
        history_id=history_id,
        user_id=user.get("id", ""),
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Record not found")
    return {"success": True, **_serialize_question_history(doc, include_result=True)}


@router.post("/generation_history/{history_id}/replay")
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
        "provider_requested": params.get("provider_requested"),
        "provider_resolved": params.get("provider_resolved") or source.get("provider_resolved"),
        "provider_source": params.get("provider_source") or source.get("provider_source"),
        "effective_model": params.get("effective_model") or source.get("effective_model"),
    }


@router.post("/generation_history/{history_id}/finalize")
async def finalize_generation_history(
    history_id: str,
    payload: QuestionHistoryFinalizeSchema,
    user: dict = Depends(get_current_user),
):
    doc = await get_history_document(
        tools=("questions",),
        history_id=history_id,
        user_id=user.get("id", ""),
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Record not found")

    questions = normalize_question_drafts([item.model_dump() for item in payload.questions])
    markdown = str(payload.markdown or "").strip() or build_questions_markdown(questions)
    selected_question_ids = [
        str(item)
        for item in payload.selected_question_ids
        if str(item or "").strip()
    ]
    params = dict(doc.get("params", {}) or {})
    params.update({
        "finalized": True,
        "question_count": len(questions),
        "selected_question_ids": selected_question_ids,
    })
    result_full = {
        "markdown": markdown,
        "questions": questions,
        "selected_question_ids": selected_question_ids,
        "finalized": True,
    }
    updated = await update_history_record(
        tool="questions",
        history_id=history_id,
        user_id=user.get("id", ""),
        params=params,
        result_preview=markdown[:500],
        result_full=result_full,
    )
    if updated == 0:
        raise HTTPException(status_code=409, detail="History record could not be updated")
    return {"success": True, "history_id": history_id}
