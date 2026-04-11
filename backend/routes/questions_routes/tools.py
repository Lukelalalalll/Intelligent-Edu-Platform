"""Auxiliary endpoints: suggest constraints, export, upload screenshot."""
from __future__ import annotations

import base64
import json
import os
import re
import time

from fastapi import Depends, Request, Query
from fastapi.responses import JSONResponse, FileResponse

from backend.config import Config
from backend.core.ai_provider import resolve_provider
from backend.core.security import get_current_user
from backend.infrastructure import TelemetryTimer
from backend.schemas import SuggestConstraintsSchema, UploadScreenshotSchema
from backend.services.ai_gateway_service import AIGatewayService
from backend.services.questions_service import (
    call_zhipu_ocr, extract_pdf_text_with_loader,
)
from .router import questions_router, _get_task


@questions_router.post("/suggest_constraints")
async def suggest_constraints_route(req: SuggestConstraintsSchema, request: Request, user: dict = Depends(get_current_user)):
    """Suggest Step3 additional requirements from current task source content."""
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
    """Export generated questions as a Markdown file download."""
    try:
        generated_path = None
        tasks = request.session.get('sub2_tasks', {})

        if task_id and task_id in tasks:
            gp = tasks[task_id].get('generated_questions_path')
            if gp and os.path.exists(gp):
                generated_path = gp

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
