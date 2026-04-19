"""RAG orchestration: query rewrite, retrieval, evidence packing."""

import logging
import time

from cachetools import TTLCache

from backend.config import Config
from backend.services.rag_chat_pipeline import (
    build_rewrite_prompt,
    evidence_insufficient_message,
    pack_evidence,
    postcheck_and_downgrade,
    sanitize_rewrite_output,
    task_profile_for_phase,
)

from .chat_context_helpers import (
    _build_evidence_cards,
    _build_uploaded_evidence_cards,
    _compact_chat_history,
    _resolve_rag_top_k,
)

logger = logging.getLogger(__name__)

# ── Cache-Aside for student enrollment lookups ────────────────────
# Course enrollment changes at most once per semester; caching for 5 min
# eliminates a MongoDB round-trip on every single chat message.
_enrollment_cache: TTLCache[str, list[str]] = TTLCache(maxsize=1024, ttl=300)


async def _rewrite_query_with_local_model(
    *,
    question: str,
    tutor_mode: str,
    chat_history: list[dict],
) -> str:
    from backend.services.local_llm_service import LocalLLMService, LocalLLMUnavailableError

    svc = LocalLLMService()
    prompt = build_rewrite_prompt(question=question, tutor_mode=tutor_mode)
    context = {
        "task_profile": task_profile_for_phase("rewrite"),
        "chat_history": chat_history[-6:],
        "system_override": (
            "You rewrite retrieval queries. Keep user intent and language. "
            "Return exactly one line with no explanations."
        ),
    }
    try:
        reply = await svc.chat(prompt, context=context)
    except LocalLLMUnavailableError:
        return str(question or "").strip()
    return sanitize_rewrite_output(original_query=question, rewritten=reply)


async def run_student_rag(
    *,
    user: dict,
    effective_question: str,
    uploaded_attachment_text: str,
    tutor_mode: str,
    resolved_provider: str,
    cleaned_messages: list[dict],
) -> dict:
    """Run student RAG retrieval. Returns a dict with keys:
    rag_context_text, rag_citations, rag_top_k, rag_retrieve_top_n,
    rag_retry_used, rag_retry_success, rag_empty_after_retry,
    rag_retrieval_query, rag_rewritten_query, rag_retrieval_latency_ms,
    student_course_ids, forced_response_message, compact_history
    """
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
    compact_history = _compact_chat_history(cleaned_messages[:-1])

    try:
        from backend.services.course_rag_service import course_rag_service
        from backend.routes.auth_routes import get_profile_courses

        user_id_str = str(user.get("_id") or user.get("id") or "")
        cached_ids = _enrollment_cache.get(user_id_str)
        if cached_ids is not None:
            student_course_ids = cached_ids
        else:
            try:
                profile = await get_profile_courses(user)
                student_course_ids = [c["courseId"] for c in profile.get("courses", []) if c.get("courseId")]
                _enrollment_cache[user_id_str] = student_course_ids
            except Exception as exc:
                logger.warning("Could not resolve student courses — fail-closed, skipping RAG | err=%s", str(exc)[:240])
                student_course_ids = []

        if not student_course_ids:
            logger.debug("No student courses resolved, RAG context skipped")
            if uploaded_attachment_text:
                rag_empty_after_retry = False
                rag_citations = [{
                    "index": 1,
                    "course_id": "user_upload",
                    "doc_name": "uploaded_pdf",
                    "score": 1.0,
                    "text": uploaded_attachment_text,
                }]
                rag_context_text = _build_uploaded_evidence_cards(uploaded_attachment_text)
            else:
                rag_empty_after_retry = True
                forced_response_message = evidence_insufficient_message(effective_question)
        else:
            rag_top_k = _resolve_rag_top_k(effective_question, tutor_mode)
            rag_top_k = max(1, min(rag_top_k, int(Config.RAG_ANSWER_TOP_K) if Config.RAG_ANSWER_TOP_K > 0 else rag_top_k))
            rag_retrieve_top_n = max(rag_top_k, int(Config.RAG_RETRIEVE_TOP_N))

            if resolved_provider == "local_ollama" and Config.RAG_TWO_STAGE_CHAT_ENABLED:
                rag_rewritten_query = await _rewrite_query_with_local_model(
                    question=effective_question,
                    tutor_mode=tutor_mode,
                    chat_history=compact_history,
                )
                rag_retrieval_query = rag_rewritten_query or effective_question

            rag_start = time.perf_counter()
            rag_results = course_rag_service.retrieve_for_student(
                student_id=str(user.get("_id", user.get("id", ""))),
                query=rag_retrieval_query,
                top_k=rag_retrieve_top_n,
                course_ids=student_course_ids,
            )

            if not rag_results and Config.RAG_EMPTY_RETRY_ENABLED:
                rag_retry_used = True
                fallback_query = effective_question
                if rag_retrieval_query.strip() == effective_question.strip() and resolved_provider == "local_ollama":
                    fallback_query = await _rewrite_query_with_local_model(
                        question=effective_question,
                        tutor_mode=tutor_mode,
                        chat_history=compact_history,
                    )
                rag_results = course_rag_service.retrieve_for_student(
                    student_id=str(user.get("_id", user.get("id", ""))),
                    query=fallback_query,
                    top_k=rag_retrieve_top_n,
                    course_ids=student_course_ids,
                )
                rag_retry_success = bool(rag_results)
                rag_rewritten_query = fallback_query or rag_rewritten_query

            rag_retrieval_latency_ms = round((time.perf_counter() - rag_start) * 1000, 2)
            packed = pack_evidence(
                rag_results,
                answer_top_k=rag_top_k,
                max_total_chars=Config.RAG_EVIDENCE_MAX_CHARS,
                max_chars_per_chunk=Config.RAG_EVIDENCE_MAX_CHARS_PER_CHUNK,
            )
            if packed:
                rag_citations = packed
                rag_context_text = _build_evidence_cards(rag_citations)
            else:
                if uploaded_attachment_text:
                    rag_empty_after_retry = False
                    rag_citations = [{
                        "index": 1,
                        "course_id": "user_upload",
                        "doc_name": "uploaded_pdf",
                        "score": 1.0,
                        "text": uploaded_attachment_text,
                    }]
                    rag_context_text = _build_uploaded_evidence_cards(uploaded_attachment_text)
                else:
                    rag_empty_after_retry = True
                    forced_response_message = evidence_insufficient_message(effective_question)
    except Exception:
        logger.debug("Course RAG not available, proceeding without RAG context")

    return {
        "rag_context_text": rag_context_text,
        "rag_citations": rag_citations,
        "rag_top_k": rag_top_k,
        "rag_retrieve_top_n": rag_retrieve_top_n,
        "rag_retry_used": rag_retry_used,
        "rag_retry_success": rag_retry_success,
        "rag_empty_after_retry": rag_empty_after_retry,
        "rag_retrieval_query": rag_retrieval_query,
        "rag_rewritten_query": rag_rewritten_query,
        "rag_retrieval_latency_ms": rag_retrieval_latency_ms,
        "student_course_ids": student_course_ids,
        "forced_response_message": forced_response_message,
        "compact_history": compact_history,
    }
