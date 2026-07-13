"""Study coach AI endpoint (/study-coze) — supports Ollama and Coze providers."""

import asyncio
import logging

from fastapi import Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from backend.core.ai_provider import resolve_provider
from backend.core.dependencies import get_ai_gateway_service
from backend.core.security import get_current_user
from backend.schemas import StudyCozeSchema

from .router import _limiter
from fastapi import APIRouter
router = APIRouter()
from .prompting import _STUDY_COZE_SYSTEM
from .chat_context_helpers import _get_rag_context_for_study
from .study_modes import get_study_mode_suffix

logger = logging.getLogger(__name__)


async def _call_study_ai(system_prompt: str, user_content: str, context: str = "", user_id: str = "study_coach", history_messages: list = None, provider: str = "local_ollama") -> str:
    ai_service = get_ai_gateway_service()
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


@router.post("/study-coze")
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

    mode_suffix = get_study_mode_suffix(mode)

    # ── RAG: retrieve relevant course material for the student ──
    rag_context_text, rag_citations = await _get_rag_context_for_study(user, content)

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
