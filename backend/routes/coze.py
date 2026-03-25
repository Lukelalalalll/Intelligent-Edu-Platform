from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from backend.schemas import AnalyzeSubmissionSchema, FeedbackSchema, AnnotateSchema
from backend.routes.grading_helpers import find_submission, load_annotations
from backend.services.coze_service import CozeService
from backend.services.rag_service import LocalRagService
from backend.utils.pdf_extractor import extract_text_from_pdf
from backend.config import Config
from pathlib import Path
import json
import requests

coze_router = APIRouter(prefix="/api/ai", tags=["CozeAI"])
service = CozeService()
fallback_rag_service = LocalRagService()

try:
    from backend.services.langchain_rag_service import LangChainRagService

    rag_service = LangChainRagService(
        persist_root=Config.RAG_VECTORSTORE_DIR,
        embedding_model_name=Config.RAG_EMBEDDING_MODEL,
    )
except Exception:
    rag_service = None


def _compact_chat_history(messages: list[dict] | None, keep_pairs: int = 4) -> list[dict]:
    if not messages:
        return []
    cleaned = []
    for item in messages:
        role = str(item.get("role", "")).strip().lower()
        content = str(item.get("content", "")).strip()
        if role in {"user", "assistant"} and content:
            cleaned.append({"role": role, "content": content})
    return cleaned[-(keep_pairs * 2):]


def _get_submission_bundle(submission_id: str):
    course, assignment, submission = find_submission(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    return course, assignment, submission


def _read_submission_text(submission):
    pdf_path = submission.get("pdfPath", "")
    candidate = Path(pdf_path)
    if not candidate.is_absolute():
        root_dir = Path(__file__).resolve().parents[2]
        candidate = root_dir / pdf_path
    return extract_text_from_pdf(candidate)


def _build_rag_context(submission_id: str, submission_text: str, query: str, top_k: int):
    if rag_service is not None:
        return rag_service.build_rag_context(
            submission_id=submission_id,
            document_text=submission_text,
            query=query,
            top_k=top_k,
        )
    return fallback_rag_service.build_rag_context(
        document_text=submission_text,
        query=query,
        top_k=top_k,
    )


def _compact_rag_for_prompt(rag_context: dict, max_chunks: int = 3, max_text: int = 600) -> dict:
    if not isinstance(rag_context, dict):
        return {}
    chunks = rag_context.get("retrieved_chunks") or []
    compact_chunks = []
    for chunk in chunks[:max_chunks]:
        if not isinstance(chunk, dict):
            continue
        compact_chunks.append(
            {
                "chunk_id": chunk.get("chunk_id"),
                "score": chunk.get("score"),
                "text": str(chunk.get("text", ""))[:max_text],
            }
        )
    return {
        "retrieved_count": len(compact_chunks),
        "retrieved_chunks": compact_chunks,
    }


def _build_feedback_prompt(selected_text: str, assignment_desc: str, rubric: dict, rag_context: dict) -> str:
    rag = _compact_rag_for_prompt(rag_context)
    rag_snippets = "\n\n".join(
        f"[chunk-{chunk.get('chunk_id')}|score={chunk.get('score')}] {chunk.get('text')}"
        for chunk in rag.get("retrieved_chunks", [])
    )
    return f"""
You are a concise grading assistant.

Assignment:
{assignment_desc}

Rubric:
{json.dumps(rubric, ensure_ascii=False)}

Selected student text:
{selected_text}

Retrieved context from submission:
{rag_snippets if rag_snippets else 'No retrieval context available.'}

Task:
Provide actionable feedback focused on clarity, correctness, and rubric alignment.
Keep it short and specific.
""".strip()


@coze_router.post("/analyze")
async def analyze_submission(payload: AnalyzeSubmissionSchema):
    course, assignment, submission = _get_submission_bundle(payload.submissionId)
    text = _read_submission_text(submission)
    rubric = assignment.get("rubric", {})
    assignment_desc = assignment.get("description", "")

    response = await service.analyze_submission(text=text, rubric=rubric, assignment=assignment_desc)
    annotations = load_annotations(payload.submissionId)
    return {
        "analysis": response,
        "rubric": rubric,
        "assignment": assignment,
        "annotations": annotations,
    }


@coze_router.post("/feedback")
async def request_feedback(payload: FeedbackSchema):
    _, assignment, submission = _get_submission_bundle(payload.submissionId)
    submission_text = _read_submission_text(submission)
    chat_history = _compact_chat_history(payload.messages)

    rag_context = {}
    if payload.useRag and submission_text and payload.selectedText:
        rag_context = _build_rag_context(
            submission_id=payload.submissionId,
            submission_text=submission_text,
            query=payload.selectedText,
            top_k=max(1, min(payload.ragTopK, 8)),
        )

    context = {
        "assignment": payload.assignment or assignment.get("description"),
        "rubric": payload.rubric or assignment.get("rubric", {}),
        "selected_text": payload.selectedText,
        "chat_history": chat_history,
        "rag": _compact_rag_for_prompt(rag_context),
    }
    reply = await service.chat(
        message=f"Provide feedback for this selection: {payload.selectedText}",
        context=context,
    )
    return {
        "feedback": reply,
        "rag": {
            "enabled": bool(payload.useRag),
            "retrieved_count": rag_context.get("retrieved_count", 0),
        },
    }


@coze_router.post("/feedback/stream")
async def request_feedback_stream(payload: FeedbackSchema):
    """Streaming feedback endpoint based on the AI Interact SSE pattern."""
    _, assignment, submission = _get_submission_bundle(payload.submissionId)
    submission_text = _read_submission_text(submission)

    rag_context = {}
    if payload.useRag and submission_text and payload.selectedText:
        rag_context = _build_rag_context(
            submission_id=payload.submissionId,
            submission_text=submission_text,
            query=payload.selectedText,
            top_k=max(1, min(payload.ragTopK, 8)),
        )

    prompt = _build_feedback_prompt(
        selected_text=payload.selectedText,
        assignment_desc=payload.assignment or assignment.get("description", ""),
        rubric=payload.rubric or assignment.get("rubric", {}),
        rag_context=rag_context,
    )

    url = "https://api.deepseek.com/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {Config.DEEPSEEK_API_KEY}",
    }
    body = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": "You are a helpful grading assistant."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.4,
        "stream": True,
    }

    def generate():
        try:
            with requests.post(url, headers=headers, json=body, stream=True, timeout=Config.COZE_REQUEST_TIMEOUT_SECONDS) as resp:
                resp.raise_for_status()
                for chunk in resp.iter_content(chunk_size=128):
                    if chunk:
                        yield chunk
        except Exception as exc:  # noqa: BLE001
            yield f"data: {json.dumps({'error': str(exc)})}\n\n".encode("utf-8")

    return StreamingResponse(generate(), media_type="text/event-stream")


@coze_router.post("/annotate")
async def request_annotation(payload: AnnotateSchema):
    _, assignment, submission = _get_submission_bundle(payload.submissionId)
    submission_text = _read_submission_text(submission)

    rag_context = {}
    if payload.useRag and submission_text and payload.selectedText:
        rag_context = _build_rag_context(
            submission_id=payload.submissionId,
            submission_text=submission_text,
            query=payload.selectedText,
            top_k=max(1, min(payload.ragTopK, 8)),
        )

    rubric = payload.rubric or assignment.get("rubric", {})
    assignment_desc = payload.assignment or assignment.get("description", "")
    enriched_selected_text = payload.selectedText
    if rag_context.get("retrieved_chunks"):
        snippets = "\n\n".join(
            f"[chunk-{c['chunk_id']}|score={c['score']}] {c['text']}"
            for c in rag_context["retrieved_chunks"]
        )
        enriched_selected_text = f"{payload.selectedText}\n\nRelevant context from submission:\n{snippets}"

    reply = await service.suggest_annotation(
        selected_text=enriched_selected_text,
        rubric=rubric,
        assignment=assignment_desc,
    )
    return {
        "annotation": reply,
        "rag": {
            "enabled": bool(payload.useRag),
            "retrieved_count": rag_context.get("retrieved_count", 0),
        },
    }


@coze_router.post("/rag/debug")
async def debug_rag(payload: FeedbackSchema):
    """Debug endpoint: return retrieved chunks without LLM call."""
    _, _, submission = _get_submission_bundle(payload.submissionId)
    submission_text = _read_submission_text(submission)
    if not submission_text:
        return {
            "retrieved_count": 0,
            "retrieved_chunks": [],
            "message": "No submission text extracted from PDF.",
        }

    query = payload.selectedText or ""
    if not query.strip():
        raise HTTPException(status_code=400, detail="selectedText is required for RAG debug")

    rag_context = _build_rag_context(
        submission_id=payload.submissionId,
        submission_text=submission_text,
        query=query,
        top_k=max(1, min(payload.ragTopK, 8)),
    )
    rag_context["engine"] = "langchain-chroma" if rag_service is not None else "local-fallback"
    return rag_context
