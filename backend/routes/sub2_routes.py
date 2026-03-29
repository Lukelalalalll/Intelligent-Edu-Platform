import base64
import os
import json
import time
import traceback
import re
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Request, UploadFile, File, HTTPException, Query
from fastapi.responses import JSONResponse, FileResponse
from werkzeug.utils import secure_filename

# 引入你的 Service 层工具
from backend.services.sub2_service import (
    allowed_file, call_zhipu_ocr,
    call_coze_generate,
    extract_pdf_text_with_loader, call_zhipu_layout_from_text
)
from backend.core.security import get_current_user
from backend.core.database import db
from backend.schemas import (
    ExtractQuestionsSchema, GenerateQuestionsSchema,
    UploadScreenshotSchema
)
from backend.config import Config
from backend.infrastructure.telemetry import llm_telemetry

sub2_router = APIRouter(prefix="/api/sub2", tags=["Sub2 - Question Generator"])

# ── Helpers for per-task session state ──

def _get_task(request: Request, task_id: str) -> dict | None:
    """Retrieve a sub2 task dict from session by task_id."""
    tasks = request.session.get('sub2_tasks', {})
    return tasks.get(task_id)


def _set_task(request: Request, task_id: str, data: dict):
    """Store or update a sub2 task dict in session."""
    tasks = request.session.get('sub2_tasks', {})
    # Limit stored tasks to prevent session bloat (keep latest 5)
    if len(tasks) >= 5 and task_id not in tasks:
        oldest_key = next(iter(tasks))
        tasks.pop(oldest_key, None)
    tasks[task_id] = data
    request.session['sub2_tasks'] = tasks


@sub2_router.post("/upload")
async def upload_file(request: Request, file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    try:
        if not file.filename:
            return JSONResponse(content={'error': 'Empty filename'}, status_code=400)

        if allowed_file(file.filename):
            filename = secure_filename(file.filename)
            filepath = os.path.join(Config.UPLOAD_FOLDER_SUB2, filename)

            # Stream upload in chunks to avoid loading entire file into memory
            MAX_UPLOAD_SIZE = Config.MAX_CONTENT_LENGTH
            total_written = 0
            with open(filepath, "wb") as buffer:
                while True:
                    chunk = await file.read(1024 * 256)  # 256KB chunks
                    if not chunk:
                        break
                    total_written += len(chunk)
                    if total_written > MAX_UPLOAD_SIZE:
                        buffer.close()
                        os.remove(filepath)
                        return JSONResponse(content={'error': f'File too large (max {MAX_UPLOAD_SIZE // (1024*1024)}MB)'}, status_code=413)
                    buffer.write(chunk)

            total_pages = 0
            file_type = 'image'
            if filename.lower().endswith('.pdf'):
                import PyPDF2
                with open(filepath, 'rb') as f:
                    reader = PyPDF2.PdfReader(f)
                    total_pages = len(reader.pages)
                    if total_pages > 200:
                        os.remove(filepath)
                        return JSONResponse(content={'error': 'PDF exceeds 200-page limit'}, status_code=400)
                file_type = 'pdf'

            # Generate task_id for this upload session
            task_id = uuid.uuid4().hex[:12]
            _set_task(request, task_id, {'uploaded_file': filepath})

            return {'success': True, 'filename': filename, 'total_pages': total_pages, 'file_type': file_type, 'task_id': task_id}

        return JSONResponse(content={'error': 'File type not allowed'}, status_code=400)
    except Exception as e:
        return JSONResponse(content={'error': str(e)}, status_code=500)


@sub2_router.post("/extract_questions")
async def extract_questions_route(req: ExtractQuestionsSchema, request: Request, user: dict = Depends(get_current_user)):
    t0 = time.perf_counter()
    try:
        task = _get_task(request, req.task_id)
        if not task:
            return JSONResponse(content={'error': 'Invalid task_id, please re-upload'}, status_code=400)

        uploaded_file = task.get('uploaded_file')
        if not uploaded_file or not os.path.exists(uploaded_file):
            return JSONResponse(content={'error': 'File expired, please re-upload'}, status_code=400)

        if uploaded_file.lower().endswith('.pdf'):
            extracted_markdown = extract_pdf_text_with_loader(uploaded_file, req.page_numbers)
            structured_data = call_zhipu_layout_from_text(extracted_markdown, extract_prompt=req.prompt)
        else:
            structured_data = call_zhipu_ocr(uploaded_file, extract_prompt=req.prompt)

        latency = (time.perf_counter() - t0) * 1000
        await llm_telemetry.record(
            provider="zhipu", model="glm-4v/glm-4-plus", endpoint="sub2/extract",
            user_id=user.get('id', ''), latency_ms=latency, success=True,
        )

        cache_filename = f"extract_cache_{req.task_id}_{int(time.time())}.json"
        cache_path = os.path.join(Config.GENERATED_FOLDER_SUB2, cache_filename)
        with open(cache_path, 'w', encoding='utf-8') as f:
            json.dump({'result': {'llm_json': structured_data}}, f, ensure_ascii=False)

        task['extracted_content_path'] = cache_path
        _set_task(request, req.task_id, task)
        return {'success': True, 'data': {'result': {'llm_json': structured_data}}}

    except Exception as e:
        latency = (time.perf_counter() - t0) * 1000
        await llm_telemetry.record(
            provider="zhipu", model="glm-4v/glm-4-plus", endpoint="sub2/extract",
            user_id=user.get('id', ''), latency_ms=latency, success=False, error=str(e),
        )
        traceback.print_exc()
        return JSONResponse(content={'success': False, 'error': f'Extraction failed: {str(e)}'}, status_code=500)


@sub2_router.post("/generate_questions")
async def generate_questions_route(req: GenerateQuestionsSchema, request: Request, user: dict = Depends(get_current_user)):
    t0 = time.perf_counter()
    try:
        task = _get_task(request, req.task_id)
        if not task:
            return JSONResponse(content={'success': False, 'error': 'Invalid task_id'}, status_code=400)

        cache_path = task.get('extracted_content_path')
        if not cache_path or not os.path.exists(cache_path):
            return JSONResponse(content={'success': False, 'error': 'No extracted content found'}, status_code=400)

        with open(cache_path, 'r', encoding='utf-8') as f:
            extracted_data = json.load(f)

        base_content = json.dumps(extracted_data['result']['llm_json'].get('exercises', []), ensure_ascii=False)
        difficulty_label = Config.DIFFICULTY_MAP.get(int(req.difficulty), str(req.difficulty)) if str(req.difficulty).isdigit() else str(req.difficulty)
        constraint_text = "; ".join(req.constraints) if req.constraints else "None"
        user_reqs = (
            f"Subject: {req.subject}, "
            f"Type: {req.question_type}, "
            f"Count: {req.num_questions}, "
            f"Difficulty: {difficulty_label}, "
            f"Constraints: {constraint_text}, "
            f"Output Language: {req.output_language}"
        )

        result_text = call_coze_generate(
            base_content,
            user_reqs,
            output_language=req.output_language,
            question_basis=req.question_basis,
            knowledge_points=req.knowledge_points,
            saved_screenshots=req.saved_screenshots,
        )

        generated_filename = f"generated_questions_{req.task_id}_{int(time.time())}.md"
        generated_path = os.path.join(Config.GENERATED_FOLDER_SUB2, generated_filename)
        with open(generated_path, 'w', encoding='utf-8') as f:
            f.write(result_text)

        task['generated_questions_path'] = generated_path
        _set_task(request, req.task_id, task)

        # Save to generation history
        try:
            await db.sub2_generation_history.insert_one({
                'user_id': user.get('id', ''),
                'params': {
                    'subject': req.subject,
                    'question_type': req.question_type,
                    'num_questions': req.num_questions,
                    'difficulty': req.difficulty,
                    'constraints': req.constraints,
                    'output_language': req.output_language,
                    'question_basis': req.question_basis,
                    'knowledge_points': req.knowledge_points,
                },
                'result_preview': result_text[:500],
                'result_full': result_text,
                'created_at': datetime.now(timezone.utc),
            })
        except Exception:
            pass  # history save failure should not block the response

        latency = (time.perf_counter() - t0) * 1000
        await llm_telemetry.record(
            provider="coze", model="coze-bot", endpoint="sub2/generate",
            user_id=user.get('id', ''), latency_ms=latency, success=True,
        )

        return {'success': True, 'questions': result_text}

    except Exception as e:
        latency = (time.perf_counter() - t0) * 1000
        await llm_telemetry.record(
            provider="coze", model="coze-bot", endpoint="sub2/generate",
            user_id=user.get('id', ''), latency_ms=latency, success=False, error=str(e),
        )
        return JSONResponse(content={'success': False, 'error': f'Generation failed: {str(e)}'}, status_code=500)


@sub2_router.post("/export_questions")
def export_questions_route(request: Request, user: dict = Depends(get_current_user)):
    """Export generated questions as a Markdown file download.
    Accepts optional task_id in JSON body to identify which task's output to export.
    """
    try:
        body = {}
        # Try to parse body for task_id; export also works via session fallback
        import asyncio
        try:
            # Sync route — FastAPI already parsed the body if Content-Type is JSON
            pass
        except Exception:
            pass

        # Look through all tasks to find the latest one with a generated path
        generated_path = None
        tasks = request.session.get('sub2_tasks', {})
        # Prefer the most recently modified task that has a generated file
        for tid in reversed(list(tasks.keys())):
            t = tasks[tid]
            gp = t.get('generated_questions_path')
            if gp and os.path.exists(gp):
                generated_path = gp
                break

        if not generated_path:
            return JSONResponse(content={'error': 'No generated questions found'}, status_code=400)

        filename = f"Generated_Questions_{int(time.time())}.md"
        return FileResponse(generated_path, media_type='text/markdown', filename=filename)
    except Exception as e:
        return JSONResponse(content={'success': False, 'error': str(e)}, status_code=500)


@sub2_router.post("/upload_screenshot")
def upload_screenshot(req: UploadScreenshotSchema, user: dict = Depends(get_current_user)):
    try:
        img_data = base64.b64decode(req.image.split(',')[1])

        def _safe_token(raw: str) -> str:
            token = re.sub(r"[^A-Za-z0-9._-]+", "_", str(raw or "unknown").strip())
            return token.strip("._-") or "unknown"

        chapter = _safe_token(req.chapter_number)
        sub_chapter = _safe_token(req.sub_chapter_number)
        exercise_no = _safe_token(req.exercise_number)

        base_name = f"{chapter}-{sub_chapter}-{exercise_no}"
        filename = f"{base_name}.png"
        filepath = os.path.join(Config.SCREENSHOTS_FOLDER_SUB2, filename)

        suffix = 2
        while os.path.exists(filepath):
            filename = f"{base_name}_{suffix}.png"
            filepath = os.path.join(Config.SCREENSHOTS_FOLDER_SUB2, filename)
            suffix += 1

        with open(filepath, 'wb') as f:
            f.write(img_data)

        return {'success': True, 'filename': filename}
    except Exception as e:
        return JSONResponse(content={'success': False, 'error': str(e)}, status_code=500)


# ── Generation History ──

@sub2_router.get("/generation_history")
async def get_generation_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    user: dict = Depends(get_current_user),
):
    """Return paginated generation history for the current user."""
    try:
        skip = (page - 1) * page_size
        cursor = db.sub2_generation_history.find(
            {'user_id': user.get('id', '')},
            {'result_full': 0},  # exclude full text in list view
        ).sort('created_at', -1).skip(skip).limit(page_size)

        items = []
        async for doc in cursor:
            items.append({
                'id': str(doc['_id']),
                'params': doc.get('params', {}),
                'preview': doc.get('result_preview', ''),
                'created_at': doc.get('created_at', '').isoformat() if hasattr(doc.get('created_at', ''), 'isoformat') else str(doc.get('created_at', '')),
            })

        total = await db.sub2_generation_history.count_documents({'user_id': user.get('id', '')})
        return {'success': True, 'items': items, 'total': total, 'page': page, 'page_size': page_size}
    except Exception as e:
        return JSONResponse(content={'success': False, 'error': str(e)}, status_code=500)


@sub2_router.get("/generation_history/{history_id}")
async def get_generation_detail(history_id: str, user: dict = Depends(get_current_user)):
    """Return full generation result for replay/review."""
    try:
        from bson import ObjectId
        doc = await db.sub2_generation_history.find_one({
            '_id': ObjectId(history_id),
            'user_id': user.get('id', ''),
        })
        if not doc:
            return JSONResponse(content={'success': False, 'error': 'Record not found'}, status_code=404)
        return {
            'success': True,
            'params': doc.get('params', {}),
            'result': doc.get('result_full', ''),
            'created_at': doc.get('created_at', '').isoformat() if hasattr(doc.get('created_at', ''), 'isoformat') else str(doc.get('created_at', '')),
        }
    except Exception as e:
        return JSONResponse(content={'success': False, 'error': str(e)}, status_code=500)