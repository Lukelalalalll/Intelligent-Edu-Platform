"""AI Memory endpoints and auxiliary info routes (role-info, provider-health, extract-pdf-text)."""

import logging

from fastapi import Depends, File, HTTPException, UploadFile

from backend.core.database import db
from backend.core.security import get_current_user

from .router import ai_router, _SUPPORTED_PROVIDERS, ai_gateway_service
from .chat_context_helpers import _extract_text_from_pdf_bytes, _PDF_EXTRACT_MAX_CHARS

logger = logging.getLogger(__name__)


@ai_router.get("/provider-health")
async def provider_health(provider: str = "local_ollama", user: dict = Depends(get_current_user)):
    selected = str(provider or "local_ollama").strip().lower()
    if selected not in _SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {selected}")
    ok, detail = await ai_gateway_service.check_provider_health(selected)
    return {"provider": selected, "ok": ok, "detail": detail}


@ai_router.post("/extract-pdf-text")
async def extract_pdf_text(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    filename = str(getattr(file, "filename", "") or "").strip()
    if not filename.lower().endswith(".pdf") and str(getattr(file, "content_type", "") or "") != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty PDF file")

    text = _extract_text_from_pdf_bytes(data, max_chars=_PDF_EXTRACT_MAX_CHARS)
    return {
        "filename": filename or "attachment.pdf",
        "text": text,
        "char_count": len(text),
        "has_text": bool(text),
    }


@ai_router.get("/role-info")
async def get_ai_role_info(user: dict = Depends(get_current_user)):
    """Return the user's role and whether Socratic/RAG mode is active."""
    role = user.get("role", "student")
    is_student = role not in ("teacher", "admin")
    rag_indexed_courses: list[str] = []
    try:
        from backend.services.course_rag_service import course_rag_service
        rag_indexed_courses = course_rag_service.get_indexed_courses_for_student(
            str(user.get("_id", user.get("id", "")))
        )
    except Exception as exc:
        logger.warning("Failed to load indexed courses for role-info | user=%s err=%s", str(user.get("id") or ""), str(exc)[:240])
    return {
        "role": role,
        "mode": "socratic" if is_student else "direct",
        "rag_active": len(rag_indexed_courses) > 0,
        "rag_courses": rag_indexed_courses,
    }


@ai_router.get("/memory")
async def get_ai_memory(user: dict = Depends(get_current_user)):
    """Return the user's AI memory profile."""
    user_doc = await db.users.find_one({"_id": user["_id"]})
    memory = (user_doc or {}).get("ai_memory", {})
    return {"memory": memory}


@ai_router.put("/memory")
async def update_ai_memory(body: dict, user: dict = Depends(get_current_user)):
    """Update the user's AI memory profile. Accepts { name, major, year, preferences }."""
    allowed_keys = {"name", "major", "year", "preferences"}
    sanitized = {}
    for k in allowed_keys:
        val = str(body.get(k, "") or "").strip()[:200]
        sanitized[k] = val
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"ai_memory": sanitized}},
    )
    return {"memory": sanitized}
