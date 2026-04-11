"""Main /chat streaming endpoint."""

import asyncio
import json
import logging
import time

from fastapi import Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from backend.config import Config
from backend.core.database import db
from backend.core.security import get_current_user
from backend.schemas import AiChatSchema
from backend.services.local_llm_service import LocalLLMUnavailableError
from backend.services.rag_chat_pipeline import (
    postcheck_and_downgrade,
    task_profile_for_phase,
)

from .router import ai_router, _limiter, _SUPPORTED_PROVIDERS, ai_gateway_service
from .prompting import (
    _TEACHER_SYSTEM_MSG,
    _STUDENT_SYSTEM_MSG,
    _STUDENT_TUTOR_MODE_MSG,
    _STUDENT_DOC_SUMMARY_MODE_MSG,
    _STUDENT_HINT_MODE_MSG,
)
from .helpers import (
    _chunk_text,
    _compact_chat_history,
    _is_document_summary_request,
    _looks_truncated_response,
    _sanitize_answer_text,
    _split_user_prompt_and_attachment_text,
)
from .rag_orchestrator import run_student_rag

logger = logging.getLogger(__name__)


@ai_router.post("/chat")
@_limiter.limit("30/minute")
async def ai_chat(request: Request, req: AiChatSchema, user: dict = Depends(get_current_user)):  # noqa: C901  # NOSONAR
    if not req.messages:
        raise HTTPException(status_code=400, detail="No messages")

    cleaned = [m for m in req.messages if isinstance(m, dict)]
    if not cleaned:
        raise HTTPException(status_code=400, detail="No valid messages")

    user_messages = [m for m in cleaned if str(m.get("role", "")).lower() == "user"]
    if not user_messages:
        raise HTTPException(status_code=400, detail="No user message")

    latest_user_message = str(user_messages[-1].get("content", "")).strip()
    prompt_only_message, uploaded_attachment_text = _split_user_prompt_and_attachment_text(latest_user_message)
    effective_question = prompt_only_message or latest_user_message
    latest_user_images = user_messages[-1].get("images", [])
    tutor_mode = str(getattr(req, "tutor_mode", "tutor") or "tutor").strip().lower()
    if tutor_mode not in {"tutor", "hint_only"}:
        tutor_mode = "tutor"

    if not latest_user_message and not latest_user_images:
        raise HTTPException(status_code=400, detail="Latest user message is empty")

    requested_provider = str(req.provider or Config.AI_DEFAULT_PROVIDER or "local_ollama").strip().lower()
    if requested_provider not in _SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {requested_provider}")
    if not Config.AI_ALLOW_PROVIDER_SWITCH and req.provider and req.provider != Config.AI_DEFAULT_PROVIDER:
        raise HTTPException(status_code=403, detail="Provider switching is disabled")

    resolved_provider = requested_provider

    # Load user's AI memory to inject as context
    user_doc = await db.users.find_one({"_id": user["_id"]})
    ai_memory = (user_doc or {}).get("ai_memory", {})
    memory_text = ""
    if ai_memory:
        parts = []
        if ai_memory.get("name"):
            parts.append(f"Name: {ai_memory['name']}")
        if ai_memory.get("major"):
            parts.append(f"Major: {ai_memory['major']}")
        if ai_memory.get("year"):
            parts.append(f"Year: {ai_memory['year']}")
        if ai_memory.get("preferences"):
            parts.append(f"Preferences: {ai_memory['preferences']}")
        if parts:
            memory_text = "Student profile — " + "; ".join(parts) + ". Adapt your responses to this student's background."

    # ── Role-based behaviour ──
    role = user.get("role", "student")
    is_student = role not in ("teacher", "admin")

    # Build RAG context for students (retrieve relevant course material)
    rag_context_text = ""
    rag_citations: list[dict] = []
    rag_top_k = max(1, int(Config.RAG_ANSWER_TOP_K))
    rag_retrieve_top_n = max(rag_top_k, int(Config.RAG_RETRIEVE_TOP_N))
    rag_retry_used = False
    rag_retry_success = False
    rag_empty_after_retry = False
    rag_retrieval_query = effective_question
    rag_rewritten_query = effective_question
    rag_retrieval_latency_ms = 0.0
    student_course_ids: list[str] = []
    forced_response_message = ""
    compact_history = _compact_chat_history(cleaned[:-1])

    if is_student:
        rag = await run_student_rag(
            user=user,
            effective_question=effective_question,
            uploaded_attachment_text=uploaded_attachment_text,
            tutor_mode=tutor_mode,
            resolved_provider=resolved_provider,
            cleaned_messages=cleaned,
        )
        rag_context_text = rag["rag_context_text"]
        rag_citations = rag["rag_citations"]
        rag_top_k = rag["rag_top_k"]
        rag_retrieve_top_n = rag["rag_retrieve_top_n"]
        rag_retry_used = rag["rag_retry_used"]
        rag_retry_success = rag["rag_retry_success"]
        rag_empty_after_retry = rag["rag_empty_after_retry"]
        rag_retrieval_query = rag["rag_retrieval_query"]
        rag_rewritten_query = rag["rag_rewritten_query"]
        rag_retrieval_latency_ms = rag["rag_retrieval_latency_ms"]
        student_course_ids = rag["student_course_ids"]
        forced_response_message = rag["forced_response_message"]
        compact_history = rag["compact_history"]

    # System override: Socratic prompt for students, default for teachers
    system_override = None
    if is_student:
        if tutor_mode == "hint_only":
            mode_prompt = _STUDENT_HINT_MODE_MSG
        elif _is_document_summary_request(effective_question, uploaded_attachment_text):
            mode_prompt = _STUDENT_DOC_SUMMARY_MODE_MSG
        else:
            mode_prompt = _STUDENT_TUTOR_MODE_MSG
        system_override = _STUDENT_SYSTEM_MSG + "\n\n" + mode_prompt + rag_context_text

    context = {
        "chat_history": compact_history,
        "system_memory": memory_text,
        "coze_user_id": f"chat_{str(user.get('_id', user.get('id', 'anon')))}",
        "system_override": system_override,
        "images": latest_user_images,
        "task_profile": task_profile_for_phase("answer"),
    }

    async def generate_async():
        try:
            meta: dict = {
                "provider": resolved_provider,
                "requested_provider": requested_provider,
                "tutor_mode": tutor_mode,
                "rag_top_k": rag_top_k,
                "rag_retrieve_top_n": rag_retrieve_top_n,
                "rag_retrieval_query": rag_retrieval_query,
                "rag_rewritten_query": rag_rewritten_query,
                "rag_retry_used": rag_retry_used,
                "rag_retry_success": rag_retry_success,
                "rag_empty_after_retry": rag_empty_after_retry,
                "rag_retrieval_latency_ms": rag_retrieval_latency_ms,
            }

            # Emit RAG citations as metadata before content begins
            if rag_citations:
                meta["citations"] = rag_citations

            if is_student and forced_response_message:
                meta["warning"] = "insufficient_evidence"
                yield f"data: {json.dumps({'meta': meta}, ensure_ascii=False)}\n\n"
                for part in _chunk_text(forced_response_message, size=2):
                    data = {"choices": [{"delta": {"content": part}}]}
                    yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
                    await asyncio.sleep(0.01)
                yield "data: [DONE]\n\n"
                try:
                    from backend.infrastructure.rag_telemetry import rag_telemetry
                    await rag_telemetry.record(
                        user_id=str(user.get("_id", user.get("id", ""))),
                        role="student",
                        course_ids=student_course_ids,
                        query=latest_user_message,
                        result_count=0,
                        latency_ms=rag_retrieval_latency_ms,
                        use_hybrid=True,
                        top_k=rag_retrieve_top_n,
                        metadata={
                            "retry_used": rag_retry_used,
                            "retry_success": rag_retry_success,
                            "empty_after_retry": True,
                            "answer_latency_ms": 0,
                            "postcheck_downgraded": 0,
                            "phase": "insufficient_evidence",
                        },
                    )
                except Exception:
                    logger.exception("Failed to record insufficient-evidence telemetry")
                return

            if resolved_provider == "local_ollama":
                try:
                    from backend.services.local_llm_service import LocalLLMService
                    local_svc = LocalLLMService()
                    # Check health before generation so we can fallback gracefully
                    is_healthy, msg = await local_svc.health_check()
                    if not is_healthy:
                        raise LocalLLMUnavailableError(f"Health check failed: {msg}")
                    
                    answer_t0 = time.perf_counter()
                    yield f"data: {json.dumps({'meta': meta}, ensure_ascii=False)}\n\n"
                    if is_student and Config.RAG_POSTCHECK_ENABLED:
                        full_local_answer = await local_svc.chat(latest_user_message, context)
                    else:
                        streamed_parts: list[str] = []
                        async for chunk in local_svc.chat_stream(latest_user_message, context):
                            streamed_parts.append(chunk)
                        full_local_answer = "".join(streamed_parts)

                    answer_latency_ms = round((time.perf_counter() - answer_t0) * 1000, 2)
                    postcheck_downgraded = 0
                    if is_student and Config.RAG_POSTCHECK_ENABLED:
                        full_local_answer, postcheck_downgraded = postcheck_and_downgrade(
                            answer=full_local_answer,
                            evidence_cards=rag_citations,
                        )

                    full_local_answer = _sanitize_answer_text(full_local_answer)
                    for part in _chunk_text(full_local_answer, size=2):
                        data = {"choices": [{"delta": {"content": part}}]}
                        yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

                    if _looks_truncated_response(full_local_answer):
                        continuation_meta = {
                            "provider": "local_ollama",
                            "warning": "Detected possible truncation; auto-continuing once.",
                        }
                        yield f"data: {json.dumps({'meta': continuation_meta}, ensure_ascii=False)}\n\n"

                        continuation_history = _compact_chat_history(cleaned[:-1]) + [
                            {"role": "user", "content": latest_user_message},
                            {"role": "assistant", "content": full_local_answer[-3000:]},
                        ]
                        continuation_context = dict(context)
                        continuation_context["chat_history"] = continuation_history
                        continuation_context["task_profile"] = task_profile_for_phase("answer")
                        continuation_prompt = (
                            "Continue your previous answer from the exact unfinished point. "
                            "Do not restart or repeat prior content. "
                            "Finish with a complete ending sentence."
                        )

                        async for chunk in local_svc.chat_stream(continuation_prompt, continuation_context):
                            data = {"choices": [{"delta": {"content": chunk}}]}
                            yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

                    try:
                        from backend.infrastructure.rag_telemetry import rag_telemetry
                        await rag_telemetry.record(
                            user_id=str(user.get("_id", user.get("id", ""))),
                            role="student" if is_student else role,
                            course_ids=student_course_ids,
                            query=latest_user_message,
                            result_count=len(rag_citations),
                            latency_ms=rag_retrieval_latency_ms,
                            use_hybrid=True,
                            top_k=rag_retrieve_top_n,
                            metadata={
                                "retry_used": rag_retry_used,
                                "retry_success": rag_retry_success,
                                "empty_after_retry": rag_empty_after_retry,
                                "answer_latency_ms": answer_latency_ms,
                                "postcheck_downgraded": postcheck_downgraded,
                                "phase": "answer",
                            },
                        )
                    except Exception:
                        logger.exception("Failed to record answer telemetry")
                    
                    yield "data: [DONE]\n\n"
                    return
                except LocalLLMUnavailableError as exc:
                    logger.warning("Local Ollama unavailable, fallback to Coze: %s", exc)
                    meta["provider"] = "coze"
                    meta["fallback_from"] = "local_ollama"
                    meta["fallback_to"] = "coze"
                    meta["warning"] = f"Local model unavailable: {exc}"
                    # Falls through to Coze below

            # Coze fallback or default provider
            answer_t0 = time.perf_counter()
            reply = await ai_gateway_service.chat_with_provider(
                message=latest_user_message,
                context=context,
                provider="coze",
            )
            answer_latency_ms = round((time.perf_counter() - answer_t0) * 1000, 2)

            if is_student and Config.RAG_POSTCHECK_ENABLED:
                reply, downgraded = postcheck_and_downgrade(answer=reply, evidence_cards=rag_citations)
                meta["postcheck_downgraded"] = downgraded

            reply = _sanitize_answer_text(reply)

            try:
                from backend.infrastructure.rag_telemetry import rag_telemetry
                await rag_telemetry.record(
                    user_id=str(user.get("_id", user.get("id", ""))),
                    role="student" if is_student else role,
                    course_ids=student_course_ids,
                    query=latest_user_message,
                    result_count=len(rag_citations),
                    latency_ms=rag_retrieval_latency_ms,
                    use_hybrid=True,
                    top_k=rag_retrieve_top_n,
                    metadata={
                        "retry_used": rag_retry_used,
                        "retry_success": rag_retry_success,
                        "empty_after_retry": rag_empty_after_retry,
                        "answer_latency_ms": answer_latency_ms,
                        "postcheck_downgraded": int(meta.get("postcheck_downgraded", 0) or 0),
                        "phase": "answer_fallback_coze",
                    },
                )
            except Exception:
                logger.exception("Failed to record coze fallback telemetry")

            yield f"data: {json.dumps({'meta': meta}, ensure_ascii=False)}\n\n"

            chunks = _chunk_text(reply, size=1)
            if not chunks:
                chunks = ["No response content."]

            for part in chunks:
                data = {
                    "choices": [
                        {
                            "delta": {
                                "content": part,
                            }
                        }
                    ]
                }
                yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
                await asyncio.sleep(0.01)

            yield "data: [DONE]\n\n"
        except Exception:  # noqa: BLE001
            logger.exception("AI chat streaming error")
            yield f"data: {json.dumps({'error': 'An internal error occurred. Please try again.'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(generate_async(), media_type="text/event-stream")
