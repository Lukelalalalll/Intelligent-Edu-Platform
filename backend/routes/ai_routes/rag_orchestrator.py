"""RAG orchestration: query rewrite, retrieval, evidence packing."""

import logging
import re
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


# ── Dynamic RAG budget ────────────────────────────────────────────

def _estimate_chars(obj: object) -> int:
    """Estimate character count of a message or string."""
    if isinstance(obj, dict):
        return len(str(obj.get("content", "") or ""))
    return len(str(obj or ""))


def _compute_rag_char_budget(
    *,
    provider: str,
    compact_history: list[dict],
    question: str,
    has_attachment: bool,
) -> int:
    """Compute available character budget for RAG evidence.

    Budget = (provider_window - overhead - history - question - reserve) * chars_per_token
    Clamped between 800 (minimum useful evidence) and 12_000 (avoid bloating
    large-window providers).
    """
    windows: dict = Config.RAG_PROVIDER_CONTEXT_WINDOWS
    if provider == "local_ollama":
        window_tokens = int(Config.OLLAMA_HEAVY_NUM_CTX)
    else:
        window_tokens = int(windows.get(provider, 16_000))

    cpt = float(Config.RAG_CHARS_PER_TOKEN)

    history_chars = sum(_estimate_chars(m) for m in compact_history)
    question_chars = _estimate_chars(question)
    attachment_overhead_chars = 600 if has_attachment else 0

    consumed_tokens = (
        int(Config.RAG_SYSTEM_OVERHEAD_TOKENS)
        + int(Config.RAG_GENERATION_RESERVE_TOKENS)
        + round((history_chars + question_chars + attachment_overhead_chars) / cpt)
    )

    available_tokens = max(0, window_tokens - consumed_tokens)
    char_budget = round(available_tokens * cpt)

    return max(800, min(char_budget, 12_000))


# ── Cache-Aside for student enrollment lookups ────────────────────
# Course enrollment changes at most once per semester; caching for 5 min
# eliminates a MongoDB round-trip on every single chat message.
_enrollment_cache: TTLCache[str, list[str]] = TTLCache(maxsize=1024, ttl=300)


# ── P1-1: Heuristic to skip query rewriting for clear queries ────

def _needs_rewrite(question: str, chat_history: list) -> bool:
    """Return True if the question would benefit from LLM rewriting."""
    q = question.strip()
    # Long questions are usually self-contained
    if len(q) > 80:
        return False
    # Contains explicit course/module references → already retrieval-friendly
    if re.search(
        r'模块|章节|module\s*\d|第[一二三四五六七八九十\d]+[章节]|[A-Z]{2,}\d{3,}', q
    ):
        return False
    # No chat history → single-turn, no context resolution needed
    if not chat_history:
        return False
    # Has clear question words and no anaphoric references
    if re.search(r'什么是|如何|为什么|怎么|请解释|explain|what is|how to', q, re.I):
        if not re.search(r'它|这个|那个|this|that|they|其', q, re.I):
            return False
    return True


def _resolve_history_keep_pairs(question: str, tutor_mode: str) -> int:
    """Select how many history pairs to keep for rewrite/context steps."""
    q = str(question or "").lower()
    base = int(getattr(Config, "RAG_CHAT_HISTORY_KEEP_PAIRS", 6) or 6)
    if tutor_mode == "hint_only":
        return max(4, min(base, 6))
    if any(k in q for k in ("推导", "证明", "derive", "proof", "compare", "比较", "区别")):
        return max(base, 8)
    return base


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
            "Resolve pronouns/anaphora (e.g., it/this/that/它/这个/那个) using chat history explicitly. "
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
    web_search: bool = False,
    search_engine: str = "auto",
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
    keep_pairs = _resolve_history_keep_pairs(effective_question, tutor_mode)
    compact_history = _compact_chat_history(cleaned_messages[:-1], keep_pairs=keep_pairs)

    try:
        import asyncio
        from backend.services.course_rag_service import course_rag_service
        from backend.routes.auth_routes import get_profile_courses

        # ── P0-2: Parallel enrollment lookup + query rewrite ─────────
        user_id_str = str(user.get("_id") or user.get("id") or "")
        cached_ids = _enrollment_cache.get(user_id_str)

        async def _resolve_courses() -> list[str]:
            if cached_ids is not None:
                return cached_ids
            try:
                profile = await get_profile_courses(user)
                ids = [c["courseId"] for c in profile.get("courses", []) if c.get("courseId")]
                _enrollment_cache[user_id_str] = ids
                return ids
            except Exception as exc:
                logger.warning("Could not resolve student courses — fail-closed, skipping RAG | err=%s", str(exc)[:240])
                return []

        async def _maybe_rewrite() -> str:
            """P1-1: Only rewrite when heuristic says it's needed."""
            if not Config.RAG_TWO_STAGE_CHAT_ENABLED:
                return effective_question
            if not _needs_rewrite(effective_question, compact_history):
                logger.debug("Skipping query rewrite (heuristic: clear query)")
                return effective_question
            return await _rewrite_query_with_local_model(
                question=effective_question,
                tutor_mode=tutor_mode,
                chat_history=compact_history,
            )

        # Run both concurrently
        student_course_ids, rag_rewritten_query = await asyncio.gather(
            _resolve_courses(), _maybe_rewrite()
        )
        rag_retrieval_query = rag_rewritten_query or effective_question

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
                if rag_retrieval_query.strip() == effective_question.strip():
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
            _rag_char_budget = _compute_rag_char_budget(
                provider=resolved_provider,
                compact_history=compact_history,
                question=effective_question,
                has_attachment=bool(uploaded_attachment_text),
            )
            _per_chunk_limit = max(
                int(Config.RAG_EVIDENCE_MAX_CHARS_PER_CHUNK),
                _rag_char_budget // max(1, rag_top_k),
            )
            packed = pack_evidence(
                rag_results,
                answer_top_k=rag_top_k,
                max_total_chars=_rag_char_budget,
                max_chars_per_chunk=_per_chunk_limit,
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

    # ── Web search (SearXNG) ──────────────────────────────────────
    web_context_text = ""  # Tracked separately so it's always injected to the LLM
    if web_search and Config.SEARXNG_ENABLED:
        try:
            from backend.services.web_search_service import search_web
            web_results = await search_web(
                rag_retrieval_query or effective_question,
                engine=search_engine,  # type: ignore[arg-type]
            )
            if web_results:
                # Inject web results into citations with a dedicated source_type
                next_idx = (rag_citations[-1]["index"] + 1) if rag_citations else 1
                web_items = [
                    {
                        "index": next_idx + i,
                        "source_type": "web",
                        "url": r["url"],
                        "doc_name": r["title"] or r["url"],
                        "score": 0.50,
                        "text": r["content"],
                    }
                    for i, r in enumerate(web_results)
                    if r.get("content")
                ]
                if web_items:
                    rag_citations = rag_citations + web_items
                    # Build dedicated web-evidence block (tracked independently)
                    web_card_lines = ["\n\n--- Web Search Results ---"]
                    for w in web_items:
                        web_card_lines.append(
                            f"\n[Web {w['index']}] {w['doc_name']}\nURL: {w['url']}\n{w['text']}"
                        )
                    web_context_text = "\n".join(web_card_lines)
                    rag_context_text = rag_context_text + web_context_text
                    rag_empty_after_retry = False
                    forced_response_message = ""
        except Exception:
            logger.debug("Web search failed, continuing without web results", exc_info=True)

    # Determine whether the question is genuinely course-relevant.
    # Use raw_vector_score (raw cosine similarity from ChromaDB, preserved before RRF
    # normalization) so that the threshold is meaningful. The reranked `score` is always
    # artificially high after normalization and cannot be used here.
    _local_citations = [c for c in rag_citations if c.get("source_type") != "web"]
    _raw_threshold = float(getattr(Config, "RAG_RELEVANCE_THRESHOLD", 0.60))
    is_course_relevant = (
        len(_local_citations) > 0
        and not rag_empty_after_retry
        and max(
            (c.get("raw_vector_score") or c.get("retrieval_score") or 0.0
             for c in _local_citations),
            default=0.0,
        ) >= _raw_threshold
    )

    return {
        "rag_context_text": rag_context_text,
        "web_context_text": web_context_text,
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
        "is_course_relevant": is_course_relevant,
    }
