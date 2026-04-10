import base64
import os
import json
import time
import traceback
import re
import uuid
import hashlib
from datetime import datetime, timezone
from typing import Any
from fastapi import APIRouter, Depends, Request, UploadFile, File, HTTPException, Query
from fastapi.responses import JSONResponse, FileResponse
from werkzeug.utils import secure_filename

# 引入你的 Service 层工具
from backend.services.questions_service import (
    allowed_file, call_zhipu_ocr,
    call_provider_generate,
    extract_pdf_text_with_loader, call_zhipu_layout_from_text
)
from backend.core.ai_provider import resolve_provider
from backend.core.security import get_current_user
from backend.core.database import db
from backend.schemas import (
    ExtractQuestionsSchema, GenerateQuestionsSchema,
    SuggestConstraintsSchema,
    UploadScreenshotSchema,
    QuestionOpsRunCreateSchema,
    QuestionOpsDedupeApplySchema,
)
from backend.config import Config
from backend.infrastructure import llm_telemetry, TelemetryTimer
from backend.services.ai_gateway_service import AIGatewayService

questions_router = APIRouter(prefix="/api/questions", tags=["Question Generator"])

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


def _normalize_question_line(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"^\s*\d+[\.)]\s*", "", str(text or "").strip())).lower()


def _parse_question_candidates(source_text: str) -> list[str]:
    lines = [ln.strip() for ln in str(source_text or "").splitlines() if ln.strip()]
    candidates: list[str] = []
    for line in lines:
        if re.match(r"^\d+[\.)]\s+", line) or line.endswith("?"):
            candidates.append(line)
    if not candidates:
        for chunk in re.split(r"\n\s*\n", str(source_text or "")):
            sentence = chunk.strip()
            if sentence:
                candidates.append(sentence[:220])
    return candidates[:120]


def _estimate_generated_question_count(text: str) -> int:
    content = str(text or "")
    if not content.strip():
        return 0

    patterns = [
        r"(?m)^\s*(?:\*\*)?\s*\d+[\.|\)|、]\s+",              # 1. / 1) / 1、
        r"(?m)^\s*(?:Q(?:uestion)?\s*)\d+[\.:)]\s*",           # Question 1: / Q1:
        r"(?m)^\s*(?:第\s*\d+\s*题)",                           # 第1题
    ]

    max_hits = 0
    for pattern in patterns:
        try:
            hits = len(re.findall(pattern, content, flags=re.IGNORECASE))
            max_hits = max(max_hits, hits)
        except re.error:
            continue
    return max_hits


def _score_question_item(question: str) -> dict[str, Any]:
    text = str(question or "")
    length = len(text)
    complexity = min(1.0, max(0.2, (length / 140.0)))
    has_numeric = bool(re.search(r"\d", text))
    has_verb = bool(re.search(r"\b(explain|derive|compare|analyze|prove|calculate|design|evaluate)\b", text, re.IGNORECASE))
    quality = round(min(1.0, 0.45 + complexity * 0.35 + (0.1 if has_numeric else 0.0) + (0.1 if has_verb else 0.0)), 3)

    tags: list[str] = []
    if re.search(r"\b(define|what is|state)\b", text, re.IGNORECASE):
        tags.append("concept_recall")
    if re.search(r"\b(calculate|compute|derive)\b", text, re.IGNORECASE):
        tags.append("quantitative")
    if re.search(r"\b(compare|analyze|evaluate|why)\b", text, re.IGNORECASE):
        tags.append("reasoning")
    if not tags:
        tags.append("general")

    return {
        "quality_score": quality,
        "coverage_tags": tags,
        "difficulty_estimate": "high" if quality >= 0.82 else ("medium" if quality >= 0.68 else "low"),
    }


async def _resolve_question_ops_source(request: Request, user: dict, task_id: str | None, source_text: str | None) -> str:
    if source_text and source_text.strip():
        return source_text.strip()

    if task_id:
        task = _get_task(request, task_id)
        if task:
            generated_path = task.get("generated_questions_path")
            if generated_path and os.path.exists(generated_path):
                with open(generated_path, "r", encoding="utf-8") as f:
                    return f.read()

    latest = await db.sub2_generation_history.find_one(
        {"user_id": user.get("id", "")},
        sort=[("created_at", -1)],
    )
    if latest and latest.get("result_full"):
        return str(latest.get("result_full"))

    raise HTTPException(status_code=400, detail="No source content found. Generate questions first or provide source_text.")


@questions_router.post("/upload")
async def upload_file(request: Request, file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    try:
        if not file.filename:
            return JSONResponse(content={'error': 'Empty filename'}, status_code=400)

        if allowed_file(file.filename):
            display_filename = secure_filename(file.filename)
            if not display_filename:
                return JSONResponse(content={'error': 'Invalid filename'}, status_code=400)

            stem, ext = os.path.splitext(display_filename)
            storage_filename = f"{uuid.uuid4().hex[:12]}_{stem}{ext.lower()}"
            filepath = os.path.join(Config.UPLOAD_FOLDER_SUB2, storage_filename)

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
            if storage_filename.lower().endswith('.pdf'):
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
            _set_task(request, task_id, {
                'uploaded_file': filepath,
                'uploaded_filename': display_filename,
                'uploaded_storage_name': storage_filename,
                'file_type': file_type,
                'total_pages': total_pages,
            })

            return {'success': True, 'filename': display_filename, 'total_pages': total_pages, 'file_type': file_type, 'task_id': task_id}

        return JSONResponse(content={'error': 'File type not allowed'}, status_code=400)
    except Exception as e:
        return JSONResponse(content={'error': str(e)}, status_code=500)


@questions_router.post("/extract_questions")
async def extract_questions_route(req: ExtractQuestionsSchema, request: Request, user: dict = Depends(get_current_user)):
    timer = TelemetryTimer(
        provider="zhipu", model="glm-4v/glm-4-plus",
        endpoint="sub2/extract", user_id=user.get('id', ''),
        api_type="vision", credential_alias="ZHIPU_API_KEY",
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
                structured_data = call_zhipu_layout_from_text(extracted_markdown, extract_prompt=req.prompt)
            else:
                structured_data = call_zhipu_ocr(uploaded_file, extract_prompt=req.prompt)

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


@questions_router.post("/generate_questions")
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
                    ocr_struct = call_zhipu_ocr(uploaded_file, extract_prompt='exercise')
                    base_content = json.dumps(ocr_struct.get('exercises', []), ensure_ascii=False)
            else:
                if cache_path and os.path.exists(cache_path):
                    with open(cache_path, 'r', encoding='utf-8') as f:
                        extracted_data = json.load(f)
                    base_content = json.dumps(extracted_data['result']['llm_json'].get('exercises', []), ensure_ascii=False)
                elif uploaded_file and os.path.exists(uploaded_file) and uploaded_file.lower().endswith('.pdf'):
                    # Fallback to raw PDF text if extraction cache is missing
                    base_content = extract_pdf_text_with_loader(uploaded_file, req.page_numbers)
                else:
                    return JSONResponse(
                        content={'success': False, 'error': 'No extracted content found for screenshot-based generation.'},
                        status_code=400,
                    )

            difficulty_label = Config.DIFFICULTY_MAP.get(int(req.difficulty), str(req.difficulty)) if str(req.difficulty).isdigit() else str(req.difficulty)
            constraint_text = "; ".join(req.constraints) if req.constraints else "None"
            user_reqs = (
                f"Type: {req.question_type}, "
                f"Count: {req.num_questions}, "
                f"Difficulty: {difficulty_label}, "
                f"Constraints: {constraint_text}, "
                f"Output Language: {req.output_language}, "
                f"Source Type: {source_type}"
            )

            result_text = await call_provider_generate(
                base_content=base_content,
                user_requirements=user_reqs,
                provider=resolved_provider,
                output_language=req.output_language,
                question_basis='example_images' if source_type == 'screenshot_set' else None,
                knowledge_points="",
                saved_screenshots=req.saved_screenshots,
                target_question_count=req.num_questions,
            )

            generated_count = _estimate_generated_question_count(result_text)
            target_count = max(1, int(req.num_questions))
            if generated_count < target_count:
                topup_prompt = (
                    f"The previous output contains only {generated_count} questions, but the required count is exactly {target_count}. "
                    f"Please regenerate the full result and return exactly {target_count} complete questions (with options, answers, and explanations). "
                    "Return only the final question set in markdown."
                )
                result_text = await call_provider_generate(
                    base_content=base_content,
                    user_requirements=f"{user_reqs}; Retry reason: insufficient question count ({generated_count}/{target_count}). {topup_prompt}",
                    provider=resolved_provider,
                    output_language=req.output_language,
                    question_basis='example_images' if source_type == 'screenshot_set' else None,
                    knowledge_points="",
                    saved_screenshots=req.saved_screenshots,
                    target_question_count=target_count,
                )

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
        await db.sub2_generation_history.insert_one({
            'user_id': user.get('id', ''),
            'params': {
                'question_type': req.question_type,
                'num_questions': req.num_questions,
                'difficulty': req.difficulty,
                'constraints': req.constraints,
                'output_language': req.output_language,
                'source_type': req.source_type,
                'saved_screenshots_count': len(req.saved_screenshots or []),
                'page_numbers': req.page_numbers,
            },
            'source': {
                'task_id': req.task_id,
                'file_path': source_file_path,
                'file_name': source_file_name,
                'file_type': source_file_type,
                'total_pages': source_total_pages,
            },
            'result_preview': result_text[:500],
            'result_full': result_text,
            'created_at': datetime.now(timezone.utc),
        })
    except Exception:
        pass  # history save failure should not block the response

    return {'success': True, 'questions': result_text}


@questions_router.post("/suggest_constraints")
async def suggest_constraints_route(req: SuggestConstraintsSchema, request: Request, user: dict = Depends(get_current_user)):
    """Suggest Step3 additional requirements from current task source content.

    Returns suggestion strings only; front-end should show as hints and not auto-fill the constraints box.
    """
    resolved_provider = resolve_provider(req.provider, feature="questions.generate", user=user)
    timer = TelemetryTimer(
        provider=resolved_provider,
        model="question-constraints-suggester",
        endpoint="sub2/suggest_constraints",
        user_id=user.get('id', ''),
        api_type="chat",
        credential_alias="COZE_TOKEN" if resolved_provider == "coze" else "OLLAMA_BASE_URL",
    )

    with timer:
        try:
            task = _get_task(request, req.task_id)
            if not task:
                return JSONResponse(content={'success': False, 'error': 'Invalid task_id'}, status_code=400)

            uploaded_file = task.get('uploaded_file')
            cache_path = task.get('extracted_content_path')

            source_text = ''
            if req.source_type == 'screenshot_set':
                if cache_path and os.path.exists(cache_path):
                    with open(cache_path, 'r', encoding='utf-8') as f:
                        extracted_data = json.load(f)
                    source_text = json.dumps(extracted_data.get('result', {}).get('llm_json', {}).get('exercises', []), ensure_ascii=False)
                elif uploaded_file and os.path.exists(uploaded_file):
                    if uploaded_file.lower().endswith('.pdf'):
                        source_text = extract_pdf_text_with_loader(uploaded_file, req.page_numbers)
                    else:
                        ocr_struct = call_zhipu_ocr(uploaded_file, extract_prompt='exercise')
                        source_text = json.dumps(ocr_struct.get('exercises', []), ensure_ascii=False)
            else:
                if not uploaded_file or not os.path.exists(uploaded_file):
                    return JSONResponse(content={'success': False, 'error': 'Uploaded file not found, please re-upload.'}, status_code=400)
                if uploaded_file.lower().endswith('.pdf'):
                    source_text = extract_pdf_text_with_loader(uploaded_file, req.page_numbers)
                else:
                    ocr_struct = call_zhipu_ocr(uploaded_file, extract_prompt='exercise')
                    source_text = json.dumps(ocr_struct.get('exercises', []), ensure_ascii=False)

            if not str(source_text).strip():
                return JSONResponse(content={'success': False, 'error': 'No source content available for suggestions.'}, status_code=400)

            snippet = str(source_text)[:6000]
            lang = str(req.output_language or 'English').strip()
            prompt = (
                "You are an educational question-generation assistant. "
                "Based on the source content and generation settings, suggest concise Additional Requirements for question generation.\n"
                "Return ONLY a JSON array of 4 to 6 short strings.\n"
                "Each string should be one practical requirement (no numbering, no markdown).\n"
                "Language must follow Output Language exactly.\n\n"
                f"Question Type: {req.question_type}\n"
                f"Question Count: {req.num_questions}\n"
                f"Difficulty: {req.difficulty}\n"
                f"Output Language: {lang}\n"
                f"Source Type: {req.source_type}\n"
                f"Source Content Snippet:\n{snippet}"
            )

            ai = AIGatewayService()
            raw = await ai.chat_with_provider(
                message=prompt,
                context={"coze_user_id": "sub2_user"},
                provider=resolved_provider,
            )

            suggestions: list[str] = []
            try:
                parsed = json.loads(str(raw).strip())
                if isinstance(parsed, list):
                    suggestions = [str(x).strip() for x in parsed if str(x).strip()]
            except Exception:
                pass

            if not suggestions:
                m = re.search(r"\[[\s\S]*\]", str(raw))
                if m:
                    try:
                        parsed = json.loads(m.group(0))
                        if isinstance(parsed, list):
                            suggestions = [str(x).strip() for x in parsed if str(x).strip()]
                    except Exception:
                        pass

            if not suggestions:
                for line in str(raw).splitlines():
                    txt = re.sub(r"^[\-\*\d\.\)\s]+", "", str(line).strip())
                    if txt:
                        suggestions.append(txt)

            suggestions = suggestions[:6]
            await timer.save(success=True)
            return {'success': True, 'suggestions': suggestions}
        except Exception as e:
            await timer.save(success=False, error=str(e))
            return JSONResponse(content={'success': False, 'error': str(e)}, status_code=500)


@questions_router.post("/export_questions")
def export_questions_route(request: Request, task_id: str = Query(None), user: dict = Depends(get_current_user)):
    """Export generated questions as a Markdown file download.
    Accepts optional task_id query param to identify which task's output to export.
    Falls back to most-recent task in session if task_id is not provided.
    """
    try:
        generated_path = None
        tasks = request.session.get('sub2_tasks', {})

        # Prefer explicit task_id if provided
        if task_id and task_id in tasks:
            gp = tasks[task_id].get('generated_questions_path')
            if gp and os.path.exists(gp):
                generated_path = gp

        # Fall back to most-recent task with a generated file
        if not generated_path:
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


@questions_router.post("/upload_screenshot")
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

@questions_router.get("/generation_history")
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


@questions_router.get("/generation_history/{history_id}")
async def get_generation_detail(history_id: str, user: dict = Depends(get_current_user)):
    """Return full generation result for replay/review."""
    try:
        from bson import ObjectId
        from bson.errors import InvalidId
        try:
            oid = ObjectId(history_id)
        except (InvalidId, Exception):
            return JSONResponse(content={'success': False, 'error': 'Invalid history ID format'}, status_code=400)
        doc = await db.sub2_generation_history.find_one({
            '_id': oid,
            'user_id': user.get('id', ''),
        })
        if not doc:
            return JSONResponse(content={'success': False, 'error': 'Record not found'}, status_code=404)
        return {
            'success': True,
            'id': str(doc.get('_id')),
            'params': doc.get('params', {}),
            'result': doc.get('result_full', ''),
            'created_at': doc.get('created_at', '').isoformat() if hasattr(doc.get('created_at', ''), 'isoformat') else str(doc.get('created_at', '')),
        }
    except Exception as e:
        return JSONResponse(content={'success': False, 'error': str(e)}, status_code=500)


@questions_router.post("/generation_history/{history_id}/replay")
async def replay_generation_history(history_id: str, request: Request, user: dict = Depends(get_current_user)):
    """Rebuild a fresh sub2 task from a history record so replay can restore the uploaded source file context."""
    try:
        from bson import ObjectId
        from bson.errors import InvalidId

        try:
            oid = ObjectId(history_id)
        except (InvalidId, Exception):
            return JSONResponse(content={'success': False, 'error': 'Invalid history ID format'}, status_code=400)

        doc = await db.sub2_generation_history.find_one({'_id': oid, 'user_id': user.get('id', '')})
        if not doc:
            return JSONResponse(content={'success': False, 'error': 'Record not found'}, status_code=404)

        source = doc.get('source', {}) or {}
        source_path = str(source.get('file_path', '') or '')
        if not source_path:
            return JSONResponse(content={'success': False, 'error': 'This history record has no replayable source file.'}, status_code=400)

        source_abs = os.path.abspath(source_path)
        upload_root_abs = os.path.abspath(Config.UPLOAD_FOLDER_SUB2)
        if not source_abs.startswith(upload_root_abs):
            return JSONResponse(content={'success': False, 'error': 'Replay source path is invalid.'}, status_code=400)
        if not os.path.exists(source_abs):
            return JSONResponse(content={'success': False, 'error': 'Source file no longer exists on server.'}, status_code=404)

        file_type = str(source.get('file_type', '') or '').strip() or ('pdf' if source_abs.lower().endswith('.pdf') else 'image')
        total_pages = int(source.get('total_pages', 0) or 0)
        if file_type == 'pdf' and total_pages <= 0:
            try:
                import PyPDF2
                with open(source_abs, 'rb') as f:
                    reader = PyPDF2.PdfReader(f)
                    total_pages = len(reader.pages)
            except Exception:
                total_pages = 0

        new_task_id = uuid.uuid4().hex[:12]
        replay_task = {
            'uploaded_file': source_abs,
            'uploaded_filename': str(source.get('file_name') or os.path.basename(source_abs)),
            'file_type': file_type,
            'total_pages': total_pages,
        }
        _set_task(request, new_task_id, replay_task)

        params = doc.get('params', {}) or {}
        return {
            'success': True,
            'task_id': new_task_id,
            'filename': replay_task['uploaded_filename'],
            'file_type': file_type,
            'total_pages': total_pages,
            'page_numbers': params.get('page_numbers', []),
            'source_type': params.get('source_type', 'pdf'),
        }
    except Exception as e:
        return JSONResponse(content={'success': False, 'error': str(e)}, status_code=500)


# ── QuestionOps (Phase 1 MVP) ──

@questions_router.post("/ops/runs")
async def create_question_ops_run(
    payload: QuestionOpsRunCreateSchema,
    request: Request,
    user: dict = Depends(get_current_user),
):
    source_text = await _resolve_question_ops_source(request, user, payload.task_id, payload.source_text)
    questions = _parse_question_candidates(source_text)
    if not questions:
        raise HTTPException(status_code=400, detail="No question candidates found in source text.")

    run_id = uuid.uuid4().hex
    now = datetime.now(timezone.utc)
    dedupe_threshold = float(payload.dedupe_threshold or 0.82)

    normalized_seen: dict[str, str] = {}
    items: list[dict[str, Any]] = []
    duplicate_count = 0
    for idx, question in enumerate(questions, start=1):
        base = _score_question_item(question)
        normalized = _normalize_question_line(question)
        is_duplicate = normalized in normalized_seen
        if is_duplicate:
            duplicate_count += 1
        else:
            normalized_seen[normalized] = f"q{idx}"

        item_id = f"q{idx}"
        items.append(
            {
                "run_id": run_id,
                "item_id": item_id,
                "question": question,
                "normalized": normalized,
                "quality_score": base["quality_score"],
                "coverage_tags": base["coverage_tags"],
                "difficulty_estimate": base["difficulty_estimate"],
                "is_duplicate": is_duplicate,
                "status": "pending_review",
                "created_at": now,
                "updated_at": now,
            }
        )

    avg_quality = round(sum(i["quality_score"] for i in items) / len(items), 3)
    source_digest = hashlib.sha256(source_text.encode("utf-8", errors="ignore")).hexdigest()

    run_doc = {
        "run_id": run_id,
        "user_id": user.get("id", ""),
        "course_id": payload.course_id,
        "task_id": payload.task_id,
        "status": "completed",
        "source_digest": source_digest,
        "dedupe_threshold": dedupe_threshold,
        "summary": {
            "question_count": len(items),
            "duplicate_count": duplicate_count,
            "avg_quality_score": avg_quality,
        },
        "created_at": now,
        "updated_at": now,
    }

    await db.question_ops_runs.insert_one(run_doc)
    if items:
        await db.question_ops_items.insert_many(items)

    return {
        "success": True,
        "run_id": run_id,
        "status": "completed",
        "summary": run_doc["summary"],
    }


@questions_router.get("/ops/runs/{run_id}")
async def get_question_ops_run(run_id: str, user: dict = Depends(get_current_user)):
    doc = await db.question_ops_runs.find_one({"run_id": run_id, "user_id": user.get("id", "")}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="QuestionOps run not found")

    for key in ("created_at", "updated_at"):
        if hasattr(doc.get(key), "isoformat"):
            doc[key] = doc[key].isoformat()
    return {"success": True, "run": doc}


@questions_router.get("/ops/runs/{run_id}/items")
async def get_question_ops_items(
    run_id: str,
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(get_current_user),
):
    run_doc = await db.question_ops_runs.find_one({"run_id": run_id, "user_id": user.get("id", "")}, {"_id": 1})
    if not run_doc:
        raise HTTPException(status_code=404, detail="QuestionOps run not found")

    cursor = db.question_ops_items.find({"run_id": run_id}, {"_id": 0, "normalized": 0}).sort("item_id", 1).limit(limit)
    items: list[dict[str, Any]] = []
    async for doc in cursor:
        for key in ("created_at", "updated_at"):
            if hasattr(doc.get(key), "isoformat"):
                doc[key] = doc[key].isoformat()
        items.append(doc)
    return {"success": True, "items": items, "count": len(items)}


@questions_router.post("/ops/runs/{run_id}/apply-dedupe")
async def apply_question_ops_dedupe(
    run_id: str,
    payload: QuestionOpsDedupeApplySchema,
    user: dict = Depends(get_current_user),
):
    run_doc = await db.question_ops_runs.find_one({"run_id": run_id, "user_id": user.get("id", "")})
    if not run_doc:
        raise HTTPException(status_code=404, detail="QuestionOps run not found")

    threshold = float(payload.dedupe_threshold if payload.dedupe_threshold is not None else run_doc.get("dedupe_threshold", 0.82))
    all_items = await db.question_ops_items.find({"run_id": run_id}).to_list(length=2000)

    seen: set[str] = set()
    kept = 0
    removed = 0
    now = datetime.now(timezone.utc)
    for item in all_items:
        normalized = str(item.get("normalized", ""))
        quality = float(item.get("quality_score", 0.0))
        is_dup = normalized in seen or bool(item.get("is_duplicate"))
        should_remove = is_dup and quality <= threshold
        if should_remove:
            removed += 1
            status = "deduped"
        else:
            kept += 1
            status = "kept"
            seen.add(normalized)
        await db.question_ops_items.update_one(
            {"run_id": run_id, "item_id": item.get("item_id")},
            {"$set": {"status": status, "updated_at": now}},
        )

    await db.question_ops_runs.update_one(
        {"run_id": run_id},
        {"$set": {
            "updated_at": now,
            "dedupe_threshold": threshold,
            "summary.after_dedupe_kept": kept,
            "summary.after_dedupe_removed": removed,
        }},
    )
    return {
        "success": True,
        "run_id": run_id,
        "kept": kept,
        "removed": removed,
        "threshold": threshold,
    }