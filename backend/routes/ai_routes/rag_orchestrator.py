"""RAG orchestration: query rewrite, retrieval, evidence packing."""

from __future__ import annotations

import logging
import re
import time

from cachetools import TTLCache

from backend.config import Config
from backend.services.rag_service.rag_chat_pipeline import (
    build_rewrite_prompt,
    pack_evidence,
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

_enrollment_cache: TTLCache[str, list[str]] = TTLCache(maxsize=1024, ttl=300)
_REFERENCE_HINTS = re.compile(
    r"(module\s*\d+|chapter|section|lecture|章节|模块|第\s*[一二三四五六七八九十0-9]+\s*[章节讲])",
    re.IGNORECASE,
)
_CLEAR_QUESTION_HINTS = re.compile(
    r"(what is|how to|explain|why|什么是|如何|解释|为什么)",
    re.IGNORECASE,
)
_ANAPHORA_HINTS = re.compile(
    r"\b(it|this|that|they|these|those)\b|这个|那个|它们|这些|那些",
    re.IGNORECASE,
)
_GREETING_ONLY_RE = re.compile(
    r"^\s*(?:hello|hi|hey|hey there|hello there|yo|sup|你好|您好|哈喽|嗨|早上好|中午好|下午好|晚上好|在吗|在嘛)(?:\s+(?:deepseek|coze|ollama|ai|chat|模型))?\s*[!,.?~，。！？]*\s*$",
    re.IGNORECASE,
)
_SANITY_CHECK_RE = re.compile(
    r"^\s*(?:(?:test(?:ing)?|ping|check|smoke\s*test|try)\s*(?:the\s+)?(?:deepseek|coze|ollama|ai|chat|model)?|(?:测试(?:一下)?|试一试|试试看|看看|检查一下)\s*(?:deepseek|coze|ollama|ai|聊天|模型)?|(?:deepseek|coze|ollama)\s*(?:test(?:ing)?|ping|check|测试(?:一下)?))\s*[!,.?~，。！？]*\s*$",
    re.IGNORECASE,
)
_IDENTITY_QUERY_RE = re.compile(
    r"^\s*(?:(?:who\s+are\s+you|what\s+are\s+you)(?:\s+are\s+you\s+(?:deepseek|coze|ollama))?|are\s+you\s+(?:deepseek|coze|ollama)|what(?:'s|\s+is)?\s+your\s+model|which\s+model\s+are\s+you|what\s+model\s+are\s+you|introduce\s+yourself|你是谁|介绍一下你自己|你是不是\s*(?:deepseek|coze|ollama)|你用的是(?:什么|哪个)模型|你是什么模型)\s*[!,.?~，。！？]*\s*$",
    re.IGNORECASE,
)
_CAPABILITY_QUERY_RE = re.compile(
    r"^\s*(?:what\s+can\s+you\s+do|how\s+can\s+you\s+help|help\s+me|你能做什么|你会什么|你可以帮我什么)\s*[!,.?~，。！？]*\s*$",
    re.IGNORECASE,
)


def _estimate_chars(obj: object) -> int:
    if isinstance(obj, dict):
        return len(str(obj.get("content", "") or ""))
    return len(str(obj or ""))


def _normalize_query_text(question: str) -> str:
    return re.sub(r"\s+", " ", str(question or "")).strip()


def _should_bypass_course_rag(question: str, uploaded_attachment_text: str = "") -> bool:
    if str(uploaded_attachment_text or "").strip():
        return False
    q = _normalize_query_text(question)
    if not q:
        return False
    return bool(
        _GREETING_ONLY_RE.fullmatch(q)
        or _SANITY_CHECK_RE.fullmatch(q)
        or _IDENTITY_QUERY_RE.fullmatch(q)
        or _CAPABILITY_QUERY_RE.fullmatch(q)
    )


async def _resolve_student_course_scope(user: dict) -> dict[str, list[str]]:
    from backend.services.course_rag_service import course_rag_service
    from backend.services.student.enrollment_service import get_user_course_profile

    user_id_str = str(user.get("_id") or user.get("id") or "")
    cached_ids = _enrollment_cache.get(user_id_str)
    if cached_ids is None:
        try:
            profile = await get_user_course_profile(user)
            cached_ids = [
                str(course["courseId"])
                for course in profile.get("courses", [])
                if course.get("courseId")
            ]
            _enrollment_cache[user_id_str] = cached_ids
        except Exception as exc:
            logger.warning("Could not resolve student courses, skipping RAG | err=%s", str(exc)[:240])
            cached_ids = []

    try:
        indexed_course_ids = {
            str(course_id)
            for course_id in course_rag_service.get_indexed_courses_for_student(user_id_str)
            if str(course_id)
        }
    except Exception as exc:
        logger.warning("Could not resolve indexed course materials, skipping course retrieval | err=%s", str(exc)[:240])
        indexed_course_ids = set()

    available_course_ids = [course_id for course_id in cached_ids if course_id in indexed_course_ids]
    return {
        "enrolled_course_ids": cached_ids,
        "available_course_ids": available_course_ids,
    }


async def _should_emit_course_rag_progress(
    *,
    user: dict,
    question: str,
    uploaded_attachment_text: str = "",
) -> tuple[bool, dict[str, list[str]]]:
    course_scope = await _resolve_student_course_scope(user)
    should_retrieve = bool(
        not _should_bypass_course_rag(question, uploaded_attachment_text)
        and not str(uploaded_attachment_text or "").strip()
        and course_scope["available_course_ids"]
    )
    return should_retrieve, course_scope


def _compute_rag_char_budget(
    *,
    provider: str,
    compact_history: list[dict],
    question: str,
    has_attachment: bool,
) -> int:
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


def _validate_context_window(
    *,
    provider: str,
    system_override: str | None,
    compact_history: list[dict],
    question: str,
    memory_text: str = "",
) -> str | None:
    if not system_override:
        return system_override

    windows: dict = Config.RAG_PROVIDER_CONTEXT_WINDOWS
    if provider == "local_ollama":
        window_tokens = int(Config.OLLAMA_HEAVY_NUM_CTX)
    else:
        window_tokens = int(windows.get(provider, 16_000))

    cpt = float(Config.RAG_CHARS_PER_TOKEN)
    history_chars = sum(len(str(m.get("content", "") or "")) for m in compact_history)
    question_chars = len(str(question or ""))
    memory_chars = len(str(memory_text or ""))
    system_chars = len(str(system_override or ""))
    total_chars = history_chars + question_chars + memory_chars + system_chars
    estimated_tokens = round(total_chars / cpt)
    if estimated_tokens <= window_tokens:
        return system_override

    overhead = history_chars + question_chars + memory_chars
    available_for_system = max(400, int(window_tokens * cpt) - overhead)
    if available_for_system >= len(system_override):
        return system_override

    logger.warning(
        "Context window overflow detected for provider=%s: estimated=%d tokens, window=%d. Truncating system_override.",
        provider,
        estimated_tokens,
        window_tokens,
    )
    return system_override[:available_for_system]


def _needs_rewrite(question: str, chat_history: list[dict]) -> bool:
    q = str(question or "").strip()
    if len(q) > 80:
        return False
    if _REFERENCE_HINTS.search(q):
        return False
    if not chat_history:
        return False
    if _CLEAR_QUESTION_HINTS.search(q) and not _ANAPHORA_HINTS.search(q):
        return False
    return True


def _resolve_history_keep_pairs(question: str, tutor_mode: str) -> int:
    q = str(question or "").lower()
    base = int(getattr(Config, "RAG_CHAT_HISTORY_KEEP_PAIRS", 6) or 6)
    if tutor_mode == "hint_only":
        return max(4, min(base, 6))
    if any(k in q for k in ("derive", "proof", "compare", "姣旇緝", "鍖哄埆", "鎺ㄥ", "璇佹槑")):
        return max(base, 8)
    return base


async def _rewrite_query(
    *,
    user: dict,
    question: str,
    tutor_mode: str,
    chat_history: list[dict],
    resolved_provider: str,
) -> str:
    prompt = build_rewrite_prompt(question=question, tutor_mode=tutor_mode)
    context = {
        "task_profile": task_profile_for_phase("rewrite"),
        "chat_history": chat_history,
        "system_override": (
            "You rewrite retrieval queries. Keep user intent and language. "
            "Resolve pronouns and references using chat history explicitly. "
            "Return exactly one line with no explanations."
        ),
    }

    try:
        reply = ""
        if resolved_provider == "deepseek":
            from backend.services.llm_service.deepseek_service import DeepSeekService, DeepSeekUnavailableError
            from backend.services.user_profile_service import load_deepseek_runtime_config

            svc = DeepSeekService.from_config(await load_deepseek_runtime_config(user))
            try:
                async for chunk in svc.chat_stream(prompt, context=context, enable_thinking=False):
                    reply += chunk
            except DeepSeekUnavailableError:
                resolved_provider = "local_ollama"

        if not reply and resolved_provider in ("local_ollama", "local"):
            from backend.services.llm_service.local_llm_service import LocalLLMService

            svc = LocalLLMService()
            reply = await svc.chat(prompt, context=context)

        return sanitize_rewrite_output(original_query=question, rewritten=reply or question)
    except Exception as exc:
        logger.warning("Rewrite error: %s", str(exc))
        return str(question or "").strip()


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
    rag_profile: str = "balanced",
    debug_retrieval: bool = False,
    allow_web_correction: bool = False,
    force_query_class: str = "",
    course_scope: dict[str, list[str]] | None = None,
) -> dict:
    rag_context_text = ""
    web_context_text = ""
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
    retrieval_plan: dict = {}
    retrieval_trace: list[dict] = []
    retrieval_confidence: dict = {}
    fallback_reason = ""
    evidence_spans: list[dict] = []
    keep_pairs = _resolve_history_keep_pairs(effective_question, tutor_mode)
    compact_history = _compact_chat_history(cleaned_messages[:-1], keep_pairs=keep_pairs)
    bypass_course_rag = _should_bypass_course_rag(effective_question, uploaded_attachment_text)

    if bypass_course_rag:
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
            "is_course_relevant": False,
            "retrieval_plan": retrieval_plan,
            "retrieval_trace": retrieval_trace,
            "retrieval_confidence": retrieval_confidence,
            "fallback_reason": "non_course_query",
            "evidence_spans": evidence_spans,
        }

    try:
        from backend.services.course_rag_service import course_rag_service

        async def _maybe_rewrite() -> str:
            if not Config.RAG_TWO_STAGE_CHAT_ENABLED:
                return effective_question
            if not _needs_rewrite(effective_question, compact_history):
                logger.debug("Skipping query rewrite (heuristic clear query)")
                return effective_question
            return await _rewrite_query(
                user=user,
                question=effective_question,
                tutor_mode=tutor_mode,
                chat_history=compact_history,
                resolved_provider=resolved_provider,
            )

        if course_scope is None:
            course_scope = await _resolve_student_course_scope(user)
        student_course_ids = list(course_scope.get("available_course_ids", []))
        enrolled_course_ids = list(course_scope.get("enrolled_course_ids", []))
        rag_rewritten_query = await _maybe_rewrite()
        rag_retrieval_query = rag_rewritten_query or effective_question

        if not student_course_ids:
            logger.debug("No indexed course materials available, RAG context skipped")
            if uploaded_attachment_text:
                rag_citations = [
                    {
                        "index": 1,
                        "course_id": "user_upload",
                        "doc_name": "uploaded_pdf",
                        "score": 1.0,
                        "text": uploaded_attachment_text,
                    }
                ]
                rag_context_text = _build_uploaded_evidence_cards(uploaded_attachment_text)
            elif not bypass_course_rag:
                fallback_reason = "no_course_materials"
                if not enrolled_course_ids:
                    fallback_reason = "no_course_materials"
        else:
            rag_top_k = _resolve_rag_top_k(effective_question, tutor_mode)
            rag_top_k = max(
                1,
                min(
                    rag_top_k,
                    int(Config.RAG_ANSWER_TOP_K) if Config.RAG_ANSWER_TOP_K > 0 else rag_top_k,
                ),
            )
            rag_retrieve_top_n = max(rag_top_k, int(Config.RAG_RETRIEVE_TOP_N))

            rag_start = time.perf_counter()
            detailed = await course_rag_service.retrieve_for_student_detailed(
                student_id=str(user.get("_id", user.get("id", ""))),
                query=rag_retrieval_query,
                top_k=rag_retrieve_top_n,
                course_ids=student_course_ids,
                rag_profile=rag_profile,
                debug_retrieval=debug_retrieval,
                allow_web_correction=allow_web_correction,
                force_query_class=force_query_class,
            )
            rag_results = detailed.results or []
            retrieval_plan = detailed.retrieval_plan or {}
            retrieval_trace = detailed.retrieval_trace or []
            retrieval_confidence = detailed.retrieval_confidence or {}
            fallback_reason = detailed.fallback_reason or ""
            evidence_spans = detailed.evidence_spans or []
            rag_retrieval_latency_ms = detailed.latency_ms or round((time.perf_counter() - rag_start) * 1000, 2)

            if not rag_results and Config.RAG_EMPTY_RETRY_ENABLED:
                rag_retry_used = True
                fallback_query = effective_question
                if rag_retrieval_query.strip() == effective_question.strip():
                    fallback_query = await _rewrite_query(
                        user=user,
                        question=effective_question,
                        tutor_mode=tutor_mode,
                        chat_history=compact_history,
                        resolved_provider=resolved_provider,
                    )
                retry_detailed = await course_rag_service.retrieve_for_student_detailed(
                    student_id=str(user.get("_id", user.get("id", ""))),
                    query=fallback_query,
                    top_k=rag_retrieve_top_n,
                    course_ids=student_course_ids,
                    rag_profile=rag_profile,
                    debug_retrieval=debug_retrieval,
                    allow_web_correction=allow_web_correction,
                    force_query_class=force_query_class,
                )
                rag_results = retry_detailed.results or []
                retrieval_plan = retry_detailed.retrieval_plan or retrieval_plan
                retrieval_trace = retry_detailed.retrieval_trace or retrieval_trace
                retrieval_confidence = retry_detailed.retrieval_confidence or retrieval_confidence
                fallback_reason = retry_detailed.fallback_reason or fallback_reason
                evidence_spans = retry_detailed.evidence_spans or evidence_spans
                rag_retrieval_latency_ms = round((time.perf_counter() - rag_start) * 1000, 2)
                rag_retry_success = bool(rag_results)
                rag_rewritten_query = fallback_query or rag_rewritten_query
                rag_retrieval_query = fallback_query or rag_retrieval_query

            rag_retrieval_latency_ms = round((time.perf_counter() - rag_start) * 1000, 2)
            rag_char_budget = _compute_rag_char_budget(
                provider=resolved_provider,
                compact_history=compact_history,
                question=effective_question,
                has_attachment=bool(uploaded_attachment_text),
            )
            per_chunk_limit = max(
                int(Config.RAG_EVIDENCE_MAX_CHARS_PER_CHUNK),
                rag_char_budget // max(1, rag_top_k),
            )
            packed = pack_evidence(
                rag_results,
                answer_top_k=rag_top_k,
                max_total_chars=rag_char_budget,
                max_chars_per_chunk=per_chunk_limit,
            )
            if packed:
                rag_citations = packed
                rag_context_text = _build_evidence_cards(rag_citations)
            elif uploaded_attachment_text:
                rag_citations = [
                    {
                        "index": 1,
                        "course_id": "user_upload",
                        "doc_name": "uploaded_pdf",
                        "score": 1.0,
                        "text": uploaded_attachment_text,
                    }
                ]
                rag_context_text = _build_uploaded_evidence_cards(uploaded_attachment_text)
            elif not bypass_course_rag:
                rag_empty_after_retry = True
                fallback_reason = "no_relevant_course_evidence"
    except Exception:
        logger.debug("Course RAG not available, proceeding without RAG context", exc_info=True)

    web_requested = bool(web_search or allow_web_correction)
    if Config.SEARXNG_ENABLED and web_requested:
        if (retrieval_confidence.get("label") or "incorrect") in {"ambiguous", "incorrect"}:
            try:
                from backend.services.rag.web_search_service import search_web

                web_results = await search_web(
                    rag_retrieval_query or effective_question,
                    engine=search_engine,  # type: ignore[arg-type]
                )
                if web_results:
                    next_idx = (rag_citations[-1]["index"] + 1) if rag_citations else 1
                    web_items = []
                    for i, result in enumerate(web_results):
                        content = result.get("content")
                        if not content:
                            continue
                        web_items.append(
                            {
                                "index": next_idx + i,
                                "source_type": "web",
                                "fallback_reason": "web_correction",
                                "url": result["url"],
                                "doc_name": result.get("title") or result["url"],
                                "score": 0.50,
                                "text": content,
                            }
                        )
                    if web_items:
                        rag_citations = rag_citations + web_items
                        web_card_lines = ["\n\n--- Web Search Results ---"]
                        for item in web_items:
                            web_card_lines.append(
                                f"\n[Web {item['index']}] {item['doc_name']}\nURL: {item['url']}\n{item['text']}"
                            )
                        web_context_text = "\n".join(web_card_lines)
                        rag_empty_after_retry = False
                        forced_response_message = ""
                        fallback_reason = "web_correction"
            except Exception:
                logger.debug("Web search failed, continuing without web results", exc_info=True)

    local_citations = [c for c in rag_citations if c.get("source_type") != "web"]
    raw_threshold = float(Config.RAG_RELEVANCE_THRESHOLD)
    is_course_relevant = (
        len(local_citations) > 0
        and not rag_empty_after_retry
        and max(
            (
                c.get("raw_vector_score")
                or c.get("retrieval_score")
                or c.get("score")
                or 0.0
                for c in local_citations
            ),
            default=0.0,
        )
        >= raw_threshold
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
        "retrieval_plan": retrieval_plan,
        "retrieval_trace": retrieval_trace,
        "retrieval_confidence": retrieval_confidence,
        "fallback_reason": fallback_reason,
        "evidence_spans": evidence_spans,
    }

