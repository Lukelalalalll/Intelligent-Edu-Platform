"""Core PPT pipeline routes: parse, combine, highlight, summarize, script generation."""
import os
import re
import json
import shutil
import logging
import asyncio
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, Request
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
    MarkdownViewer as MDParser,
    PPTCreator,
    ChapterSummarizer,
    generate_talking_script_word,
    TaskTracker,
    StepStatus,
)
from backend.services.ai_gateway_service import AIGatewayService
from .router import slides_router, public_slides_router, legacy_sub1_router

logger = logging.getLogger(__name__)

# ── Outline generation helpers ──

OUTLINE_SYSTEM_PROMPT = """You are an expert educational content writer.
Given a topic or keywords, generate well-structured content in Markdown format, suitable for creating a presentation (PPT).

Requirements:
- Use ## for major sections (3-6 sections)
- Use - bullet points for key sub-points under each section
- Each section body: 3-5 concise bullet points
- Write in the same language as the input keywords
- Start directly with the first ## heading, no preamble
- Total length: 300-600 words"""


async def _call_coze_text_sub1(system_prompt: str, user_content: str, provider: str = "local_ollama") -> str:
    ai_service = AIGatewayService()
    context = {"system_override": system_prompt}
    return await ai_service.chat_with_provider(message=user_content, context=context, provider=provider)


# ── Parsing cache ──

_SUB1_PARSE_CACHE = {}


def _parse_md_impl(filepath: str, use_llm: bool) -> dict:
    """Parse a markdown file using MarkdownViewer."""
    parser = MDParser()
    parser.load_file(filepath, use_llm)
    return {
        'headers': [
            {'index': i + 1, 'level': s['header']['level'], 'text': s['header']['text']}
            for i, s in enumerate(parser.header_sections)
        ],
        'full_content': parser.full_content,
        'sections': parser.header_sections,
        'tables': [
            {'index': i + 1, 'section_title': s['section']['text'], 'table': s['table']}
            for i, s in enumerate(parser.table_sections)
        ],
    }


def _get_parsed_data_with_cache(filepath: str, use_llm: bool):
    cache_key = (filepath, bool(use_llm))
    stat = os.stat(filepath)
    file_stamp = (int(stat.st_mtime_ns), int(stat.st_size))
    cached = _SUB1_PARSE_CACHE.get(cache_key)
    if cached and cached.get("stamp") == file_stamp:
        return cached["data"]
    parsed = _parse_md_impl(filepath, use_llm)
    _SUB1_PARSE_CACHE[cache_key] = {"stamp": file_stamp, "data": parsed}
    return parsed


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
            filename = await asyncio.to_thread(_create_ppt, req.ppt_schema)

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


def _create_ppt(ppt_schema) -> str:
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"presentation_{timestamp}.pptx"
    output_path = os.path.join(Config.PPT_RESULTS_FOLDER, filename)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    creator = PPTCreator(Config.PPT_TEMPLATES_FOLDER)
    creator.create_presentation(ppt_schema, output_path)
    return filename


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
        filepath = os.path.join(Config.SUB1_UPLOAD_FOLDER, req.filename)
        if not os.path.exists(filepath):
            filepath = os.path.join(Config.UPLOAD_FOLDER, req.filename)

        if req.filename.lower().endswith('.pdf'):
            md_filename = req.filename.rsplit('.', 1)[0] + ".md"
            filepath = os.path.join(Config.SUB1_MD_FOLDER, md_filename)

        if not os.path.exists(filepath):
            raise Exception(f"File not found: {filepath}")

        parsed_data = _get_parsed_data_with_cache(filepath, req.use_llm)
        full_content = parsed_data['full_content']
        all_sections = parsed_data['sections']
        all_headers = parsed_data['headers']

        combined_chunks = []
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

                start_line = section['start']
                end_line = section['end']
                content_slice = full_content[start_line: end_line + 1]

                if content_slice and content_slice[0].strip().startswith('#'):
                    content_slice = content_slice[1:]
                if content_slice and content_slice[-1].strip().startswith('#'):
                    content_slice = content_slice[:-1]
                while content_slice and not content_slice[-1].strip():
                    content_slice = content_slice[:-1]
                if content_slice and content_slice[-1].strip().startswith('#'):
                    content_slice = content_slice[:-1]

                formatted_header = header_text if header_text.startswith('#') else f"# {header_text}"
                chunk = f"{formatted_header}\n" + '\n'.join(content_slice)
                combined_chunks.append(chunk)

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


# ── Highlights ──

@slides_router.post("/save_highlights")
def save_highlights(req: SaveHighlightsSchema, user: dict = Depends(get_current_user)):
    try:
        saved_file = _save_highlights_impl(req.filename, req.highlights)
        return {"message": "Success", "file": saved_file}
    except Exception as e:
        logger.exception("Save highlights failed")
        raise HTTPException(status_code=500, detail="Internal server error")


def _save_highlights_impl(filename: str, highlights_data) -> str:
    import time as _time
    os.makedirs(Config.SUB1_HIGHLIGHTS_FOLDER, exist_ok=True)

    if highlights_data and hasattr(highlights_data[0], 'dict'):
        highlights_list = [item.dict() for item in highlights_data]
    else:
        highlights_list = highlights_data

    json_filename = f"highlights_{filename}.json"
    json_path = os.path.join(Config.SUB1_HIGHLIGHTS_FOLDER, json_filename)
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(highlights_list, f, ensure_ascii=False, indent=2)

    md_filename = f"highlights_{filename}.md"
    md_path = os.path.join(Config.SUB1_HIGHLIGHTS_FOLDER, md_filename)
    with open(md_path, 'w', encoding='utf-8') as f:
        f.write(f"# Key Highlights for: {filename}\n\n")
        f.write(f"*Generated on {_time.strftime('%Y-%m-%d %H:%M:%S')}*\n\n---\n\n")
        for section in highlights_list:
            section_title = (
                section.get('sectionTitle', 'Untitled Section')
                if isinstance(section, dict)
                else getattr(section, 'sectionTitle', 'Untitled Section')
            )
            f.write(f"## {section_title}\n\n")
            items = (
                section.get('highlights', []) if isinstance(section, dict)
                else getattr(section, 'highlights', [])
            )
            for h in items:
                text = h.get('text', '') if isinstance(h, dict) else getattr(h, 'text', '')
                f.write(f"> {text}\n\n")
            f.write("\n")

    return json_filename


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


def _load_highlights_impl(filename: str) -> list:
    json_filename = f"highlights_{filename}.json"
    json_path = os.path.join(Config.SUB1_HIGHLIGHTS_FOLDER, json_filename)

    if os.path.exists(json_path):
        with open(json_path, 'r', encoding='utf-8') as f:
            sections_data = json.load(f)
        flat = []
        for section in sections_data:
            section_title = section.get('sectionTitle', '')
            for h in section.get('highlights', []):
                flat.append({
                    'id': h.get('id', ''),
                    'text': h.get('text', ''),
                    'sectionTitle': section_title,
                })
        return flat
    return []


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
        text = await _call_coze_text_sub1(OUTLINE_SYSTEM_PROMPT, keywords, provider=resolved_provider)

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

    safe_title = re.sub(r'[^\w\s-]', '', title)[:60].strip().replace(' ', '_') or 'untitled'
    parts = re.split(r'(?=^## )', text, flags=re.MULTILINE)
    sections = []
    for part in parts:
        stripped = part.strip()
        if not stripped:
            continue
        if not stripped.startswith('## '):
            sections.append(f"## Overview\n{stripped}")
        else:
            sections.append(stripped)

    if not sections:
        raise HTTPException(400, "Could not parse any sections from the text")

    filename = f"combined_{safe_title}.md"
    os.makedirs(Config.SUB1_MD_FOLDER, exist_ok=True)
    filepath = os.path.join(Config.SUB1_MD_FOLDER, filename)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write("\n===SECTION_BREAK===\n".join(sections))

    logger.info("process-text: wrote %d sections to %s", len(sections), filename)

    try:
        _exp = await compute_history_expires_at(user.get("id", ""))
        _doc = {
            "user_id": user.get("id", ""),
            "params": {
                "tool": "process_text",
                "source_type": "text",
                "title": title,
                "sections_count": len(sections),
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

    return {"filename": filename, "sections": len(sections)}


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

async def _generate_script_impl(slides_results, style, title, provider) -> tuple:
    summarizer = ChapterSummarizer()
    scripts = await summarizer.generate_talking_script(slides_results, style, provider=provider)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"talking_script_{timestamp}.docx"
    output_path = os.path.join(Config.SCRIPT_RESULTS_FOLDER, filename)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    generate_talking_script_word(scripts, output_path, title)
    return scripts, filename


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
            scripts, filename = await _generate_script_impl(
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
