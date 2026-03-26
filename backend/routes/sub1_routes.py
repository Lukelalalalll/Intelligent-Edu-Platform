import os
import shutil
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from fastapi.responses import JSONResponse
from werkzeug.utils import secure_filename
from backend.services.sub1_service import Sub1Service
from backend.config import Config
from backend.core.security import get_current_user
from backend.schemas import CombineSchema, SaveHighlightsSchema
import traceback
from backend.schemas import CombineSchema, SaveHighlightsSchema, SummarizeRequestSchema, GenerateScriptSchema, SummarizeChaptersSchema, PptProcessSchema
from backend.utils.sub1.list_plsholders import PPTTemplateManager


sub1_router = APIRouter(prefix="/api/sub1", tags=["Sub1"])
public_sub1_router = APIRouter(prefix="/sub1", tags=["Sub1Public"])

# Parse cache: {(filepath, use_llm): {"mtime": float, "data": dict}}
_SUB1_PARSE_CACHE = {}


def _get_parsed_data_with_cache(filepath: str, use_llm: bool):
    cache_key = (filepath, bool(use_llm))
    file_mtime = os.path.getmtime(filepath)
    cached = _SUB1_PARSE_CACHE.get(cache_key)
    if cached and cached.get("mtime") == file_mtime:
        return cached["data"]

    parsed = Sub1Service.parse_md(filepath, use_llm)
    _SUB1_PARSE_CACHE[cache_key] = {"mtime": file_mtime, "data": parsed}
    return parsed


@sub1_router.get("/get_themes")
@public_sub1_router.get("/get_themes", include_in_schema=False)
def get_themes():
    try:
        manager = PPTTemplateManager(Config.PPT_TEMPLATES_FOLDER)
        return manager.get_available_themes()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@sub1_router.get("/get_placeholders/{theme_name}")
@public_sub1_router.get("/get_placeholders/{theme_name}", include_in_schema=False)
def get_placeholders(theme_name: str):
    try:
        manager = PPTTemplateManager(Config.PPT_TEMPLATES_FOLDER)
        return manager.get_placeholders(theme_name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@sub1_router.post("/process-ppt")
@sub1_router.post("/generate_ppt")
@public_sub1_router.post("/process-ppt", include_in_schema=False)
@public_sub1_router.post("/generate_ppt", include_in_schema=False)
def process_ppt(req: PptProcessSchema):
    try:
        if not req.ppt_schema:
            raise ValueError("ppt_schema is required")

        filename = Sub1Service.create_ppt(req.ppt_schema)
        return {
            "status": "success",
            "filename": filename,
            "download_url": f"/sub1/download_ppt/{filename}"
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print("🚨 PPT PROCESS ERROR OCCURRED:")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@sub1_router.get("/download_ppt/{filename}")
@public_sub1_router.get("/download_ppt/{filename}", include_in_schema=False)
def download_ppt(filename: str):
    from fastapi.responses import FileResponse

    search_paths = [
        os.path.join(Config.PPT_RESULTS_FOLDER, filename),
        os.path.join(Config.PPT_RESULTS_FOLDER, 'sub1', filename)
    ]

    for path in search_paths:
        if os.path.exists(path):
            return FileResponse(
                path,
                media_type='application/vnd.openxmlformats-officedocument.presentationml.presentation',
                filename=filename
            )

    raise HTTPException(status_code=404, detail="File not found")

@sub1_router.post("/parse-md")
def parse_md(
        file: UploadFile = File(...),
        use_llm: bool = Form(False),
        user: dict = Depends(get_current_user)
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No selected file")

    try:
        filename = secure_filename(file.filename)
        upload_path = os.path.join(Config.SUB1_UPLOAD_FOLDER, filename)

        with open(upload_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        if filename.lower().endswith('.pdf'):
            md_filename = filename.rsplit('.', 1)[0] + ".md"
            target_md_path = os.path.join(Config.SUB1_MD_FOLDER, md_filename)

            from backend.utils.sub1.pdf2md import convert_pdf_to_md
            convert_pdf_to_md(upload_path, target_md_path)
            parsing_path = target_md_path
        else:
            parsing_path = upload_path

        result = _get_parsed_data_with_cache(parsing_path, use_llm)

        return {
            'status': 'success',
            'filename': filename,
            'headers': result['headers'],
            'tables': result['tables']
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@sub1_router.post("/combine")
def combine_sections(req: CombineSchema, user: dict = Depends(get_current_user)):
    """组合选中的章节"""
    try:
        # 1. 寻找文件路径
        filepath = os.path.join(Config.SUB1_UPLOAD_FOLDER, req.filename)
        if not os.path.exists(filepath):
            filepath = os.path.join(Config.UPLOAD_FOLDER, req.filename)

        if req.filename.lower().endswith('.pdf'):
            md_filename = req.filename.rsplit('.', 1)[0] + ".md"
            filepath = os.path.join(Config.SUB1_MD_FOLDER, md_filename)

        if not os.path.exists(filepath):
            raise Exception(f"File not found: {filepath}")

        # 2. 重新解析文件 (调用 Service)
        parsed_data = _get_parsed_data_with_cache(filepath, req.use_llm)
        full_content = parsed_data['full_content']
        all_sections = parsed_data['sections']
        all_headers = parsed_data['headers']

        combined_chunks = []
        # 确保传入的是整数列表，并排序
        sorted_indices = sorted([int(i) for i in req.selected_indices])

        for idx in sorted_indices:
            target_idx = -1
            for i, h in enumerate(all_headers):
                if int(h['index']) == idx:
                    target_idx = i
                    break

            if target_idx != -1:
                section = all_sections[target_idx]
                header_text = all_headers[target_idx]['text']

                # 3. 🌟 恢复完美的切片逻辑 🌟
                start_line = section['start']
                end_line = section['end']
                content_slice = full_content[start_line: end_line + 1]

                # A. 清理开头自带的标题
                if content_slice and content_slice[0].strip().startswith('#'):
                    content_slice = content_slice[1:]

                # B. 清理结尾带入的下个标题
                if content_slice and content_slice[-1].strip().startswith('#'):
                    content_slice = content_slice[:-1]

                # C. 清理末尾空行
                while content_slice and not content_slice[-1].strip():
                    content_slice = content_slice[:-1]
                if content_slice and content_slice[-1].strip().startswith('#'):
                    content_slice = content_slice[:-1]

                # 重新组装：独立标题 + 干净内容
                formatted_header = header_text if header_text.startswith('#') else f"# {header_text}"
                chunk = f"{formatted_header}\n" + '\n'.join(content_slice)
                combined_chunks.append(chunk)

        # 拼接最终文本
        final_markdown = "\n\n===SECTION_BREAK===\n\n".join(combined_chunks)
        new_filename = f"combined_{os.path.splitext(req.filename)[0]}.md"
        output_path = os.path.join(Config.SUB1_MD_FOLDER, new_filename)

        os.makedirs(Config.SUB1_MD_FOLDER, exist_ok=True)
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(final_markdown)

        return {"filename": new_filename}

    except Exception as e:
        # 🌟 核心：打印真实的报错堆栈到终端！
        print("🚨 COMBINE ERROR OCCURRED:")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@sub1_router.post("/save_highlights")
def save_highlights(req: SaveHighlightsSchema, user: dict = Depends(get_current_user)):
    try:
        saved_file = Sub1Service.save_highlights(req.filename, req.highlights)
        return {"message": "Success", "file": saved_file}
    except Exception as e:
        print("SAVE HIGHLIGHTS ERROR OCCURRED:")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@sub1_router.get("/download/{filename}")
def download_combined(filename: str, user: dict = Depends(get_current_user)):
    from fastapi.responses import FileResponse
    for folder in [Config.SUB1_MD_FOLDER, Config.MARKDOWN_FOLDER]:
        path = os.path.join(folder, filename)
        if os.path.exists(path):
            return FileResponse(path)
    raise HTTPException(status_code=404, detail="File not found")


@sub1_router.post("/summarize")
def summarize_highlights(req: SummarizeRequestSchema, user: dict = Depends(get_current_user)):
    """
    处理选中的高亮内容，利用 LLM 生成 PPT 的结构化数据
    """
    import traceback
    try:
        from backend.utils.sub1.section_summarizer import SectionSummarizer
        summarizer = SectionSummarizer()

        structured_content = []
        for section in req.highlights:
            # 提取每一个 section 里高亮的文本
            section_text = "\n".join([h.get('text', '') for h in section.get('highlights', [])])
            if section_text:
                structured_content.append({
                    'title': section.get('sectionTitle', 'Untitled'),
                    'content': section_text
                })

        if not structured_content:
            raise Exception("No valid highlights provided for summarization.")

        results = summarizer.summarize(
            highlights_data=structured_content,
            num_of_bullets=req.num_of_bullets,
            words_each_bullet=req.words_each_bullet
        )

        return {
            'status': 'success',
            'results': results
        }

    except Exception as e:
        print("🚨 SUMMARIZE ERROR OCCURRED:")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@sub1_router.post("/generate_talking_script")
def generate_talking_script(req: GenerateScriptSchema, user: dict = Depends(get_current_user)):
    try:
        scripts, filename = Sub1Service.generate_script(
            slides_results=req.slides_results,
            style=req.script_style,
            title=req.presentation_title
        )

        response_data = {
            'status': 'success',
            'total_scripts': len(scripts),
            'estimated_total_duration': f"{len(scripts) * 2} minutes"  # 简单的预估，或者如果脚本里有可以替换
        }

        # 如果前端要求生成 Word，返回下载链接
        if req.generate_word:
            response_data['word_document'] = {
                'available': True,
                'filename': filename,
                'download_url': f"/sub1/download_script/{filename}"
            }

        return response_data

    except Exception as e:
        print("🚨 SCRIPT GENERATION ERROR OCCURRED:")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@sub1_router.get("/download_script/{filename}")
def download_script(filename: str, user: dict = Depends(get_current_user)):
    from fastapi.responses import FileResponse
    path = os.path.join(Config.SCRIPT_RESULTS_FOLDER, filename)

    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(path, media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                        filename=filename)



@sub1_router.post("/summarize_in_chapters")
def summarize_chapters(req: SummarizeChaptersSchema, user: dict = Depends(get_current_user)):
    try:
        from backend.utils.sub1.section_summarizer import SectionSummarizer
        summarizer = SectionSummarizer()
        # 假设你原来的 summarizer 支持处理带页数限制的章节
        results = summarizer.summarize(req.chapterData, req.num_of_bullets, req.words_each_bullet)
        # 这里你可能需要根据 total_pages 对 results 进行切分或扩充的逻辑
        return {'status': 'success', 'results': results[:req.total_pages]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))