"""Diagram generation history: list, detail, replay."""
from fastapi import Depends, HTTPException, Query

from backend.core.security import get_current_user
from backend.services.history_service import get_history_document, list_history, serialize_history_doc

from .router import diagram_router


@diagram_router.get("/generation_history")
async def get_generation_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    user: dict = Depends(get_current_user),
):
    """Return paginated visual-tool history (diagram + image-extractor) for the current user."""
    docs, total = await list_history(
        tools=("diagram", "image_extractor"),
        user_id=user.get("id", ""),
        page=page,
        page_size=page_size,
    )
    items = [serialize_history_doc(doc) for doc in docs]
    for item in items:
        item["source_coll"] = "sub3" if item.get("tool_key") == "image_extractor" else "sub4"
    return {"success": True, "items": items, "total": total, "page": page, "page_size": page_size}


@diagram_router.get("/generation_history/{history_id}")
async def get_generation_detail(history_id: str, user: dict = Depends(get_current_user)):
    doc = await get_history_document(
        tools=("diagram", "image_extractor"),
        history_id=history_id,
        user_id=user.get("id", ""),
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Record not found")
    return {"success": True, **serialize_history_doc(doc, include_result=True)}


@diagram_router.post("/generation_history/{history_id}/replay")
async def replay_generation_history(history_id: str, user: dict = Depends(get_current_user)):
    doc = await get_history_document(
        tools=("diagram", "image_extractor"),
        history_id=history_id,
        user_id=user.get("id", ""),
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Record not found")
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
