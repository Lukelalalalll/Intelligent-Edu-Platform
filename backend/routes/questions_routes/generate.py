"""Core generation endpoints: upload, extract, generate questions."""
from __future__ import annotations

import asyncio
import json
import os
import time
import traceback
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, Request, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse

from backend.config import Config
from backend.core.ai_provider import resolve_provider
from backend.core.database import compute_history_expires_at
from backend.core.security import get_current_user
from backend.infrastructure import TelemetryTimer
from backend.schemas import ExtractQuestionsSchema, GenerateQuestionsSchema
from backend.services.history_service import save_history_record
from backend.services.questions import (
    build_questions_markdown,
    call_provider_generate,
    extract_pdf_text_with_loader,
    extract_text_from_image,
    format_extracted_text,
    normalize_question_drafts,
    parse_question_markdown,
    save_upload_file,
)

from .router import _get_task, _set_task
from .validators import (
    _build_question_type_format_hint,
    _estimate_generated_question_count,
    _normalize_fill_in_blank_output,
    _question_type_key,
    _repair_output_format,
    _validate_output_by_type,
)

router = APIRouter()


def _json_sse(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _ensure_task_id(req: GenerateQuestionsSchema) -> str:
    return str(req.task_id or uuid.uuid4().hex[:12])


def _load_task(request: Request, task_id: str | None) -> dict[str, Any] | None:
    if not task_id:
        return None
    return _get_task(request, task_id)


async def _build_generation_source(
    *,
    req: GenerateQuestionsSchema,
    request: Request,
    resolved_provider: str,
) -> tuple[str, str, dict[str, Any], dict[str, Any]]:
    task_id = _ensure_task_id(req)
    task = _load_task(request, req.task_id) or {}
    uploaded_file = str(task.get("uploaded_file") or "")
    file_exists = bool(uploaded_file and os.path.exists(uploaded_file))
    source_text = str(req.source_text or "").strip()
    source_kind = "text"
    base_content = ""

    if req.source_type == "screenshot_set":
        if not req.saved_screenshots:
            raise ValueError("Visual reference set is empty. Please curate screenshots first.")
        cache_path = str(task.get("extracted_content_path") or "")
        if cache_path and os.path.exists(cache_path):
            with open(cache_path, "r", encoding="utf-8") as handle:
                extracted_data = json.load(handle)
            base_content = json.dumps(
                extracted_data.get("result", {}).get("llm_json", {}).get("exercises", []),
                ensure_ascii=False,
            )
            source_kind = "screenshot_set"
        elif file_exists and uploaded_file.lower().endswith(".pdf"):
            base_content = extract_pdf_text_with_loader(uploaded_file, req.page_numbers)
            source_kind = "pdf"
        else:
            raise ValueError("No extracted content found for screenshot-based generation.")
    elif file_exists:
        source_kind = "pdf" if uploaded_file.lower().endswith(".pdf") else "image"
        if uploaded_file.lower().endswith(".pdf"):
            base_content = extract_pdf_text_with_loader(uploaded_file, req.page_numbers)
        else:
            ocr_struct = await extract_text_from_image(
                uploaded_file,
                extract_prompt="exercise",
                provider=resolved_provider,
            )
            base_content = json.dumps(ocr_struct.get("exercises", []), ensure_ascii=False)

    if source_text:
        if base_content:
            base_content = (
                f"{base_content}\n\n"
                "[Supplemental Instructor Intent]\n"
                f"{source_text}"
            )
        else:
            base_content = source_text
            source_kind = "text"

    if not str(base_content).strip():
        raise ValueError("Provide source text or upload a PDF before generating questions.")

    source_meta = {
        "task_id": task_id,
        "file_path": uploaded_file if file_exists else "",
        "file_name": str(task.get("uploaded_filename") or ""),
        "file_type": str(task.get("file_type") or ("pdf" if source_kind == "pdf" else source_kind)),
        "total_pages": int(task.get("total_pages", 0) or 0),
        "source_kind": source_kind,
        "source_text_present": bool(source_text),
    }
    return task_id, base_content, task, source_meta


async def _generate_question_bundle(
    *,
    req: GenerateQuestionsSchema,
    request: Request,
    user: dict,
    endpoint_label: str,
) -> dict[str, Any]:
    resolved_provider = resolve_provider(req.provider, feature="questions.generate", user=user)
    timer = TelemetryTimer(
        provider=resolved_provider,
        model="question-generator",
        endpoint=endpoint_label,
        user_id=user.get("id", ""),
        api_type="chat",
        credential_alias="COZE_TOKEN" if resolved_provider == "coze" else "OLLAMA_BASE_URL",
    )

    with timer:
        try:
            task_id, base_content, task, source_meta = await _build_generation_source(
                req=req,
                request=request,
                resolved_provider=resolved_provider,
            )

            difficulty_label = (
                Config.DIFFICULTY_MAP.get(int(req.difficulty), str(req.difficulty))
                if str(req.difficulty).isdigit()
                else str(req.difficulty)
            )
            constraint_text = "; ".join(req.constraints) if req.constraints else "None"
            format_hint = _build_question_type_format_hint(req.question_type)
            user_reqs = (
                f"Type: {req.question_type}, "
                f"Count: {req.num_questions}, "
                f"Difficulty: {difficulty_label}, "
                f"Constraints: {constraint_text}, "
                f"Output Language: {req.output_language}, "
                f"Source Type: {source_meta['source_kind']}."
                f"{format_hint}"
            )

            result_text = await call_provider_generate(
                base_content=base_content,
                user_requirements=user_reqs,
                question_type=req.question_type,
                provider=resolved_provider,
                output_language=req.output_language,
                question_basis="example_images" if req.source_type == "screenshot_set" else None,
                knowledge_points="",
                saved_screenshots=req.saved_screenshots,
                target_question_count=req.num_questions,
            )

            target_count = max(1, int(req.num_questions))
            qtype_normalized = _question_type_key(req.question_type)
            if "fill" in qtype_normalized and "blank" in qtype_normalized:
                result_text = _normalize_fill_in_blank_output(result_text)

            final_issues: list[str] = []
            for _ in range(3):
                generated_count = _estimate_generated_question_count(result_text)
                issues: list[str] = []

                if generated_count < target_count:
                    issues.append(f"insufficient question count ({generated_count}/{target_count})")

                format_ok, format_issue = _validate_output_by_type(result_text, target_count, req.question_type)
                if not format_ok:
                    issues.append(f"invalid {qtype_normalized or 'question'} format: {format_issue}")

                if not issues:
                    final_issues = []
                    break

                final_issues = issues
                retry_prompt = (
                    f"Retry reason: {'; '.join(issues)}. "
                    f"Regenerate the full result and return exactly {target_count} complete questions. "
                    "Each item must include explicit Answer and Explanation lines; "
                    "for multiple-choice include A/B/C/D (or 1/2/3/4) options. "
                    "Return markdown only."
                )
                result_text = await call_provider_generate(
                    base_content=base_content,
                    user_requirements=f"{user_reqs}; {retry_prompt}",
                    question_type=req.question_type,
                    provider=resolved_provider,
                    output_language=req.output_language,
                    question_basis="example_images" if req.source_type == "screenshot_set" else None,
                    knowledge_points="",
                    saved_screenshots=req.saved_screenshots,
                    target_question_count=target_count,
                )
                if "fill" in qtype_normalized and "blank" in qtype_normalized:
                    result_text = _normalize_fill_in_blank_output(result_text)

            if final_issues:
                repaired_text = await _repair_output_format(
                    draft_text=result_text,
                    question_type=req.question_type,
                    expected_count=target_count,
                    output_language=req.output_language,
                    provider=resolved_provider,
                )
                if repaired_text:
                    result_text = repaired_text
                    if "fill" in qtype_normalized and "blank" in qtype_normalized:
                        result_text = _normalize_fill_in_blank_output(result_text)

            question_drafts = normalize_question_drafts(parse_question_markdown(result_text))
            markdown = build_questions_markdown(question_drafts) or str(result_text or "").strip()

            generated_filename = f"generated_questions_{task_id}_{int(time.time())}.md"
            generated_path = os.path.join(Config.GENERATED_FOLDER_SUB2, generated_filename)
            with open(generated_path, "w", encoding="utf-8") as handle:
                handle.write(markdown)

            task["generated_questions_path"] = generated_path
            task["generated_questions_markdown"] = markdown
            task["generated_questions_structured"] = question_drafts
            task["source_text"] = str(req.source_text or "")
            _set_task(request, task_id, task)

            history_payload = {
                "markdown": markdown,
                "questions": question_drafts,
                "selected_question_ids": [item["id"] for item in question_drafts],
                "finalized": False,
            }
            history_id = await save_history_record(
                tool="questions",
                user_id=user.get("id", ""),
                params={
                    "question_type": req.question_type,
                    "num_questions": req.num_questions,
                    "difficulty": req.difficulty,
                    "constraints": req.constraints,
                    "output_language": req.output_language,
                    "source_type": req.source_type,
                    "source_kind": source_meta["source_kind"],
                    "saved_screenshots_count": len(req.saved_screenshots or []),
                    "page_numbers": req.page_numbers,
                    "source_text_present": source_meta["source_text_present"],
                    "provider_requested": req.provider,
                    "provider_resolved": resolved_provider,
                },
                source=source_meta,
                result_preview=markdown[:500],
                result_full=history_payload,
                expires_at=await compute_history_expires_at(user.get("id", "")),
            )
        except Exception as exc:
            await timer.save(success=False, error=str(exc))
            raise

    await timer.save(success=True)
    return {
        "success": True,
        "task_id": task_id,
        "provider": resolved_provider,
        "markdown": markdown,
        "questions": markdown,
        "question_drafts": question_drafts,
        "history_id": history_id,
        "source_kind": source_meta["source_kind"],
    }


@router.post("/upload")
async def upload_file(request: Request, file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    try:
        upload_result = await save_upload_file(file)
        task_id = upload_result["task_id"]
        _set_task(request, task_id, {
            "uploaded_file": upload_result["uploaded_file"],
            "uploaded_filename": upload_result["uploaded_filename"],
            "uploaded_storage_name": upload_result["uploaded_storage_name"],
            "file_type": upload_result["file_type"],
            "total_pages": upload_result["total_pages"],
        })

        return {
            "success": True,
            "filename": upload_result["uploaded_filename"],
            "total_pages": upload_result["total_pages"],
            "file_type": upload_result["file_type"],
            "task_id": task_id,
        }
    except ValueError as exc:
        status_code = 413 if "File too large" in str(exc) else 400
        return JSONResponse(content={"error": str(exc)}, status_code=status_code)
    except Exception as exc:
        return JSONResponse(content={"error": str(exc)}, status_code=500)


@router.post("/extract_questions")
async def extract_questions_route(req: ExtractQuestionsSchema, request: Request, user: dict = Depends(get_current_user)):
    resolved_provider = resolve_provider(getattr(req, "provider", None), feature="questions.extract", user=user)
    timer = TelemetryTimer(
        provider=resolved_provider,
        model="question-extractor",
        endpoint="sub2/extract",
        user_id=user.get("id", ""),
        api_type="vision",
        credential_alias="COZE_TOKEN" if resolved_provider == "coze" else "OLLAMA_BASE_URL",
    )
    with timer:
        try:
            task = _get_task(request, req.task_id)
            if not task:
                return JSONResponse(content={"error": "Invalid task_id, please re-upload"}, status_code=400)

            uploaded_file = task.get("uploaded_file")
            if not uploaded_file or not os.path.exists(uploaded_file):
                return JSONResponse(content={"error": "File expired, please re-upload"}, status_code=400)

            if uploaded_file.lower().endswith(".pdf"):
                extracted_markdown = extract_pdf_text_with_loader(uploaded_file, req.page_numbers)
                structured_data = await format_extracted_text(
                    extracted_markdown,
                    extract_prompt=req.prompt,
                    provider=resolved_provider,
                )
            else:
                structured_data = await extract_text_from_image(
                    uploaded_file,
                    extract_prompt=req.prompt,
                    provider=resolved_provider,
                )
        except Exception as exc:
            await timer.save(success=False, error=str(exc))
            traceback.print_exc()
            return JSONResponse(
                content={"success": False, "error": f"Extraction failed: {str(exc)}"},
                status_code=500,
            )

    await timer.save(success=True)

    cache_filename = f"extract_cache_{req.task_id}_{int(time.time())}.json"
    cache_path = os.path.join(Config.GENERATED_FOLDER_SUB2, cache_filename)
    with open(cache_path, "w", encoding="utf-8") as handle:
        json.dump({"result": {"llm_json": structured_data}}, handle, ensure_ascii=False)

    task["extracted_content_path"] = cache_path
    _set_task(request, req.task_id, task)
    return {"success": True, "data": {"result": {"llm_json": structured_data}}}


@router.post("/generate_questions")
async def generate_questions_route(req: GenerateQuestionsSchema, request: Request, user: dict = Depends(get_current_user)):
    try:
        payload = await _generate_question_bundle(
            req=req,
            request=request,
            user=user,
            endpoint_label="sub2/generate",
        )
        return payload
    except ValueError as exc:
        return JSONResponse(content={"success": False, "error": str(exc)}, status_code=400)
    except Exception as exc:
        return JSONResponse(content={"success": False, "error": f"Generation failed: {str(exc)}"}, status_code=500)


@router.post("/generate_questions/stream")
async def generate_questions_stream_route(
    req: GenerateQuestionsSchema,
    request: Request,
    user: dict = Depends(get_current_user),
):
    async def event_stream():
        try:
            yield _json_sse({"type": "status", "phase": "queued", "message": "Preparing generation"})
            yield _json_sse({"type": "status", "phase": "generating", "message": "Generating question set"})
            payload = await _generate_question_bundle(
                req=req,
                request=request,
                user=user,
                endpoint_label="sub2/generate_stream",
            )
            yield _json_sse({"type": "status", "phase": "parsing", "message": "Structuring generated questions"})
            for index, question in enumerate(payload["question_drafts"]):
                yield _json_sse({
                    "type": "question",
                    "index": index,
                    "question": question,
                })
                await asyncio.sleep(0.03)
            yield _json_sse({
                "type": "complete",
                "task_id": payload["task_id"],
                "history_id": payload["history_id"],
                "provider": payload["provider"],
                "markdown": payload["markdown"],
                "question_drafts": payload["question_drafts"],
                "source_kind": payload["source_kind"],
            })
            yield "data: [DONE]\n\n"
        except ValueError as exc:
            yield _json_sse({"type": "error", "message": str(exc)})
            yield "data: [DONE]\n\n"
        except Exception as exc:
            yield _json_sse({"type": "error", "message": f"Generation failed: {str(exc)}"})
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
