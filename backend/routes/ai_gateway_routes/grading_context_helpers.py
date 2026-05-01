"""Shared utilities: submission I/O, RAG context, prompt building, streaming."""
from __future__ import annotations

import asyncio
import json
import logging
from concurrent.futures import ProcessPoolExecutor
from functools import partial
from pathlib import Path
from typing import Any

import httpx
from fastapi import HTTPException
from pydantic import JsonValue

from backend.config import Config
from backend.prompts import prompt_registry
from backend.schemas import ChatMessageSchema, GradingContextSchema, RagContextSchema
from backend.services.grading_service import find_submission_v2, get_document
from backend.services.tfidf_rag_service import LocalRagService
from backend.utils.pdf_extractor import extract_text_from_pdf
from .router import (
    DEFAULT_RAG_TOP_K,
    DEEPSEEK_STREAM_URL,
    STREAM_TEXT_CHUNK_SIZE,
)

logger = logging.getLogger(__name__)


# ── Submission / PDF infrastructure ──

def _extract_text_from_pdf_job(path_text: str) -> str:
    return extract_text_from_pdf(Path(path_text), use_fast=True)


def _build_local_rag_context_job(document_text: str, query: str, top_k: int) -> dict[str, Any]:
    service = LocalRagService()
    return service.build_rag_context(document_text=document_text, query=query, top_k=top_k)


async def _run_in_process_pool(process_pool: ProcessPoolExecutor, func, *args):
    loop = asyncio.get_running_loop()
    job = partial(func, *args)
    return await loop.run_in_executor(process_pool, job)


def _resolve_submission_pdf_path(submission: dict[str, Any]) -> Path:
    pdf_path = str((submission or {}).get("pdfPath", ""))
    # parents[2] = backend/, parents[3] = project root
    backend_dir = Path(__file__).resolve().parents[2]
    root_dir = backend_dir.parent

    # Normalize: strip leading slash (matches annotation_service.get_source_pdf_path logic)
    normalized = pdf_path.lstrip("/")
    if not normalized:
        raise HTTPException(status_code=422, detail="Submission has no PDF path")

    candidate = Path(normalized)
    if candidate.is_absolute():
        resolved = candidate.resolve()
    elif normalized.startswith("data/"):
        # data/ paths are relative to project root
        resolved = (root_dir / normalized).resolve()
    elif normalized.startswith(("uploads/", "test_pdf/")):
        # uploads/ and test_pdf/ are relative to backend/
        resolved = (backend_dir / normalized).resolve()
    else:
        # Unknown prefix: try backend/ first, then project root
        resolved = (backend_dir / normalized).resolve()
        if not resolved.exists():
            resolved = (root_dir / normalized).resolve()

    # Prevent path traversal — resolved path must be under the project root
    if not resolved.is_relative_to(root_dir):
        raise HTTPException(status_code=403, detail="Access denied: path outside project root")
    return resolved


async def _get_submission_bundle(submission_id: str):
    course, assignment, submission = await find_submission_v2(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    # Backfill pdfPath from linked document record if missing (mirrors get_submission_bundle logic)
    if not submission.get("pdfPath") and submission.get("latestDocumentId"):
        doc_record = await get_document(submission["latestDocumentId"])
        if doc_record and doc_record.get("storageKey"):
            submission = {**submission, "pdfPath": doc_record["storageKey"]}
    return course, assignment, submission


async def _read_submission_text(submission: dict[str, Any], process_pool: ProcessPoolExecutor) -> str:
    candidate = _resolve_submission_pdf_path(submission)
    text = await _run_in_process_pool(process_pool, _extract_text_from_pdf_job, str(candidate))
    if not text.strip():
        logger.warning(
            "Empty text from PDF: path=%s exists=%s pdfPath=%r",
            candidate, candidate.exists(), submission.get("pdfPath", ""),
        )
    return text


# ── RAG context helpers ──

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


# ── Prompt builders ──

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


# ── Streaming utilities ──

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
