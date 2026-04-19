"""Feedback endpoints: non-streaming + SSE streaming."""
from __future__ import annotations

import asyncio
import json
import logging
from concurrent.futures import ProcessPoolExecutor

import httpx
from fastapi import Depends
from fastapi.responses import StreamingResponse

from backend.config import Config
from backend.core.ai_provider import resolve_provider
from backend.core.dependencies import (
    get_ai_gateway_service,
    get_http_client,
    get_langchain_rag_service,
    get_process_pool,
)
from backend.schemas import FeedbackSchema
from backend.services.ai_gateway_service import AIGatewayService
from .router import ai_gateway_router, STREAM_CHUNK_DELAY_SECONDS, STREAM_MAX_WAIT_SECONDS
from .grading_context_helpers import (
    _get_submission_bundle,
    _compact_chat_history,
    _build_rag_context_for_request,
    _build_context_payload,
    _build_feedback_prompt,
    _should_fallback_to_deepseek,
    _stream_deepseek_chunks,
    _sse_data_message,
    _chunk_text,
)

logger = logging.getLogger(__name__)


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
