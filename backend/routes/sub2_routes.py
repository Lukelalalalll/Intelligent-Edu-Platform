import base64
import os
import json
import time
import traceback
from fastapi import APIRouter, Depends, Request, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from werkzeug.utils import secure_filename

# 引入你的 Service 层工具
from backend.services.sub2_service import (
    allowed_file, extract_pdf_pages, call_zhipu_ocr,
    call_coze_generate, create_word_document, create_powerpoint
)
from backend.core.security import get_current_user
from backend.schemas import (
    ExtractQuestionsSchema, GenerateQuestionsSchema,
    ExportQuestionsSchema, UploadScreenshotSchema
)
from backend.config import Config

sub2_router = APIRouter(prefix="/api/sub2", tags=["Sub2 - Question Generator"])


@sub2_router.post("/upload")
async def upload_file(request: Request, file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    try:
        if not file.filename:
            return JSONResponse(content={'error': 'Empty filename'}, status_code=400)

        if allowed_file(file.filename):
            filename = secure_filename(file.filename)
            filepath = os.path.join(Config.UPLOAD_FOLDER_SUB2, filename)

            with open(filepath, "wb") as buffer:
                buffer.write(await file.read())

            total_pages = 0
            file_type = 'image'
            if filename.lower().endswith('.pdf'):
                import PyPDF2
                with open(filepath, 'rb') as f:
                    total_pages = len(PyPDF2.PdfReader(f).pages)
                file_type = 'pdf'

            # 🌟 使用 FastAPI 的 session 记录上传路径
            request.session['uploaded_file'] = filepath
            return {'success': True, 'filename': filename, 'total_pages': total_pages, 'file_type': file_type}

        return JSONResponse(content={'error': 'File type not allowed'}, status_code=400)
    except Exception as e:
        return JSONResponse(content={'error': str(e)}, status_code=500)


@sub2_router.post("/extract_questions")
def extract_questions_route(req: ExtractQuestionsSchema, request: Request, user: dict = Depends(get_current_user)):
    try:
        uploaded_file = request.session.get('uploaded_file')

        if not uploaded_file or not os.path.exists(uploaded_file):
            return JSONResponse(content={'error': 'File expired, please re-upload'}, status_code=400)

        if uploaded_file.lower().endswith('.pdf'):
            work_file = extract_pdf_pages(uploaded_file, req.page_numbers)
        else:
            work_file = uploaded_file

        structured_data = call_zhipu_ocr(work_file)

        cache_filename = f"extract_cache_{int(time.time())}.json"
        cache_path = os.path.join(Config.GENERATED_FOLDER_SUB2, cache_filename)
        with open(cache_path, 'w', encoding='utf-8') as f:
            json.dump({'result': {'llm_json': structured_data}}, f, ensure_ascii=False)

        request.session['extracted_content_path'] = cache_path
        return {'success': True, 'data': {'result': {'llm_json': structured_data}}}

    except Exception as e:
        traceback.print_exc()
        return JSONResponse(content={'success': False, 'error': f'Extraction failed: {str(e)}'}, status_code=500)


@sub2_router.post("/generate_questions")
def generate_questions_route(req: GenerateQuestionsSchema, request: Request, user: dict = Depends(get_current_user)):
    try:
        cache_path = request.session.get('extracted_content_path')
        if not cache_path or not os.path.exists(cache_path):
            return JSONResponse(content={'success': False, 'error': 'No extracted content found'}, status_code=400)

        with open(cache_path, 'r', encoding='utf-8') as f:
            extracted_data = json.load(f)

        base_content = json.dumps(extracted_data['result']['llm_json'].get('exercises', []))
        user_reqs = f"Subject: {req.subject}, Type: {req.question_type}, Count: {req.num_questions}, Difficulty: {req.difficulty}"

        result_text = call_coze_generate(base_content, user_reqs)

        request.session['generated_questions'] = result_text
        return {'success': True, 'questions': result_text}

    except Exception as e:
        return JSONResponse(content={'success': False, 'error': f'Generation failed: {str(e)}'}, status_code=500)


@sub2_router.post("/export_questions")
def export_questions_route(req: ExportQuestionsSchema, request: Request, user: dict = Depends(get_current_user)):
    try:
        questions = request.session.get('generated_questions')
        if not questions:
            return JSONResponse(content={'error': 'No generated questions found'}, status_code=400)

        filename = f"Generated_Questions_{int(time.time())}.md"
        filepath = os.path.join(Config.GENERATED_FOLDER_SUB2, filename)

        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(questions)

        # 🌟 FastAPI 的文件下载返回
        return FileResponse(filepath, media_type='text/markdown', filename=filename)
    except Exception as e:
        return JSONResponse(content={'success': False, 'error': str(e)}, status_code=500)


@sub2_router.post("/upload_screenshot")
def upload_screenshot(req: UploadScreenshotSchema, user: dict = Depends(get_current_user)):
    try:
        img_data = base64.b64decode(req.image.split(',')[1])
        filename = f"snap_{int(time.time())}.png"
        filepath = os.path.join(Config.SCREENSHOTS_FOLDER_SUB2, filename)

        with open(filepath, 'wb') as f:
            f.write(img_data)

        return {'success': True, 'filename': filename}
    except Exception as e:
        return JSONResponse(content={'success': False, 'error': str(e)}, status_code=500)