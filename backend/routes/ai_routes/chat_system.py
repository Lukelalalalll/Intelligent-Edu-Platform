"""System prompt and LLM context helpers for chat."""
from __future__ import annotations

from backend.services.rag_service.rag_chat_pipeline import task_profile_for_phase

from .chat_context_helpers import _is_document_summary_request
from .chat_models import ParsedRequest
from .prompting import (
    _STUDENT_DOC_SUMMARY_MODE_MSG,
    _STUDENT_HINT_MODE_MSG,
    _STUDENT_SYSTEM_MSG,
    _STUDENT_TUTOR_MODE_MSG,
    _TEACHER_SYSTEM_MSG,
)


def build_system_override(
    parsed: ParsedRequest,
    rag_context_text: str,
    web_context_text: str = "",
    is_course_relevant: bool = False,
    has_web_results: bool = False,
    fallback_reason: str = "",
) -> str | None:
    if not parsed.is_student:
        return _TEACHER_SYSTEM_MSG + "\n\n" + rag_context_text if rag_context_text else None

    if parsed.tutor_mode == "hint_only":
        mode_prompt = _STUDENT_HINT_MODE_MSG
    elif _is_document_summary_request(parsed.effective_question, parsed.uploaded_attachment_text):
        mode_prompt = _STUDENT_DOC_SUMMARY_MODE_MSG
    else:
        mode_prompt = _STUDENT_TUTOR_MODE_MSG

    effective_rag = (rag_context_text if is_course_relevant else "") + web_context_text
    base = _STUDENT_SYSTEM_MSG + "\n\n" + mode_prompt + effective_rag
    if is_course_relevant and has_web_results:
        base += (
            "\n\n[Synthesis Mode]\n"
            "You have access to both course materials and live web results.\n"
            "1. Ground the answer primarily in the course materials.\n"
            "2. Use web results to fill gaps or add current examples.\n"
            "3. Call out any conflict between web information and course material.\n"
            "4. Do not output citation markers in the reply.\n"
            "5. Produce one unified answer."
        )
    elif has_web_results and not is_course_relevant:
        base += (
            "\n\n[Web Search Mode]\n"
            "No course-specific materials matched this query. "
            "Answer from web search results only, and do not output citation markers."
        )
    elif fallback_reason in {"no_course_materials", "no_relevant_course_evidence"}:
        base += (
            "\n\n[General Knowledge Fallback]\n"
            "No usable course material was available for this query. "
            "Answer normally using general knowledge, but clearly state that the response is not grounded in uploaded or indexed course materials. "
            "Do not claim that the answer comes from course materials."
        )
    return base


def build_llm_context(parsed: ParsedRequest, compact_history: list[dict], system_override: str | None) -> dict:
    return {
        "chat_history": compact_history,
        "system_memory": parsed.memory_text,
        "coze_user_id": f"chat_{parsed.user_id or 'anon'}",
        "system_override": system_override,
        "images": parsed.latest_user_images,
        "task_profile": task_profile_for_phase("answer"),
    }
