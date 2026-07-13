"""Study notes generation history endpoints."""
import json

from fastapi import Depends, HTTPException, Query

from backend.core.security import get_current_user
from backend.services.history_service import get_history_document, list_history, serialize_history_doc

from .router import study_notes_router


@study_notes_router.get("/generation_history")
async def get_generation_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    current_user: dict = Depends(get_current_user),
):
    docs, total = await list_history(
        tools=("study_notes",),
        user_id=str(current_user.get("id") or current_user.get("_id") or ""),
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


@study_notes_router.get("/generation_history/{history_id}")
async def get_generation_detail(history_id: str, current_user: dict = Depends(get_current_user)):
    doc = await get_history_document(
        tools=("study_notes",),
        history_id=history_id,
        user_id=str(current_user.get("id") or current_user.get("_id") or ""),
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Record not found")
    return {"success": True, **serialize_history_doc(doc, include_result=True)}


@study_notes_router.post("/generation_history/{history_id}/replay")
async def replay_generation_history(history_id: str, current_user: dict = Depends(get_current_user)):
    """Return stored result for replay without regeneration."""
    doc = await get_history_document(
        tools=("study_notes",),
        history_id=history_id,
        user_id=str(current_user.get("id") or current_user.get("_id") or ""),
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Record not found")

    params = doc.get("params", {})
    result_full = doc.get("result_full", "")
    if params.get("tool") == "generate_flashcards":
        try:
            parsed_result = json.loads(result_full) if isinstance(result_full, str) else result_full
        except (json.JSONDecodeError, TypeError):
            parsed_result = {"raw": result_full}
    else:
        parsed_result = {"notes": result_full}

    return {"success": True, "params": params, "result": parsed_result}
