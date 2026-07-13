"""AI Memory endpoints and auxiliary info routes (role-info, provider-health, extract-pdf-text)."""

import asyncio
import logging

from fastapi import Depends, File, HTTPException, UploadFile

from backend.core.dependencies import get_ai_gateway_service
from backend.core.security import get_current_user
from backend.services.ai.ai_memory_service import get_ai_memory as get_user_ai_memory
from backend.services.ai.ai_memory_service import update_ai_memory as update_user_ai_memory
from backend.services.ai.ai_interact_runtime_cache import (
    get_provider_health_cache,
    get_role_info_cache,
    invalidate_provider_health_cache,
    invalidate_role_info_cache,
    set_provider_health_cache,
    set_role_info_cache,
)

from .router import _SUPPORTED_PROVIDERS
from fastapi import APIRouter
router = APIRouter()
from .chat_context_helpers import _extract_text_from_pdf_bytes, _PDF_EXTRACT_MAX_CHARS

logger = logging.getLogger(__name__)


@router.get("/provider-health")
async def provider_health(provider: str = "local_ollama", user: dict = Depends(get_current_user)):
    selected = str(provider or "local_ollama").strip().lower()
    if selected not in _SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {selected}")
    cached = get_provider_health_cache(user, selected)
    if cached is not None:
        return cached
    if selected == "deepseek":
        from backend.services.llm_service.deepseek_service import DeepSeekService
        from backend.services.auth.user_profile_service import load_deepseek_runtime_config

        ok, detail = await DeepSeekService.from_config(
            await load_deepseek_runtime_config(user)
        ).health_check()
        result = {"provider": selected, "ok": ok, "detail": detail}
        set_provider_health_cache(user, selected, result)
        return result

    if selected == "openai":
        from backend.services.auth.user_profile_service import load_openai_runtime_config
        from backend.services.llm_service.openai_service import OpenAIService

        ok, detail = await OpenAIService.from_config(
            await load_openai_runtime_config(user)
        ).health_check()
        result = {"provider": selected, "ok": ok, "detail": detail}
        set_provider_health_cache(user, selected, result)
        return result

    if selected == "bigmodel":
        from backend.services.auth.user_profile_service import load_bigmodel_runtime_config
        from backend.services.llm_service.openai_service import OpenAIService

        ok, detail = await OpenAIService.from_config(
            await load_bigmodel_runtime_config(user)
        ).health_check()
        result = {"provider": selected, "ok": ok, "detail": detail}
        set_provider_health_cache(user, selected, result)
        return result

    ai_gateway_service = get_ai_gateway_service()
    ok, detail = await ai_gateway_service.check_provider_health(selected)
    result = {"provider": selected, "ok": ok, "detail": detail}
    set_provider_health_cache(user, selected, result)
    return result


@router.post("/extract-pdf-text")
async def extract_pdf_text(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    filename = str(getattr(file, "filename", "") or "").strip()
    if not filename.lower().endswith(".pdf") and str(getattr(file, "content_type", "") or "") != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty PDF file")

    loop = asyncio.get_event_loop()
    text = await loop.run_in_executor(None, _extract_text_from_pdf_bytes, data, _PDF_EXTRACT_MAX_CHARS)
    return {
        "filename": filename or "attachment.pdf",
        "text": text,
        "char_count": len(text),
        "has_text": bool(text),
    }


@router.get("/role-info")
async def get_ai_role_info(user: dict = Depends(get_current_user)):
    """Return the user's role and whether Socratic/RAG mode is active."""
    cached = get_role_info_cache(user)
    if cached is not None:
        return cached
    role = user.get("role", "student")
    is_student = role not in ("teacher", "admin")
    user_id = str(user.get("_id") or user.get("id") or "")
    rag_indexed_courses: list[str] = []
    try:
        from backend.services.course_rag_service import course_rag_service
        from backend.services.student.enrollment_service import get_user_course_profile

        indexed_course_ids = {
            str(course_id)
            for course_id in course_rag_service.get_indexed_courses_for_student(
                user_id
            )
            if str(course_id)
        }
        profile = await get_user_course_profile(user)
        enrolled_course_ids = [
            str(course.get("courseId"))
            for course in profile.get("courses", [])
            if course.get("courseId")
        ]
        rag_indexed_courses = [
            course_id for course_id in enrolled_course_ids if course_id in indexed_course_ids
        ]
    except Exception as exc:
        logger.warning(
            "Failed to load indexed courses for role-info | user=%s err=%s",
            user_id,
            str(exc)[:240],
        )
    result = {
        "role": role,
        "mode": "socratic" if is_student else "direct",
        "rag_active": len(rag_indexed_courses) > 0,
        "rag_courses": rag_indexed_courses,
    }
    set_role_info_cache(user, result)
    return result


@router.get("/memory")
async def get_ai_memory(user: dict = Depends(get_current_user)):
    """Return the user's AI memory profile."""
    memory = await get_user_ai_memory(str(user.get("_id") or user.get("id") or ""))
    return {"memory": memory}


@router.put("/memory")
async def update_ai_memory(body: dict, user: dict = Depends(get_current_user)):
    """Update the user's AI memory profile. Accepts { name, major, year, preferences }."""
    sanitized = await update_user_ai_memory(str(user.get("_id") or user.get("id") or ""), body)
    invalidate_role_info_cache(user)
    invalidate_provider_health_cache(user)
    return {"memory": sanitized}

