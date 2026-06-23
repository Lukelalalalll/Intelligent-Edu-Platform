"""Core generation endpoints: upload, extract, generate questions."""
from __future__ import annotations

import json
import os
import time
import traceback

from fastapi import Depends, Request, UploadFile, File
from fastapi.responses import JSONResponse

from backend.config import Config
from backend.core.ai_provider import resolve_provider
from backend.core.database import compute_history_expires_at
from backend.core.security import get_current_user
from backend.infrastructure import TelemetryTimer
from backend.schemas import ExtractQuestionsSchema, GenerateQuestionsSchema
from backend.services.history_service import save_history_record
from backend.services.questions import (
    call_provider_generate,
    extract_text_from_image,
    extract_pdf_text_with_loader, format_extracted_text,
    save_upload_file,
)
from .router import _get_task, _set_task
from fastapi import APIRouter
router = APIRouter()
from .validators import (
    _build_question_type_format_hint, _question_type_key,
    _estimate_generated_question_count, _validate_output_by_type,
    _normalize_fill_in_blank_output, _repair_output_format,
)


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
    resolved_provider = resolve_provider(getattr(req, 'provider', None), feature="questions.extract", user=user)
    timer = TelemetryTimer(
        provider=resolved_provider, model="question-extractor",
        endpoint="sub2/extract", user_id=user.get('id', ''),
        api_type="vision", credential_alias="COZE_TOKEN" if resolved_provider == "coze" else "OLLAMA_BASE_URL",
    )
    with timer:
        try:
            task = _get_task(request, req.task_id)
            if not task:
                return JSONResponse(content={'error': 'Invalid task_id, please re-upload'}, status_code=400)

            uploaded_file = task.get('uploaded_file')
            if not uploaded_file or not os.path.exists(uploaded_file):
                return JSONResponse(content={'error': 'File expired, please re-upload'}, status_code=400)

            if uploaded_file.lower().endswith('.pdf'):
                extracted_markdown = extract_pdf_text_with_loader(uploaded_file, req.page_numbers)
                structured_data = await format_extracted_text(extracted_markdown, extract_prompt=req.prompt, provider=resolved_provider)
            else:
                structured_data = await extract_text_from_image(uploaded_file, extract_prompt=req.prompt, provider=resolved_provider)

        except Exception as e:
            await timer.save(success=False, error=str(e))
            traceback.print_exc()
            return JSONResponse(content={'success': False, 'error': f'Extraction failed: {str(e)}'}, status_code=500)

    await timer.save(success=True)

    cache_filename = f"extract_cache_{req.task_id}_{int(time.time())}.json"
    cache_path = os.path.join(Config.GENERATED_FOLDER_SUB2, cache_filename)
    with open(cache_path, 'w', encoding='utf-8') as f:
        json.dump({'result': {'llm_json': structured_data}}, f, ensure_ascii=False)

    task['extracted_content_path'] = cache_path
    _set_task(request, req.task_id, task)
    return {'success': True, 'data': {'result': {'llm_json': structured_data}}}


@router.post("/generate_questions")
async def generate_questions_route(req: GenerateQuestionsSchema, request: Request, user: dict = Depends(get_current_user)):
    resolved_provider = resolve_provider(req.provider, feature="questions.generate", user=user)
    timer = TelemetryTimer(
        provider=resolved_provider, model="question-generator",
        endpoint="sub2/generate", user_id=user.get('id', ''),
        api_type="chat", credential_alias="COZE_TOKEN" if resolved_provider == "coze" else "OLLAMA_BASE_URL",
    )
    with timer:
        try:
            task = _get_task(request, req.task_id)
            if not task:
                return JSONResponse(content={'success': False, 'error': 'Invalid task_id'}, status_code=400)

            source_type = req.source_type
            # Legacy compatibility: if old clients send question_basis only, map to source_type.
            if req.question_basis == 'example_images' and source_type != 'screenshot_set':
                source_type = 'screenshot_set'

            if source_type == 'screenshot_set' and not req.saved_screenshots:
                return JSONResponse(
                    content={'success': False, 'error': 'Visual reference set is empty. Please curate screenshots first.'},
                    status_code=400,
                )

            base_content = ''
            uploaded_file = task.get('uploaded_file')
            cache_path = task.get('extracted_content_path')

            if source_type == 'pdf':
                if not uploaded_file or not os.path.exists(uploaded_file):
                    return JSONResponse(content={'success': False, 'error': 'Uploaded file not found, please re-upload.'}, status_code=400)
                if uploaded_file.lower().endswith('.pdf'):
                    markdown_text = extract_pdf_text_with_loader(uploaded_file, req.page_numbers)
                    base_content = markdown_text
                else:
                    ocr_struct = await extract_text_from_image(uploaded_file, extract_prompt='exercise', provider=resolved_provider)
                    base_content = json.dumps(ocr_struct.get('exercises', []), ensure_ascii=False)
            else:
                if cache_path and os.path.exists(cache_path):
                    with open(cache_path, 'r', encoding='utf-8') as f:
                        extracted_data = json.load(f)
                    base_content = json.dumps(extracted_data['result']['llm_json'].get('exercises', []), ensure_ascii=False)
                elif uploaded_file and os.path.exists(uploaded_file) and uploaded_file.lower().endswith('.pdf'):
                    base_content = extract_pdf_text_with_loader(uploaded_file, req.page_numbers)
                else:
                    return JSONResponse(
                        content={'success': False, 'error': 'No extracted content found for screenshot-based generation.'},
                        status_code=400,
                    )

            difficulty_label = Config.DIFFICULTY_MAP.get(int(req.difficulty), str(req.difficulty)) if str(req.difficulty).isdigit() else str(req.difficulty)
            constraint_text = "; ".join(req.constraints) if req.constraints else "None"
            format_hint = _build_question_type_format_hint(req.question_type)
            user_reqs = (
                f"Type: {req.question_type}, "
                f"Count: {req.num_questions}, "
                f"Difficulty: {difficulty_label}, "
                f"Constraints: {constraint_text}, "
                f"Output Language: {req.output_language}, "
                f"Source Type: {source_type}."
                f"{format_hint}"
            )

            result_text = await call_provider_generate(
                base_content=base_content,
                user_requirements=user_reqs,
                question_type=req.question_type,
                provider=resolved_provider,
                output_language=req.output_language,
                question_basis='example_images' if source_type == 'screenshot_set' else None,
                knowledge_points="",
                saved_screenshots=req.saved_screenshots,
                target_question_count=req.num_questions,
            )

            target_count = max(1, int(req.num_questions))
            qtype_normalized = _question_type_key(req.question_type)
            if "fill" in qtype_normalized and "blank" in qtype_normalized:
                result_text = _normalize_fill_in_blank_output(result_text)

            max_regen_attempts = 3
            final_issues: list[str] = []
            for _ in range(max_regen_attempts):
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
                    question_basis='example_images' if source_type == 'screenshot_set' else None,
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
                    format_ok, _ = _validate_output_by_type(result_text, target_count, req.question_type)
                    if not format_ok:
                        pass

        except Exception as e:
            await timer.save(success=False, error=str(e))
            return JSONResponse(content={'success': False, 'error': f'Generation failed: {str(e)}'}, status_code=500)

    await timer.save(success=True)

    generated_filename = f"generated_questions_{req.task_id}_{int(time.time())}.md"
    generated_path = os.path.join(Config.GENERATED_FOLDER_SUB2, generated_filename)
    with open(generated_path, 'w', encoding='utf-8') as f:
        f.write(result_text)

    task['generated_questions_path'] = generated_path
    _set_task(request, req.task_id, task)

    # Save to generation history
    try:
        source_file_path = task.get('uploaded_file', '')
        source_file_name = task.get('uploaded_filename', os.path.basename(source_file_path) if source_file_path else '')
        source_file_type = task.get('file_type', 'pdf' if str(source_file_path).lower().endswith('.pdf') else 'image')
        source_total_pages = int(task.get('total_pages', 0) or 0)
        _uid = user.get('id', '')
        _exp = await compute_history_expires_at(_uid)
        await save_history_record(
            tool="questions",
            user_id=_uid,
            params={
                'question_type': req.question_type,
                'num_questions': req.num_questions,
                'difficulty': req.difficulty,
                'constraints': req.constraints,
                'output_language': req.output_language,
                'source_type': req.source_type,
                'saved_screenshots_count': len(req.saved_screenshots or []),
                'page_numbers': req.page_numbers,
            },
            source={
                'task_id': req.task_id,
                'file_path': source_file_path,
                'file_name': source_file_name,
                'file_type': source_file_type,
                'total_pages': source_total_pages,
            },
            result_preview=result_text[:500],
            result_full=result_text,
            expires_at=_exp,
        )
    except Exception:
        pass  # history save failure should not block the response

    return {'success': True, 'questions': result_text}
