from __future__ import annotations

import asyncio
import json
import logging
from concurrent.futures import ProcessPoolExecutor
from functools import partial
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import JsonValue

from backend.core.dependencies import (
    get_ai_gateway_service,
    get_http_client,
    get_langchain_rag_service,
    get_process_pool,
)
from backend.core.ai_provider import resolve_provider
from backend.services.grading_service import find_submission, load_annotations, find_submission_v2
from backend.schemas import (
    AnalyzeSubmissionSchema,
    AnnotateSchema,
    ChatMessageSchema,
    FeedbackSchema,
    GradingContextSchema,
    RagContextSchema,
)
from backend.services.ai_gateway_service import AIGatewayService
from backend.services.tfidf_rag_service import LocalRagService
from backend.utils.pdf_extractor import extract_text_from_pdf
from backend.config import Config
from backend.prompts import prompt_registry

ai_gateway_router = APIRouter(prefix="/api/ai/gateway", tags=["AI Gateway"])
logger = logging.getLogger(__name__)

DEFAULT_RAG_TOP_K = 4
STREAM_TEXT_CHUNK_SIZE = 24
STREAM_CHUNK_DELAY_SECONDS = 0.01
STREAM_MAX_WAIT_SECONDS = 25
DEEPSEEK_STREAM_URL = "https://api.deepseek.com/chat/completions"


def _extract_text_from_pdf_job(path_text: str) -> str:
    return extract_text_from_pdf(Path(path_text))


def _build_local_rag_context_job(document_text: str, query: str, top_k: int) -> dict[str, Any]:
    service = LocalRagService()
    return service.build_rag_context(document_text=document_text, query=query, top_k=top_k)


async def _run_in_process_pool(process_pool: ProcessPoolExecutor, func, *args):
    loop = asyncio.get_running_loop()
    job = partial(func, *args)
    return await loop.run_in_executor(process_pool, job)


def _compact_chat_history(messages: list[ChatMessageSchema] | None, keep_pairs: int = 4) -> list[ChatMessageSchema]:
    if not messages:
        return []
    cleaned: list[ChatMessageSchema] = []
    for item in messages:
        role = str(item.role).strip().lower()
        content = str(item.content or "").strip()
        if role in {"user", "assistant"} and content:
            cleaned.append(ChatMessageSchema(role=role, content=content))
    return cleaned[-(keep_pairs * 2):]


def _build_retrieval_query(
    selected_text: str,
    chat_history: list[ChatMessageSchema] | None,
    max_chars: int = 1200,
) -> str:
    base = str(selected_text or "").strip()
    recent_user_turns: list[str] = []
    for item in chat_history or []:
        if item.role != "user":
            continue
        content = str(item.content or "").strip()
        if content:
            recent_user_turns.append(content)

    context_tail = "\n".join(recent_user_turns[-2:])
    query = f"{base}\n{context_tail}".strip()
    return query[:max_chars]


def _normalize_rag_top_k(raw_top_k: int | None) -> int:
    try:
        return max(1, int(raw_top_k or DEFAULT_RAG_TOP_K))
    except (TypeError, ValueError):
        return DEFAULT_RAG_TOP_K


def _resolve_submission_pdf_path(submission: dict[str, Any]) -> Path:
    pdf_path = str((submission or {}).get("pdfPath", ""))
    root_dir = Path(__file__).resolve().parents[2]
    candidate = Path(pdf_path)
    if candidate.is_absolute():
        resolved = candidate.resolve()
    else:
        resolved = (root_dir / pdf_path).resolve()
    # Prevent path traversal — resolved path must be under the project root
    if not resolved.is_relative_to(root_dir):
        raise HTTPException(status_code=403, detail="Access denied: path outside project root")
    return resolved


async def _get_submission_bundle(submission_id: str):
    course, assignment, submission = await find_submission_v2(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    return course, assignment, submission


async def _read_submission_text(submission: dict[str, Any], process_pool: ProcessPoolExecutor) -> str:
    candidate = _resolve_submission_pdf_path(submission)
    return await _run_in_process_pool(process_pool, _extract_text_from_pdf_job, str(candidate))


def _compact_rag_for_prompt(rag_context: RagContextSchema, max_chunks: int = 5, max_text: int = 800) -> RagContextSchema:
    compact_chunks = []
    for chunk in rag_context.retrieved_chunks[:max_chunks]:
        compact_chunks.append(
            {
                "chunk_id": chunk.chunk_id,
                "score": chunk.score,
                "text": str(chunk.text or "")[:max_text],
                "page_num": chunk.page_num,
                "char_start": chunk.char_start,
                "char_end": chunk.char_end,
            }
        )
    return RagContextSchema.model_validate(
        {
            "retrieved_count": len(compact_chunks),
            "retrieved_chunks": compact_chunks,
        }
    )


def _format_rag_snippets(rag: RagContextSchema) -> str:
    """Format RAG chunks with citation markers including page numbers."""
    if not rag.retrieved_chunks:
        return "No retrieval context available."
    parts = []
    for chunk in rag.retrieved_chunks:
        page_info = f"p.{chunk.page_num}" if chunk.page_num > 0 else "p.?"
        parts.append(f"[chunk-{chunk.chunk_id}|{page_info}|score={chunk.score}] {chunk.text}")
    return "\n\n".join(parts)


def _build_feedback_prompt(
    selected_text: str,
    assignment_desc: str,
    rubric: dict[str, JsonValue],
    rag_context: RagContextSchema,
) -> str:
    rag = _compact_rag_for_prompt(rag_context)
    rag_snippets = _format_rag_snippets(rag)
    return prompt_registry.render(
        "grading", "feedback",
        assignment_desc=assignment_desc,
        rubric_json=json.dumps(rubric, ensure_ascii=False),
        selected_text=selected_text,
        rag_snippets=rag_snippets,
    )


def _build_annotation_prompt(
    selected_text: str,
    assignment_desc: str,
    rubric: dict[str, JsonValue],
    rag_context: RagContextSchema,
) -> str:
    rag = _compact_rag_for_prompt(rag_context)
    rag_snippets = _format_rag_snippets(rag)
    return prompt_registry.render(
        "grading", "annotation",
        selected_text=selected_text,
        assignment_desc=assignment_desc,
        rubric_json=json.dumps(rubric, ensure_ascii=False),
        rag_snippets=rag_snippets,
    )


async def _stream_deepseek_chunks(http_client: httpx.AsyncClient, prompt: str):
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {Config.DEEPSEEK_API_KEY}",
    }
    body = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": prompt_registry.get("grading", "deepseek_system")},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.3,
        "stream": True,
    }

    async with http_client.stream(
        "POST",
        DEEPSEEK_STREAM_URL,
        headers=headers,
        json=body,
        timeout=Config.COZE_REQUEST_TIMEOUT_SECONDS,
    ) as resp:
        resp.raise_for_status()
        async for line in resp.aiter_lines():
            if not line:
                continue
            if line.startswith("data: "):
                yield f"{line}\n\n"


def _build_context_payload(
    *,
    assignment_desc: str,
    rubric: dict[str, JsonValue],
    selected_text: str,
    chat_history: list[ChatMessageSchema],
    rag_context: RagContextSchema,
) -> GradingContextSchema:
    return GradingContextSchema(
        assignment=assignment_desc,
        rubric=rubric,
        selected_text=selected_text,
        chat_history=chat_history,
        rag=rag_context,
    )


def _should_fallback_to_deepseek(reply: str | None) -> bool:
    normalized = str(reply or "").strip()
    return (
        not normalized
        or normalized.startswith("Error calling Coze.ai")
        or normalized.startswith("Coze response timeout")
        or normalized.startswith("[Mock AI]")
    )


def _sse_data_message(content: str) -> str:
    data = {"choices": [{"delta": {"content": content}}]}
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def _empty_rag_context() -> RagContextSchema:
    return RagContextSchema(retrieved_count=0, retrieved_chunks=[])


async def _build_rag_context_for_request(
    *,
    submission_id: str,
    selected_text: str,
    messages: list[ChatMessageSchema] | None,
    use_rag: bool,
    rag_top_k: int | None,
    submission: dict[str, Any],
    process_pool: ProcessPoolExecutor,
    langchain_rag_service,
) -> RagContextSchema:
    if not use_rag:
        return _empty_rag_context()

    try:
        chat_history = _compact_chat_history(messages)
        retrieval_query = _build_retrieval_query(selected_text, chat_history)
        submission_text = await _read_submission_text(submission, process_pool)
        top_k = _normalize_rag_top_k(rag_top_k)

        if langchain_rag_service is not None:
            raw_context = await asyncio.to_thread(
                langchain_rag_service.build_rag_context,
                submission_id,
                submission_text,
                retrieval_query,
                top_k,
            )
        else:
            raw_context = await _run_in_process_pool(
                process_pool,
                _build_local_rag_context_job,
                submission_text,
                retrieval_query,
                top_k,
            )

        return RagContextSchema.model_validate(raw_context)
    except Exception:  # noqa: BLE001
        logger.exception("RAG context build failed for submission_id=%s", submission_id)
        return _empty_rag_context()


def _chunk_text(text: str, size: int = STREAM_TEXT_CHUNK_SIZE) -> list[str]:
    """Split text into chunks for streaming, avoiding mid-word breaks."""
    content = str(text or "")
    if not content:
        return []
    # For CJK-heavy text or short sizes, character-level chunking is fine
    if size <= 10:
        return [content[i:i + size] for i in range(0, len(content), size)]
    # Word-boundary-aware chunking
    chunks: list[str] = []
    words = content.split()
    current = ""
    for word in words:
        candidate = f"{current} {word}" if current else word
        if len(candidate) > size and current:
            chunks.append(current)
            current = word
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks if chunks else [content]


@ai_gateway_router.post("/analyze")
async def analyze_submission(
    payload: AnalyzeSubmissionSchema,
    ai_gateway_service: AIGatewayService = Depends(get_ai_gateway_service),
    process_pool: ProcessPoolExecutor = Depends(get_process_pool),
):
    resolved_provider = resolve_provider(payload.provider, feature="grading.analyze")
    _, assignment, submission = await _get_submission_bundle(payload.submissionId)
    text = await _read_submission_text(submission, process_pool)
    rubric = assignment.get("rubric", {})
    assignment_desc = assignment.get("description", "")

    response = await ai_gateway_service.analyze_submission(
        text=text,
        rubric=rubric,
        assignment=assignment_desc,
        provider=resolved_provider,
    )
    annotations = await load_annotations(payload.submissionId)
    return {
        "analysis": response,
        "rubric": rubric,
        "assignment": assignment,
        "annotations": annotations,
    }


@ai_gateway_router.post("/feedback")
async def request_feedback(
    payload: FeedbackSchema,
    ai_gateway_service: AIGatewayService = Depends(get_ai_gateway_service),
    process_pool: ProcessPoolExecutor = Depends(get_process_pool),
    langchain_rag_service=Depends(get_langchain_rag_service),
):
    resolved_provider = resolve_provider(payload.provider, feature="grading.feedback")
    _, assignment, submission = await _get_submission_bundle(payload.submissionId)
    assignment_desc = payload.assignment or assignment.get("description", "")
    rubric = payload.rubric or assignment.get("rubric", {})
    chat_history = _compact_chat_history(payload.messages)
    rag_enabled = bool(payload.useRag)
    rag_context = await _build_rag_context_for_request(
        submission_id=payload.submissionId,
        selected_text=payload.selectedText,
        messages=payload.messages,
        use_rag=rag_enabled,
        rag_top_k=payload.ragTopK,
        submission=submission,
        process_pool=process_pool,
        langchain_rag_service=langchain_rag_service,
    )
    context = _build_context_payload(
        assignment_desc=assignment_desc,
        rubric=rubric,
        selected_text=payload.selectedText,
        chat_history=chat_history,
        rag_context=rag_context,
    )
    message = _build_feedback_prompt(
        selected_text=payload.selectedText,
        assignment_desc=assignment_desc,
        rubric=rubric,
        rag_context=rag_context,
    )
    reply = await ai_gateway_service.chat_with_provider(
        message=message,
        context=context.model_dump(),
        provider=resolved_provider,
    )
    return {
        "feedback": reply,
        "rag": {
            "enabled": rag_enabled,
            "retrieved_count": rag_context.retrieved_count,
            "citations": [
                {
                    "chunk_id": c.chunk_id,
                    "page_num": c.page_num,
                    "score": c.score,
                    "preview": str(c.text or "")[:120],
                }
                for c in rag_context.retrieved_chunks[:3]
            ],
        },
    }


@ai_gateway_router.post("/feedback/stream")
async def request_feedback_stream(  # NOSONAR
    payload: FeedbackSchema,
    ai_gateway_service: AIGatewayService = Depends(get_ai_gateway_service),
    http_client: httpx.AsyncClient = Depends(get_http_client),
    process_pool: ProcessPoolExecutor = Depends(get_process_pool),
    langchain_rag_service=Depends(get_langchain_rag_service),
):  # noqa: C901
    resolved_provider = resolve_provider(payload.provider, feature="grading.feedback_stream")
    _, assignment, submission = await _get_submission_bundle(payload.submissionId)
    assignment_desc = payload.assignment or assignment.get("description", "")
    rubric = payload.rubric or assignment.get("rubric", {})
    chat_history = _compact_chat_history(payload.messages)
    rag_context = await _build_rag_context_for_request(
        submission_id=payload.submissionId,
        selected_text=payload.selectedText,
        messages=payload.messages,
        use_rag=bool(payload.useRag),
        rag_top_k=payload.ragTopK,
        submission=submission,
        process_pool=process_pool,
        langchain_rag_service=langchain_rag_service,
    )

    context = _build_context_payload(
        assignment_desc=assignment_desc,
        rubric=rubric,
        selected_text=payload.selectedText,
        chat_history=chat_history,
        rag_context=rag_context,
    )

    prompt = _build_feedback_prompt(
        selected_text=payload.selectedText,
        assignment_desc=assignment_desc,
        rubric=rubric,
        rag_context=rag_context,
    )

    async def generate():
        try:
            coze_timeout = min(Config.COZE_REQUEST_TIMEOUT_SECONDS, STREAM_MAX_WAIT_SECONDS)
            reply = await asyncio.wait_for(
                ai_gateway_service.chat_with_provider(
                    message=prompt,
                    context=context.model_dump(),
                    provider=resolved_provider,
                ),
                timeout=coze_timeout,
            )
            if _should_fallback_to_deepseek(reply):
                async for chunk in _stream_deepseek_chunks(http_client, prompt):
                    yield chunk
                return

            chunks = _chunk_text(reply)
            if not chunks:
                chunks = ["No response content."]

            for part in chunks:
                yield _sse_data_message(part)
                await asyncio.sleep(STREAM_CHUNK_DELAY_SECONDS)

            yield "data: [DONE]\n\n"
        except asyncio.TimeoutError:
            async for chunk in _stream_deepseek_chunks(http_client, prompt):
                yield chunk
        except Exception:  # noqa: BLE001
            logger.exception("Streaming feedback failed for submission_id=%s", payload.submissionId)
            try:
                async for chunk in _stream_deepseek_chunks(http_client, prompt):
                    yield chunk
            except Exception:
                yield f"data: {json.dumps({'error': 'streaming_failed'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@ai_gateway_router.post("/annotate")
async def request_annotation(
    payload: AnnotateSchema,
    ai_gateway_service: AIGatewayService = Depends(get_ai_gateway_service),
    process_pool: ProcessPoolExecutor = Depends(get_process_pool),
    langchain_rag_service=Depends(get_langchain_rag_service),
):
    resolved_provider = resolve_provider(payload.provider, feature="grading.annotate")
    _, assignment, submission = await _get_submission_bundle(payload.submissionId)

    rubric = payload.rubric or assignment.get("rubric", {})
    assignment_desc = payload.assignment or assignment.get("description", "")

    chat_history = _compact_chat_history(payload.messages)
    rag_context = await _build_rag_context_for_request(
        submission_id=payload.submissionId,
        selected_text=payload.selectedText,
        messages=payload.messages,
        use_rag=bool(payload.useRag),
        rag_top_k=payload.ragTopK,
        submission=submission,
        process_pool=process_pool,
        langchain_rag_service=langchain_rag_service,
    )

    prompt = _build_annotation_prompt(
        selected_text=payload.selectedText,
        assignment_desc=assignment_desc,
        rubric=rubric,
        rag_context=rag_context,
    )

    context = _build_context_payload(
        assignment_desc=assignment_desc,
        rubric=rubric,
        selected_text=payload.selectedText,
        chat_history=chat_history,
        rag_context=rag_context,
    )

    reply = await ai_gateway_service.chat_with_provider(
        message=prompt,
        context=context.model_dump(),
        provider=resolved_provider,
    )
    return {
        "annotation": reply,
        "rag": {
            "enabled": bool(payload.useRag),
            "retrieved_count": rag_context.retrieved_count,
            "citations": [
                {
                    "chunk_id": c.chunk_id,
                    "page_num": c.page_num,
                    "score": c.score,
                    "preview": str(c.text or "")[:120],
                }
                for c in rag_context.retrieved_chunks[:3]
            ],
        },
    }


@ai_gateway_router.post("/rag/debug")
async def debug_rag(
    payload: FeedbackSchema,
    process_pool: ProcessPoolExecutor = Depends(get_process_pool),
    langchain_rag_service=Depends(get_langchain_rag_service),
):
    _, _, submission = await _get_submission_bundle(payload.submissionId)
    chat_history = _compact_chat_history(payload.messages)
    retrieval_query = _build_retrieval_query(payload.selectedText, chat_history)

    if not payload.useRag:
        return {
            "retrieved_count": 0,
            "retrieved_chunks": [],
            "engine": "disabled",
            "message": "RAG is disabled by request (useRag=false).",
        }

    submission_text = await _read_submission_text(submission, process_pool)
    top_k = _normalize_rag_top_k(payload.ragTopK)

    if langchain_rag_service is not None:
        raw_context = await asyncio.to_thread(
            langchain_rag_service.build_rag_context,
            payload.submissionId,
            submission_text,
            retrieval_query,
            top_k,
        )
        engine = "langchain"
    else:
        raw_context = await _run_in_process_pool(
            process_pool,
            _build_local_rag_context_job,
            submission_text,
            retrieval_query,
            top_k,
        )
        engine = "fallback-local"

    rag_context = RagContextSchema.model_validate(raw_context)
    return {
        **rag_context.model_dump(),
        "engine": engine,
        "message": "RAG retrieval ready for chat.",
    }
