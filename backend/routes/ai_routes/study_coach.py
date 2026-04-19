"""Study coach AI endpoint (/study-coze) — supports Ollama and Coze providers."""

import asyncio
import logging

from fastapi import Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from backend.config import Config
from backend.core.ai_provider import resolve_provider
from backend.core.security import get_current_user
from backend.schemas import StudyCozeSchema
from backend.services.rag_chat_pipeline import pack_evidence

from .router import ai_router, _limiter
from .prompting import _STUDY_COZE_SYSTEM
from .chat_context_helpers import _build_evidence_cards

logger = logging.getLogger(__name__)


async def _call_study_ai(system_prompt: str, user_content: str, context: str = "", user_id: str = "study_coach", history_messages: list = None, provider: str = "local_ollama") -> str:
    from backend.services.ai_gateway_service import AIGatewayService
    from backend.services.local_llm_service import LocalLLMUnavailableError
    ai_service = AIGatewayService()
    ai_context = {
        "system_override": system_prompt,
        "system_memory": "" if not context else f"Here is the document I am studying:\n{context[:8000]}",
        "chat_history": history_messages or [],
        "coze_user_id": user_id
    }
    # allow_fallback=False: if user explicitly chose a provider, don't silently switch
    return await ai_service.chat_with_provider(
        message=user_content,
        context=ai_context,
        provider=provider,
        allow_fallback=False,
    )


@ai_router.post("/study-coze")
@_limiter.limit("20/minute")
async def study_coze(request: Request, req: StudyCozeSchema, user: dict = Depends(get_current_user)):
    """Non-streaming Coze study coach. Returns { reply: str, citations: list }."""
    content = req.content.strip()
    mode = req.mode
    context = (req.context or "").strip()
    history = [m.model_dump() for m in (req.messages or [])]
    resolved_provider = resolve_provider(req.provider, feature="study_coach", user=user)

    if not content:
        raise HTTPException(400, "No content provided")

    mode_suffix = ""
    if mode == "hint":
        mode_suffix = (
            "\n\nThe student selected this text as something they want to understand "
            "— provide a Socratic hint, not an explanation."
        )
    elif mode == "explain":
        mode_suffix = "\n\nExplain this concept in simple terms with an analogy."

    # ── RAG: retrieve relevant course material for the student ──
    rag_context_text = ""
    rag_citations: list[dict] = []
    try:
        from backend.services.course_rag_service import course_rag_service
        from backend.routes.auth_routes import get_profile_courses

        profile = await get_profile_courses(user)
        student_course_ids = [c["courseId"] for c in profile.get("courses", []) if c.get("courseId")]

        if student_course_ids:
            rag_results = course_rag_service.retrieve_for_student(
                student_id=str(user.get("_id", user.get("id", ""))),
                query=content,
                top_k=max(1, int(Config.RAG_RETRIEVE_TOP_N)),
                course_ids=student_course_ids,
            )
            packed = pack_evidence(
                rag_results,
                answer_top_k=4,
                max_total_chars=Config.RAG_EVIDENCE_MAX_CHARS,
                max_chars_per_chunk=Config.RAG_EVIDENCE_MAX_CHARS_PER_CHUNK,
            )
            if packed:
                rag_citations = packed
                rag_context_text = _build_evidence_cards(rag_citations)
    except Exception:
        logger.debug("Study coach RAG retrieval unavailable, proceeding without")

    system = _STUDY_COZE_SYSTEM + mode_suffix + rag_context_text

    # Use per-user id so Coze doesn't mix conversations across students
    coze_user_id = f"study_{str(user.get('_id', 'anon'))}"

    # Timeout budget: Ollama heavy profile can take up to 150 s on a loaded GPU
    _timeout = 150.0
    try:
        reply = await asyncio.wait_for(
            _call_study_ai(system, content, context=context, user_id=coze_user_id, history_messages=history, provider=resolved_provider),
            timeout=_timeout,
        )
        return JSONResponse({"reply": reply, "citations": rag_citations})
    except asyncio.TimeoutError:
        raise HTTPException(504, "AI study coach timed out — the model is taking too long, please try again")
    except HTTPException:
        raise
    except Exception as exc:
        err_str = str(exc)
        # Surface a clear provider-specific error instead of a generic 500
        if "Local" in err_str or "Ollama" in err_str or "health check" in err_str.lower():
            raise HTTPException(503, f"Local Ollama is unavailable: {err_str}")
        logger.exception("study-coach error")
        raise HTTPException(500, "AI study coach encountered an internal error")
