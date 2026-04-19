"""Analyze, annotate, and RAG debug endpoints."""
from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ProcessPoolExecutor

from fastapi import Depends

from backend.core.ai_provider import resolve_provider
from backend.core.dependencies import (
    get_ai_gateway_service,
    get_langchain_rag_service,
    get_process_pool,
)
from backend.schemas import AnalyzeSubmissionSchema, AnnotateSchema, FeedbackSchema, RegradeQuestionSchema
from backend.services.ai_gateway_service import AIGatewayService
from backend.services.grading_service import load_annotations
from .router import ai_gateway_router
from .grading_context_helpers import (
    _get_submission_bundle,
    _read_submission_text,
    _compact_chat_history,
    _build_retrieval_query,
    _normalize_rag_top_k,
    _build_rag_context_for_request,
    _build_context_payload,
    _build_annotation_prompt,
    _run_in_process_pool,
    _build_local_rag_context_job,
    RagContextSchema,
)

logger = logging.getLogger(__name__)


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


@ai_gateway_router.post("/analyze/regrade-question")
async def regrade_question(
    payload: RegradeQuestionSchema,
    ai_gateway_service: AIGatewayService = Depends(get_ai_gateway_service),
):
    resolved_provider = resolve_provider(payload.provider, feature="grading.regrade_question")
    _, assignment, _ = await _get_submission_bundle(payload.submissionId)

    rubric = payload.rubric or assignment.get("rubric", {})
    assignment_desc = payload.assignment or assignment.get("description", "")

    response = await ai_gateway_service.regrade_single_question(
        rubric=rubric,
        assignment=assignment_desc,
        question_id=str(payload.questionId or "Q?").strip() or "Q?",
        question_text=str(payload.questionText or "").strip(),
        student_answer=str(payload.studentAnswer or "").strip(),
        reference_answer=str(payload.referenceAnswer or "").strip(),
        key_points=payload.keyPoints or [],
        max_score=float(payload.maxScore or 0),
        provider=resolved_provider,
    )

    return {
        "analysis": response,
        "rubric": rubric,
        "assignment": assignment,
    }


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
