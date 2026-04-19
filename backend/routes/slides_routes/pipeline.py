"""Core PPT pipeline routes: parse, combine, highlight, summarize, script generation."""
import json
import logging
import os
import shutil
import asyncio
from datetime import datetime, timezone
from typing import Optional
from fastapi import UploadFile, File, Form, HTTPException, Depends, Request
from fastapi.responses import FileResponse
from werkzeug.utils import secure_filename

from backend.config import Config
from backend.core.ai_provider import resolve_provider
from backend.core.database import db, compute_history_expires_at
from backend.core.security import get_current_user
from backend.schemas import (
    CombineSchema,
    SaveHighlightsSchema,
    SummarizeRequestSchema,
    GenerateScriptSchema,
    SummarizeChaptersSchema,
    PptProcessSchema,
    ClassifyHighlightsSchema,
)
from backend.services.slides import (
    TaskTracker,
    StepStatus,
)
from .router import slides_router, public_slides_router, legacy_sub1_router

logger = logging.getLogger(__name__)

from backend.services.slides_pipeline_service import (
    generate_outline as _svc_generate_outline,
    get_parsed_data_with_cache as _get_parsed_data_with_cache,
    create_ppt as _create_ppt_impl,
    combine_sections as _svc_combine_sections,
    save_highlights as _save_highlights_impl,
    load_highlights as _load_highlights_impl,
    process_text_to_md as _svc_process_text,
    generate_script as _svc_generate_script,
)


# ── PPT creation ──

@slides_router.post("/process-ppt")
@slides_router.post("/generate_ppt")
async def process_ppt(req: PptProcessSchema, request: Request):
    from backend.services.slides.infra.checkpoint_manager import CheckpointManager

    request_id = request.headers.get("X-Request-ID") or None
    tracker = TaskTracker(request_id=request_id, task_type="ppt_generate")

    try:
        if not req.ppt_schema:
            raise ValueError("ppt_schema is required")

        slides_count = len(req.ppt_schema.get("slides", []) if isinstance(req.ppt_schema, dict) else [])
        with tracker.step("ppt_generate", slides_count=slides_count):
            filename = await asyncio.to_thread(_create_ppt_impl, req.ppt_schema)

        tracker.finish(StepStatus.SUCCESS)
        tracker.result_metadata["filename"] = filename

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
            "download_url": f"/slides/download_ppt/{filename}",
            "request_id": tracker.request_id,
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
    search_paths = [
        os.path.join(Config.PPT_RESULTS_FOLDER, filename),
        os.path.join(Config.PPT_RESULTS_FOLDER, 'sub1', filename),
    ]
    for path in search_paths:
        if os.path.exists(path):
            return FileResponse(
                path,
                media_type='application/vnd.openxmlformats-officedocument.presentationml.presentation',
                filename=filename,
            )
    raise HTTPException(status_code=404, detail="File not found")


# ── Parsing ──

@slides_router.post("/parse-md")
async def parse_md(
    file: UploadFile = File(...),
    use_llm: bool = Form(False),
    user: dict = Depends(get_current_user),
    request: Request = None,
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
                from backend.services.slides.parsing.pdf2md import convert_pdf_to_md
                convert_pdf_to_md(upload_path, target_md_path)
            parsing_path = target_md_path
        else:
            parsing_path = upload_path

        step_name = "parse" if not filename.lower().endswith('.pdf') else "header_extract"
        with tracker.step(step_name, filename=filename):
            result = _get_parsed_data_with_cache(parsing_path, use_llm)

        tracker.finish(StepStatus.SUCCESS)
        tracker.result_metadata["headers_count"] = len(result.get('headers', []))
        await tracker.save()

        return {
            'status': 'success',
            'filename': filename,
            'headers': result['headers'],
            'tables': result['tables'],
            'request_id': tracker.request_id,
        }
    except Exception as e:
        tracker.finish(StepStatus.FAILED)
        logger.exception("[%s] Parse failed", tracker.request_id)
        raise HTTPException(status_code=500, detail="Internal server error")


@slides_router.post("/combine")
def combine_sections(req: CombineSchema, user: dict = Depends(get_current_user)):
    try:
        new_filename = _svc_combine_sections(req.filename, req.selected_indices, req.use_llm)
        return {"filename": new_filename}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("Combine sections failed")
        raise HTTPException(status_code=500, detail="Internal server error")


# ── Highlights ──

@slides_router.post("/save_highlights")
def save_highlights(req: SaveHighlightsSchema, user: dict = Depends(get_current_user)):
    try:
        saved_file = _save_highlights_impl(req.filename, req.highlights)
        return {"message": "Success", "file": saved_file}
    except Exception as e:
        logger.exception("Save highlights failed")
        raise HTTPException(status_code=500, detail="Internal server error")


@slides_router.post("/classify-highlights")
async def classify_highlights(req: ClassifyHighlightsSchema, user: dict = Depends(get_current_user)):
    tracker = TaskTracker(user_id=user.get("username", ""), task_type="classify_highlights")
    try:
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

        from backend.services.slides.generation.highlight_classifier import HighlightClassifier
        classifier = HighlightClassifier()

        with tracker.step("classify_highlights", count=len(flat_highlights)):
            classified = classifier.classify(flat_highlights)

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
    for folder in [Config.SUB1_MD_FOLDER, Config.MARKDOWN_FOLDER]:
        path = os.path.join(folder, filename)
        if os.path.exists(path):
            return FileResponse(path)
    raise HTTPException(status_code=404, detail="File not found")


@slides_router.get("/load_highlights/{filename}")
def load_highlights(filename: str, user: dict = Depends(get_current_user)):
    try:
        highlights = _load_highlights_impl(filename)
        return {"highlights": highlights}
    except Exception as e:
        logger.exception("Failed to load highlights for %s", filename)
        raise HTTPException(status_code=500, detail="Internal server error")


# ── Outline / text processing ──

from pydantic import BaseModel


class CozeOutlineRequest(BaseModel):
    provider: Optional[str] = 'local_ollama'
    keywords: str


class ProcessTextRequest(BaseModel):
    text: str
    title: str


@slides_router.post("/coze-generate-outline")
async def coze_generate_outline(req: CozeOutlineRequest, user: dict = Depends(get_current_user)):
    keywords = req.keywords.strip()
    if not keywords:
        raise HTTPException(400, "Keywords must not be empty")
    try:
        resolved_provider = resolve_provider(req.provider, feature="slides.generate_outline")
        text = await _svc_generate_outline(keywords, provider=resolved_provider)

        try:
            _exp = await compute_history_expires_at(user.get("id", ""))
            _doc = {
                "user_id": user.get("id", ""),
                "params": {
                    "tool": "coze_generate_outline",
                    "source_type": "text",
                    "keywords": keywords[:200],
                    "provider": resolved_provider,
                },
                "source": {"keywords": keywords},
                "result_preview": (text or "")[:500],
                "result_full": text or "",
                "created_at": datetime.now(timezone.utc),
            }
            if _exp is not None:
                _doc["expires_at"] = _exp
            await db.sub1_generation_history.insert_one(_doc)
        except Exception:
            pass

        return {"text": text}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Coze outline generation failed")
        raise HTTPException(500, str(e))


@slides_router.post("/process-text")
async def process_text(req: ProcessTextRequest, user: dict = Depends(get_current_user)):
    text = req.text.strip()
    title = req.title.strip() or "untitled"
    if not text:
        raise HTTPException(400, "Text must not be empty")

    try:
        filename, sections_count = _svc_process_text(text, title)
    except ValueError as e:
        raise HTTPException(400, str(e))

    logger.info("process-text: wrote %d sections to %s", sections_count, filename)

    try:
        _exp = await compute_history_expires_at(user.get("id", ""))
        _doc = {
            "user_id": user.get("id", ""),
            "params": {
                "tool": "process_text",
                "source_type": "text",
                "title": title,
                "sections_count": sections_count,
            },
            "source": {"title": title},
            "result_preview": text[:500],
            "result_full": text,
            "created_at": datetime.now(timezone.utc),
        }
        if _exp is not None:
            _doc["expires_at"] = _exp
        await db.sub1_generation_history.insert_one(_doc)
    except Exception:
        pass

    return {"filename": filename, "sections": sections_count}


# ── Summarization ──

@slides_router.post("/summarize")
async def summarize_highlights(
    req: SummarizeRequestSchema,
    user: dict = Depends(get_current_user),
    request: Request = None,
):
    request_id = (request.headers.get("X-Request-ID") if request else None)
    tracker = TaskTracker(request_id=request_id, user_id=user.get("username", ""), task_type="summarize")

    from backend.services.slides.infra.checkpoint_manager import CheckpointManager, _compute_hash

    try:
        from backend.services.slides.generation.section_summarizer import SectionSummarizer

        structured_content = []
        for section in req.highlights:
            section_text = "\n".join([h.get('text', '') for h in section.get('highlights', [])])
            if section_text:
                structured_content.append({
                    'title': section.get('sectionTitle', 'Untitled'),
                    'content': section_text,
                })

        if not structured_content:
            raise Exception("No valid highlights provided for summarization.")

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
                'cached': True,
            }

        summarizer = SectionSummarizer()
        with tracker.step(
            "summarize",
            sections_count=len(structured_content),
            num_of_bullets=req.num_of_bullets,
            words_each_bullet=req.words_each_bullet,
        ):
            results = await summarizer.summarize_sections(
                highlights_data=structured_content,
                num_of_bullets=req.num_of_bullets,
                words_each_bullet=req.words_each_bullet,
            )

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
            'request_id': tracker.request_id,
        }
        if failed:
            response['failed_sections'] = [
                {"slide_number": f["slide_number"], "error": f.get("_error", "unknown")}
                for f in failed
            ]

        try:
            _exp = await compute_history_expires_at(user.get("id", ""))
            _doc = {
                "user_id": user.get("id", ""),
                "params": {
                    "tool": "summarize_highlights",
                    "source_type": "highlights",
                    "sections_count": len(structured_content),
                    "slides_generated": len(results),
                    "num_of_bullets": req.num_of_bullets,
                    "words_each_bullet": req.words_each_bullet,
                },
                "source": {"sections_count": len(structured_content)},
                "result_preview": f"Generated {len(results)} slides from {len(structured_content)} sections",
                "result_full": json.dumps(results, ensure_ascii=False),
                "created_at": datetime.now(timezone.utc),
            }
            if _exp is not None:
                _doc["expires_at"] = _exp
            await db.sub1_generation_history.insert_one(_doc)
        except Exception:
            pass

        return response

    except Exception as e:
        tracker.finish(StepStatus.FAILED)
        logger.exception("[%s] Summarize failed", tracker.request_id)
        raise HTTPException(status_code=500, detail="Internal server error")


@slides_router.post("/summarize_in_chapters")
async def summarize_chapters(
    req: SummarizeChaptersSchema,
    user: dict = Depends(get_current_user),
    request: Request = None,
):
    request_id = (request.headers.get("X-Request-ID") if request else None)
    tracker = TaskTracker(request_id=request_id, user_id=user.get("username", ""), task_type="summarize_chapters")
    try:
        from backend.services.slides.generation.section_summarizer import SectionSummarizer
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


# ── Script generation ──

@slides_router.post("/generate_talking_script")
async def generate_talking_script(
    req: GenerateScriptSchema,
    user: dict = Depends(get_current_user),
    request: Request = None,
):
    request_id = (request.headers.get("X-Request-ID") if request else None)
    tracker = TaskTracker(request_id=request_id, user_id=user.get("username", ""), task_type="script_generate")
    try:
        resolved_provider = resolve_provider(req.provider, feature="slides.generate_script", user=user)
        with tracker.step("script_generate", slides_count=len(req.slides_results), style=req.script_style):
            scripts, filename = await _svc_generate_script(
                slides_results=req.slides_results,
                style=req.script_style,
                title=req.presentation_title,
                provider=resolved_provider,
            )

        tracker.finish(StepStatus.SUCCESS)
        tracker.result_metadata["total_scripts"] = len(scripts)
        await tracker.save()

        response_data = {
            'status': 'success',
            'total_scripts': len(scripts),
            'estimated_total_duration': f"{len(scripts) * 2} minutes",
            'request_id': tracker.request_id,
        }
        if req.generate_word:
            response_data['word_document'] = {
                'available': True,
                'filename': filename,
                'download_url': f"/slides/download_script/{filename}",
            }
        return response_data

    except Exception as e:
        tracker.finish(StepStatus.FAILED)
        logger.exception("[%s] Script generation failed", tracker.request_id)
        raise HTTPException(status_code=500, detail="Internal server error")


@slides_router.get("/download_script/{filename}")
def download_script(filename: str, user: dict = Depends(get_current_user)):
    path = os.path.join(Config.SCRIPT_RESULTS_FOLDER, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(
        path,
        media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        filename=filename,
    )


# ── Legacy routes ──

@legacy_sub1_router.get("/download_script/{filename}")
def legacy_download_script(filename: str, user: dict = Depends(get_current_user)):
    return download_script(filename, user)


@legacy_sub1_router.get("/download_ppt/{filename}")
def legacy_download_ppt(filename: str, user: dict = Depends(get_current_user)):
    return download_ppt(filename)
