import os
import re
import shutil
import logging
import httpx
from typing import Literal, Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from werkzeug.utils import secure_filename
from backend.services.slides_service import Sub1Service
from backend.config import Config
from backend.core.ai_provider import resolve_provider
from backend.core.security import get_current_user
from backend.schemas import CombineSchema, SaveHighlightsSchema, SummarizeRequestSchema, GenerateScriptSchema, SummarizeChaptersSchema, PptProcessSchema, ClassifyHighlightsSchema, MapToSlidesSchema, ValidateSlidesSchema, EvaluateQualitySchema
from backend.services.slides.list_placeholders import PPTTemplateManager
from backend.services.slides.task_tracker import TaskTracker, StepStatus, TaskStatus, AuditLogger

logger = logging.getLogger(__name__)


slides_router = APIRouter(prefix="/api/slides", tags=["Slides"])
public_slides_router = APIRouter(prefix="/slides", tags=["SlidesPublic"])

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


@slides_router.get("/get_themes")
@public_slides_router.get("/get_themes", include_in_schema=False)
def get_themes():
    try:
        manager = PPTTemplateManager(Config.PPT_TEMPLATES_FOLDER)
        return manager.get_available_themes()
    except Exception as e:
        logger.exception("Failed to list themes")
        raise HTTPException(status_code=500, detail="Internal server error")


@slides_router.get("/get_placeholders/{theme_name}")
@public_slides_router.get("/get_placeholders/{theme_name}", include_in_schema=False)
def get_placeholders(theme_name: str):
    try:
        manager = PPTTemplateManager(Config.PPT_TEMPLATES_FOLDER)
        return manager.get_placeholders(theme_name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("Failed to get placeholders for theme")
        raise HTTPException(status_code=500, detail="Internal server error")


@slides_router.post("/process-ppt")
@slides_router.post("/generate_ppt")
async def process_ppt(req: PptProcessSchema, request: Request):
    import asyncio
    from backend.services.slides.checkpoint_manager import CheckpointManager

    request_id = request.headers.get("X-Request-ID") or None
    tracker = TaskTracker(request_id=request_id, task_type="ppt_generate")

    try:
        if not req.ppt_schema:
            raise ValueError("ppt_schema is required")

        with tracker.step("ppt_generate", slides_count=len(req.ppt_schema.get("slides", []) if isinstance(req.ppt_schema, dict) else [])):
            filename = await asyncio.to_thread(Sub1Service.create_ppt, req.ppt_schema)

        tracker.finish(StepStatus.SUCCESS)
        tracker.result_metadata["filename"] = filename

        # Save checkpoint
        await CheckpointManager.save(
            task_id=tracker.request_id,
            step="ppt_generate",
            output={"filename": filename, "download_url": f"/sub1/download_ppt/{filename}"},
            input_data=req.ppt_schema if isinstance(req.ppt_schema, dict) else None,
        )
        await tracker.save()

        return {
            "status": "success",
            "filename": filename,
            "download_url": f"/sub1/download_ppt/{filename}",
            "request_id": tracker.request_id
        }
    except ValueError as e:
        tracker.finish(StepStatus.FAILED)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        tracker.finish(StepStatus.FAILED)
        logger.exception("[%s] PPT generation failed", tracker.request_id)
        raise HTTPException(status_code=500, detail="Internal server error")


@slides_router.get("/download_ppt/{filename}")
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

@slides_router.post("/parse-md")
async def parse_md(
        file: UploadFile = File(...),
        use_llm: bool = Form(False),
        user: dict = Depends(get_current_user),
        request: Request = None
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No selected file")

    request_id = (request.headers.get("X-Request-ID") if request else None)
    tracker = TaskTracker(request_id=request_id, user_id=user.get("username", ""), task_type="parse")
    try:
        filename = secure_filename(file.filename)
        upload_path = os.path.join(Config.SUB1_UPLOAD_FOLDER, filename)

        with open(upload_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        if filename.lower().endswith('.pdf'):
            md_filename = filename.rsplit('.', 1)[0] + ".md"
            target_md_path = os.path.join(Config.SUB1_MD_FOLDER, md_filename)

            with tracker.step("parse", filename=filename, use_llm=use_llm):
                from backend.services.slides.pdf2md import convert_pdf_to_md
                convert_pdf_to_md(upload_path, target_md_path)
            parsing_path = target_md_path
        else:
            parsing_path = upload_path

        with tracker.step("parse" if not filename.lower().endswith('.pdf') else "header_extract", filename=filename):
            result = _get_parsed_data_with_cache(parsing_path, use_llm)

        tracker.finish(StepStatus.SUCCESS)
        tracker.result_metadata["headers_count"] = len(result.get('headers', []))
        await tracker.save()

        return {
            'status': 'success',
            'filename': filename,
            'headers': result['headers'],
            'tables': result['tables'],
            'request_id': tracker.request_id
        }

    except Exception as e:
        tracker.finish(StepStatus.FAILED)
        logger.exception("[%s] Parse failed", tracker.request_id)
        raise HTTPException(status_code=500, detail="Internal server error")


@slides_router.post("/combine")
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
        logger.exception("Combine sections failed")
        raise HTTPException(status_code=500, detail="Internal server error")


@slides_router.post("/save_highlights")
def save_highlights(req: SaveHighlightsSchema, user: dict = Depends(get_current_user)):
    try:
        saved_file = Sub1Service.save_highlights(req.filename, req.highlights)
        return {"message": "Success", "file": saved_file}
    except Exception as e:
        logger.exception("Save highlights failed")
        raise HTTPException(status_code=500, detail="Internal server error")


@slides_router.post("/classify-highlights")
async def classify_highlights(req: ClassifyHighlightsSchema, user: dict = Depends(get_current_user)):
    """
    Classify raw highlights into structured categories with confidence scores.
    Returns enriched highlights with: category, confidence, reason.
    Categories: definition, concept, formula, example, conclusion, caution.
    """
    tracker = TaskTracker(user_id=user.get("username", ""), task_type="classify_highlights")
    try:
        # Flatten highlights from sections format to flat list
        flat_highlights = []
        for section in req.highlights:
            section_title = section.get("sectionTitle", "")
            for h in section.get("highlights", []):
                flat_highlights.append({
                    "text": h.get("text", ""),
                    "id": h.get("id", ""),
                    "sectionTitle": section_title,
                })

        if not flat_highlights:
            return {"status": "success", "highlights": [], "stats": {}}

        from backend.services.slides.highlight_classifier import HighlightClassifier
        classifier = HighlightClassifier()

        with tracker.step("classify_highlights", count=len(flat_highlights)):
            classified = classifier.classify(flat_highlights)

        # Compute stats
        cat_counts = {}
        low_confidence = []
        for h in classified:
            cat = h.get("category", "concept")
            cat_counts[cat] = cat_counts.get(cat, 0) + 1
            if h.get("confidence", 1.0) < 0.6:
                low_confidence.append(h["id"])

        tracker.finish(StepStatus.SUCCESS)
        await tracker.save()

        return {
            "status": "success",
            "highlights": classified,
            "stats": {
                "total": len(classified),
                "by_category": cat_counts,
                "low_confidence_ids": low_confidence,
                "low_confidence_count": len(low_confidence),
            },
            "request_id": tracker.request_id,
        }

    except Exception as e:
        tracker.finish(StepStatus.FAILED)
        logger.exception("[%s] Highlight classification failed", tracker.request_id)
        raise HTTPException(status_code=500, detail="Internal server error")


@slides_router.get("/download/{filename}")
def download_combined(filename: str, user: dict = Depends(get_current_user)):
    from fastapi.responses import FileResponse
    for folder in [Config.SUB1_MD_FOLDER, Config.MARKDOWN_FOLDER]:
        path = os.path.join(folder, filename)
        if os.path.exists(path):
            return FileResponse(path)
    raise HTTPException(status_code=404, detail="File not found")


@slides_router.get("/load_highlights/{filename}")
def load_highlights(filename: str, user: dict = Depends(get_current_user)):
    """加载某个 combined 文件的已保存高亮（flat JSON 列表）"""
    try:
        highlights = Sub1Service.load_highlights(filename)
        return {"highlights": highlights}
    except Exception as e:
        logger.exception("Failed to load highlights for %s", filename)
        raise HTTPException(status_code=500, detail="Internal server error")


# ── Coze Outline Generation ──

OUTLINE_SYSTEM_PROMPT = """You are an expert educational content writer.
Given a topic or keywords, generate well-structured content in Markdown format, suitable for creating a presentation (PPT).

Requirements:
- Use ## for major sections (3-6 sections)
- Use - bullet points for key sub-points under each section
- Each section body: 3-5 concise bullet points
- Write in the same language as the input keywords
- Start directly with the first ## heading, no preamble
- Total length: 300-600 words"""


class CozeOutlineRequest(BaseModel):
    provider: Optional[Literal['coze', 'local_ollama']] = 'local_ollama'

    keywords: str


class ProcessTextRequest(BaseModel):
    text: str
    title: str


async def _call_coze_text_sub1(system_prompt: str, user_content: str, provider: str = "local_ollama") -> str:
    from backend.services.ai_gateway_service import AIGatewayService
    ai_service = AIGatewayService()
    context = {"system_override": system_prompt}
    return await ai_service.chat_with_provider(message=user_content, context=context, provider=provider)
@slides_router.post("/coze-generate-outline")
async def coze_generate_outline(req: CozeOutlineRequest, user: dict = Depends(get_current_user)):
    """Use Coze AI to generate a structured Markdown outline from keywords."""
    keywords = req.keywords.strip()
    if not keywords:
        raise HTTPException(400, "Keywords must not be empty")
    try:
        resolved_provider = resolve_provider(req.provider, feature="slides.generate_outline")
        text = await _call_coze_text_sub1(OUTLINE_SYSTEM_PROMPT, keywords, provider=resolved_provider)
        return {"text": text}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Coze outline generation failed")
        raise HTTPException(500, str(e))


@slides_router.post("/process-text")
async def process_text(req: ProcessTextRequest, user: dict = Depends(get_current_user)):
    """Convert plain text/markdown into a combined MD file (section-break format)."""
    text = req.text.strip()
    title = req.title.strip() or "untitled"
    if not text:
        raise HTTPException(400, "Text must not be empty")

    # Sanitize title for filename
    safe_title = re.sub(r'[^\w\s-]', '', title)[:60].strip().replace(' ', '_') or 'untitled'

    # Split text by ## headings into sections
    parts = re.split(r'(?=^## )', text, flags=re.MULTILINE)
    sections = []
    for part in parts:
        stripped = part.strip()
        if not stripped:
            continue
        # If part doesn't start with ##, wrap it as default section
        if not stripped.startswith('## '):
            sections.append(f"## Overview\n{stripped}")
        else:
            sections.append(stripped)

    if not sections:
        raise HTTPException(400, "Could not parse any sections from the text")

    # Write combined file with SECTION_BREAK format
    filename = f"combined_{safe_title}.md"
    os.makedirs(Config.SUB1_MD_FOLDER, exist_ok=True)
    filepath = os.path.join(Config.SUB1_MD_FOLDER, filename)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write("\n===SECTION_BREAK===\n".join(sections))

    logger.info("process-text: wrote %d sections to %s", len(sections), filename)
    return {"filename": filename, "sections": len(sections)}


@slides_router.post("/summarize")
async def summarize_highlights(req: SummarizeRequestSchema, user: dict = Depends(get_current_user), request: Request = None):
    """
    处理选中的高亮内容，利用 LLM 生成 PPT 的结构化数据。
    Supports idempotency: same input returns cached result.
    """
    request_id = (request.headers.get("X-Request-ID") if request else None)
    tracker = TaskTracker(request_id=request_id, user_id=user.get("username", ""), task_type="summarize")

    from backend.services.slides.checkpoint_manager import CheckpointManager, _compute_hash

    try:
        from backend.services.slides.section_summarizer import SectionSummarizer

        structured_content = []
        for section in req.highlights:
            section_text = "\n".join([h.get('text', '') for h in section.get('highlights', [])])
            if section_text:
                structured_content.append({
                    'title': section.get('sectionTitle', 'Untitled'),
                    'content': section_text
                })

        if not structured_content:
            raise Exception("No valid highlights provided for summarization.")

        # Idempotency check: same input → cached output
        input_for_hash = {
            "content": structured_content,
            "num_of_bullets": req.num_of_bullets,
            "words_each_bullet": req.words_each_bullet,
        }
        input_hash = _compute_hash(input_for_hash)

        cached = await CheckpointManager.load_by_hash(step="summarize", input_hash=input_hash)
        if cached:
            tracker.mark_skipped("summarize")
            tracker.finish(StepStatus.SUCCESS)
            tracker.result_metadata["cache_hit"] = True
            await tracker.save()
            return {
                'status': 'success',
                'results': cached["output"],
                'request_id': tracker.request_id,
                'cached': True
            }

        summarizer = SectionSummarizer()
        with tracker.step("summarize", sections_count=len(structured_content),
                          num_of_bullets=req.num_of_bullets, words_each_bullet=req.words_each_bullet):
            results = await summarizer.summarize_sections(
                highlights_data=structured_content,
                num_of_bullets=req.num_of_bullets,
                words_each_bullet=req.words_each_bullet
            )

        # Detect partial failures
        failed = [r for r in results if r.get("_status") == "failed"]
        if failed and len(failed) < len(results):
            overall_status = "partial_success"
        elif failed and len(failed) == len(results):
            overall_status = "failed"
        else:
            overall_status = "success"

        tracker.finish(StepStatus.SUCCESS if overall_status != "failed" else StepStatus.FAILED)
        tracker.result_metadata["slides_generated"] = len(results)
        tracker.result_metadata["slides_failed"] = len(failed)

        # Save checkpoint for idempotency & resume
        await CheckpointManager.save(
            task_id=tracker.request_id,
            step="summarize",
            output=results,
            input_data=input_for_hash,
            user_id=user.get("username", ""),
        )
        await tracker.save()

        response = {
            'status': overall_status,
            'results': results,
            'request_id': tracker.request_id
        }
        if failed:
            response['failed_sections'] = [
                {"slide_number": f["slide_number"], "error": f.get("_error", "unknown")}
                for f in failed
            ]
        return response

    except Exception as e:
        tracker.finish(StepStatus.FAILED)
        logger.exception("[%s] Summarize failed", tracker.request_id)
        raise HTTPException(status_code=500, detail="Internal server error")


@slides_router.post("/generate_talking_script")
async def generate_talking_script(req: GenerateScriptSchema, user: dict = Depends(get_current_user), request: Request = None):
    request_id = (request.headers.get("X-Request-ID") if request else None)
    tracker = TaskTracker(request_id=request_id, user_id=user.get("username", ""), task_type="script_generate")
    try:
        with tracker.step("script_generate", slides_count=len(req.slides_results), style=req.script_style):
            scripts, filename = await Sub1Service.generate_script(
                slides_results=req.slides_results,
                style=req.script_style,
                title=req.presentation_title
            )

        tracker.finish(StepStatus.SUCCESS)
        tracker.result_metadata["total_scripts"] = len(scripts)
        await tracker.save()

        response_data = {
            'status': 'success',
            'total_scripts': len(scripts),
            'estimated_total_duration': f"{len(scripts) * 2} minutes",
            'request_id': tracker.request_id
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
        tracker.finish(StepStatus.FAILED)
        logger.exception("[%s] Script generation failed", tracker.request_id)
        raise HTTPException(status_code=500, detail="Internal server error")

@slides_router.get("/download_script/{filename}")
def download_script(filename: str, user: dict = Depends(get_current_user)):
    from fastapi.responses import FileResponse
    path = os.path.join(Config.SCRIPT_RESULTS_FOLDER, filename)

    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(path, media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                        filename=filename)



@slides_router.post("/summarize_in_chapters")
async def summarize_chapters(req: SummarizeChaptersSchema, user: dict = Depends(get_current_user), request: Request = None):
    request_id = (request.headers.get("X-Request-ID") if request else None)
    tracker = TaskTracker(request_id=request_id, user_id=user.get("username", ""), task_type="summarize_chapters")
    try:
        from backend.services.slides.section_summarizer import SectionSummarizer
        summarizer = SectionSummarizer()
        with tracker.step("summarize", chapters_count=len(req.chapterData), total_pages=req.total_pages):
            results = await summarizer.summarize_sections(req.chapterData, req.num_of_bullets, req.words_each_bullet)
        tracker.finish(StepStatus.SUCCESS)
        await tracker.save()
        return {'status': 'success', 'results': results[:req.total_pages], 'request_id': tracker.request_id}
    except Exception as e:
        tracker.finish(StepStatus.FAILED)
        logger.exception("[%s] Chapter summarization failed", tracker.request_id)
        raise HTTPException(status_code=500, detail="Internal server error")


# ==================== Template Mapping Endpoints ====================

@slides_router.post("/map-to-slides")
def map_summaries_to_slides_endpoint(req: MapToSlidesSchema, user: dict = Depends(get_current_user)):
    """
    Map structured summaries to PPT-ready slide data (decoupled from summarization).
    Template mapping failures can be retried independently without re-running summarization.
    """
    try:
        from backend.services.slides.template_mapper import map_summaries_to_slides, validate_presentation
        slides = map_summaries_to_slides(
            summaries=req.summaries,
            available_layouts=req.available_layouts,
            start_number=req.start_number,
        )
        quality = validate_presentation(slides)
        return {
            "status": "success",
            "slides": slides,
            "quality_report": quality,
        }
    except Exception as e:
        logger.exception("Template mapping failed")
        raise HTTPException(status_code=500, detail="Internal server error")


@slides_router.post("/validate-slides")
def validate_slides_endpoint(req: ValidateSlidesSchema, user: dict = Depends(get_current_user)):
    """Pre-generation quality check on slide data. Returns issues and quality score."""
    try:
        from backend.services.slides.template_mapper import validate_presentation
        report = validate_presentation(req.slides)
        return report
    except Exception as e:
        logger.exception("Slide validation failed")
        raise HTTPException(status_code=500, detail="Internal server error")


@slides_router.post("/evaluate-quality")
def evaluate_quality(req: EvaluateQualitySchema, user: dict = Depends(get_current_user)):
    """
    Evaluate the quality of generated slides against source highlights.
    Returns: coverage, consistency, readability, hallucination, structural scores.
    """
    from backend.services.slides.quality_evaluator import evaluate_pipeline_run

    if not req.slides:
        raise HTTPException(status_code=400, detail="slides list is required")

    report = evaluate_pipeline_run(highlights=req.highlights, slides=req.slides)
    return report


# ==================== Observability Endpoints ====================

@slides_router.get("/pipeline-stats")
async def get_pipeline_stats(hours: int = 24, user: dict = Depends(get_current_user)):
    """Get Sub1 pipeline aggregate stats: success rate, avg/P95 latency, error breakdown."""
    try:
        stats = await TaskTracker.get_stats(hours=hours)
        return stats
    except Exception as e:
        logger.exception("Failed to get pipeline stats")
        raise HTTPException(status_code=500, detail="Internal server error")


@slides_router.get("/task/{request_id}")
async def get_task_timeline(request_id: str, user: dict = Depends(get_current_user)):
    """Get step-level timeline for a specific task by request_id."""
    doc = await TaskTracker.get_task(request_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Task not found")
    return doc


# ==================== Checkpoint & Resume Endpoints ====================

@slides_router.get("/checkpoints/{task_id}")
async def get_checkpoints(task_id: str, user: dict = Depends(get_current_user)):
    """List all checkpoints for a task (without large output blobs)."""
    from backend.services.slides.checkpoint_manager import CheckpointManager
    cps = await CheckpointManager.get_task_checkpoints(task_id)
    resumable = await CheckpointManager.get_resumable_step(task_id)
    return {"task_id": task_id, "checkpoints": cps, "last_successful_step": resumable}


@slides_router.get("/checkpoint/{task_id}/{step}")
async def get_checkpoint_output(task_id: str, step: str, user: dict = Depends(get_current_user)):
    """Load a specific checkpoint's full output."""
    from backend.services.slides.checkpoint_manager import CheckpointManager
    doc = await CheckpointManager.load(task_id=task_id, step=step)
    if not doc:
        raise HTTPException(status_code=404, detail=f"No checkpoint for task={task_id} step={step}")
    return doc


@slides_router.delete("/checkpoints/{task_id}")
async def delete_checkpoints(task_id: str, user: dict = Depends(get_current_user)):
    """Delete all checkpoints for a task."""
    from backend.services.slides.checkpoint_manager import CheckpointManager
    count = await CheckpointManager.delete_task(task_id)
    return {"deleted": count}


# ==================== Audit Log Endpoints ====================

@slides_router.get("/audit-log")
async def get_audit_log(
    hours: int = 24,
    action: str = None,
    limit: int = 100,
    user: dict = Depends(get_current_user)
):
    """Query Sub1 audit logs. Supports filtering by action and time range."""
    from backend.services.slides.task_tracker import AuditLogger
    logs = await AuditLogger.get_logs(
        user_id=None,  # show all for now (admin view)
        action=action,
        hours=hours,
        limit=limit,
    )
    return {"logs": logs, "count": len(logs)}