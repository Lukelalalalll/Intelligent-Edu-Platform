from backend.services.ai_gateway_service import AIGatewayService
# backend/routes/sub5_routes.py
"""AI Study Notes Generator – extracts text from uploaded PDF and generates
structured study notes, key concepts, and flashcards via Coze."""

import asyncio
import logging
import os
import tempfile
import uuid
import re
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
import opendataloader_pdf
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from backend.config import Config
from backend.core.ai_provider import resolve_provider
from backend.core.database import db
from backend.core.security import get_current_user
from backend.infrastructure import TelemetryTimer

logger = logging.getLogger(__name__)

study_notes_router = APIRouter(prefix="/api/study-notes", tags=["Study Notes"])

UPLOAD_DIR = os.path.join(Config.BASE_DIR, "uploads", "sub5")
os.makedirs(UPLOAD_DIR, exist_ok=True)

MAX_PDF_TEXT_CHARS = 50000  # increased limit for better context coverage
STUDY_DURATION_PRESETS = {"3d": 3, "7d": 7, "14d": 14}


class StudyPlanGenerateSchema(BaseModel):
    course_id: str | None = None
    title: str = "Study Plan"
    notes: str = Field(..., min_length=20)
    flashcards: list[dict[str, str]] = []
    duration_option: str = "7d"
    custom_days: int | None = Field(default=None, ge=1, le=90)


class StudyReviewSubmitSchema(BaseModel):
    queue_id: str
    rating: str = "good"  # again | hard | good | easy
    correct: bool = True


def _extract_pdf_text(path: str, max_chars: int = MAX_PDF_TEXT_CHARS) -> str:
    """Extract text from PDF using OpenDataLoader (high-accuracy markdown extraction).

    Falls back to PyMuPDF if opendataloader fails.
    """
    # ── Primary: opendataloader_pdf (fast, accurate, handles tables/formulas) ──
    try:
        with tempfile.TemporaryDirectory(prefix="sub5_odl_") as tmp_dir:
            opendataloader_pdf.convert(
                input_path=path,
                output_dir=tmp_dir,
                format="markdown",
                quiet=True,
                image_output="off",
            )

            # Find the generated markdown file
            stem = os.path.splitext(os.path.basename(path))[0]
            md_candidates = [
                os.path.join(tmp_dir, f"{stem}.md"),
                os.path.join(tmp_dir, f"{stem}_markdown.md"),
            ]
            md_path = next((p for p in md_candidates if os.path.exists(p)), None)

            if not md_path:
                md_files = [f for f in os.listdir(tmp_dir) if f.lower().endswith(".md")]
                if md_files:
                    md_path = os.path.join(tmp_dir, md_files[0])

            if md_path:
                with open(md_path, "r", encoding="utf-8", errors="replace") as f:
                    text = f.read()
                if text.strip():
                    logger.info("PDF extracted via opendataloader: %d chars", len(text))
                    return text[:max_chars]
    except Exception:
        logger.warning("opendataloader_pdf failed for %s, falling back to PyMuPDF", path)

    # ── Fallback: PyMuPDF (fast but lower quality for complex layouts) ──
    import fitz
    doc = fitz.open(path)
    parts = []
    total = 0
    for page in doc:
        page_text = page.get_text("text")
        parts.append(page_text)
        total += len(page_text)
        if total >= max_chars:
            break
    doc.close()
    full = "\n".join(parts)
    logger.info("PDF extracted via PyMuPDF fallback: %d chars", len(full))
    return full[:max_chars]


NOTES_SYSTEM_PROMPT = """You are an expert academic tutor. Given lecture/textbook content, produce structured study notes in Markdown.

Output format:
## Summary
A concise 3-5 sentence summary of the material.

## Key Concepts
- **Concept 1**: Brief explanation
- **Concept 2**: Brief explanation
(list all important concepts)

## Detailed Notes
Organized, well-structured notes with headings for each topic covered.

## Flashcards
Generate 5-10 Q&A flashcards in this exact format:
Q: [question]
A: [answer]

Keep language clear and concise. Use the same language as the source material."""

FLASHCARD_SYSTEM_PROMPT = """You are an expert educator. Given study material, generate flashcards for active recall.
Output ONLY a JSON array of objects, each with "question" and "answer" keys.
Generate 8-15 flashcards covering the key concepts. Use the same language as the source material.
Example: [{"question":"What is X?","answer":"X is..."}]"""


async def _call_coze_text(system_prompt: str, user_content: str, endpoint_label: str = "sub5/notes", provider: str = "local_ollama") -> str:
    ai_service = AIGatewayService()
    context = {"system_override": system_prompt}
    return await ai_service.chat_with_provider(message=user_content, context=context, provider=provider)
@study_notes_router.post("/generate-notes")
async def generate_notes(
    file: UploadFile = File(...),
    style: str = Form("detailed"),
    provider: str | None = Form(None),
    _user=Depends(get_current_user),
):
    """Upload PDF and generate structured study notes."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files accepted")

    # Save uploaded file
    file_id = uuid.uuid4().hex[:12]
    save_path = os.path.join(UPLOAD_DIR, f"{file_id}.pdf")
    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 20MB)")
    with open(save_path, "wb") as f:
        f.write(content)

    try:
        text = _extract_pdf_text(save_path)
        if len(text.strip()) < 50:
            raise HTTPException(400, "Could not extract meaningful text from PDF")

        style_hint = ""
        if style == "concise":
            style_hint = "\n\nKeep notes very concise — bullet points only, minimal explanation."
        elif style == "exam":
            style_hint = "\n\nFocus on exam-relevant material. Emphasize definitions, formulas, and common exam questions."

        prompt = f"Generate study notes for the following lecture material:{style_hint}\n\n---\n{text}\n---"
        resolved_provider = resolve_provider(provider, feature="study_notes.generate_notes")
        notes_md = await _call_coze_text(
            NOTES_SYSTEM_PROMPT,
            prompt,
            endpoint_label="sub5/generate_notes",
            provider=resolved_provider,
        )

        return JSONResponse({
            "success": True,
            "notes": notes_md,
            "source_chars": len(text),
            "file_id": file_id,
        })
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Notes generation failed")
        raise HTTPException(500, f"Generation failed: {str(e)}")
    finally:
        try:
            if os.path.exists(save_path):
                os.remove(save_path)
        except OSError:
            logger.warning("Failed to clean up temp file: %s", save_path)


@study_notes_router.post("/generate-flashcards")
async def generate_flashcards(
    file: UploadFile = File(None),
    text: str = Form(None),
    provider: str | None = Form(None),
    _user=Depends(get_current_user),
):
    """Generate flashcards from PDF or raw text."""
    source_text = ""

    if file and file.filename:
        if not file.filename.lower().endswith(".pdf"):
            raise HTTPException(400, "Only PDF files accepted")
        file_id = uuid.uuid4().hex[:12]
        save_path = os.path.join(UPLOAD_DIR, f"{file_id}.pdf")
        content = await file.read()
        if len(content) > 20 * 1024 * 1024:
            raise HTTPException(400, "File too large (max 20MB)")
        with open(save_path, "wb") as f:
            f.write(content)
        try:
            source_text = _extract_pdf_text(save_path)
        finally:
            try:
                if os.path.exists(save_path):
                    os.remove(save_path)
            except OSError:
                logger.warning("Failed to clean up temp file: %s", save_path)
    elif text and text.strip():
        source_text = text.strip()[:MAX_PDF_TEXT_CHARS]
    else:
        raise HTTPException(400, "Provide either a PDF file or text content")

    if len(source_text.strip()) < 30:
        raise HTTPException(400, "Insufficient content for flashcard generation")

    try:
        resolved_provider = resolve_provider(provider, feature="study_notes.generate_flashcards")
        raw = await _call_coze_text(
            FLASHCARD_SYSTEM_PROMPT,
            f"Generate flashcards from:\n\n{source_text}",
            endpoint_label="sub5/generate_flashcards",
            provider=resolved_provider,
        )
        # Try to parse JSON from response
        import json
        # Strip markdown code fences if present
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        flashcards = json.loads(cleaned)
        return JSONResponse({
            "success": True,
            "flashcards": flashcards,
            "count": len(flashcards),
        })
    except (json.JSONDecodeError, KeyError, IndexError):
        # Return raw text if JSON parsing fails
        return JSONResponse({
            "success": True,
            "flashcards": [],
            "raw": raw,
            "count": 0,
        })
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Flashcard generation failed")
        raise HTTPException(500, f"Generation failed: {str(e)}")


def _resolve_study_days(duration_option: str, custom_days: int | None) -> int:
    option = str(duration_option or "").strip().lower()
    if option == "custom":
        if not custom_days:
            raise HTTPException(400, "custom_days is required when duration_option is custom")
        return int(custom_days)
    if option not in STUDY_DURATION_PRESETS:
        raise HTTPException(400, "duration_option must be one of 3d, 7d, 14d, custom")
    return int(STUDY_DURATION_PRESETS[option])


def _extract_study_units(notes: str) -> list[str]:
    sections: list[str] = []
    chunks = re.split(r"\n(?=##?\s+)", notes)
    for chunk in chunks:
        text = str(chunk or "").strip()
        if text:
            sections.append(text[:1400])
    if not sections:
        raw = str(notes or "").strip()
        if raw:
            sections.append(raw[:1400])
    return sections[:24]


@study_notes_router.post("/plan/generate")
async def generate_study_plan(
    payload: StudyPlanGenerateSchema,
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user.get("id") or current_user.get("_id") or "")
    if not user_id:
        raise HTTPException(401, "Unauthorized")

    total_days = _resolve_study_days(payload.duration_option, payload.custom_days)
    units = _extract_study_units(payload.notes)
    if not units:
        raise HTTPException(400, "Insufficient notes content to build a study plan")

    flashcards = payload.flashcards or []
    now = datetime.now(timezone.utc)
    plan_id = uuid.uuid4().hex[:14]

    sessions: list[dict[str, Any]] = []
    queue_docs: list[dict[str, Any]] = []
    for idx, unit in enumerate(units, start=1):
        day_offset = min(total_days - 1, int((idx - 1) * total_days / max(1, len(units))))
        due_at = now + timedelta(days=day_offset)
        queue_id = f"{plan_id}-u{idx}"

        review_slice_start = (idx - 1) % max(1, len(flashcards) or 1)
        review_slice = flashcards[review_slice_start: review_slice_start + 3] if flashcards else []

        session = {
            "session_id": f"S{idx}",
            "day": day_offset + 1,
            "focus": unit.splitlines()[0][:120],
            "reading_minutes": 20,
            "review_minutes": 10,
            "practice_minutes": 15,
            "review_flashcards": review_slice,
            "queue_id": queue_id,
            "status": "scheduled",
        }
        sessions.append(session)

        queue_docs.append(
            {
                "queue_id": queue_id,
                "plan_id": plan_id,
                "user_id": user_id,
                "due_at": due_at,
                "status": "scheduled",
                "repetitions": 0,
                "last_rating": None,
                "unit_index": idx,
                "focus": session["focus"],
                "created_at": now,
                "updated_at": now,
            }
        )

    plan_doc = {
        "plan_id": plan_id,
        "user_id": user_id,
        "course_id": payload.course_id,
        "title": payload.title,
        "duration_days": total_days,
        "duration_option": payload.duration_option,
        "custom_days": payload.custom_days,
        "session_count": len(sessions),
        "sessions": sessions,
        "created_at": now,
        "updated_at": now,
    }

    await db.study_plan_profiles.insert_one(plan_doc)
    if queue_docs:
        await db.study_review_queue.insert_many(queue_docs)

    return {
        "success": True,
        "plan_id": plan_id,
        "duration_days": total_days,
        "sessions": sessions,
    }


@study_notes_router.get("/plan/{plan_id}")
async def get_study_plan(plan_id: str, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user.get("id") or current_user.get("_id") or "")
    doc = await db.study_plan_profiles.find_one({"plan_id": plan_id, "user_id": user_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Study plan not found")

    for key in ("created_at", "updated_at"):
        if hasattr(doc.get(key), "isoformat"):
            doc[key] = doc[key].isoformat()
    return {"success": True, "plan": doc}


@study_notes_router.post("/review/next")
async def get_next_review_item(plan_id: str | None = None, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user.get("id") or current_user.get("_id") or "")
    now = datetime.now(timezone.utc)

    query: dict[str, Any] = {
        "user_id": user_id,
        "status": {"$in": ["scheduled", "pending"]},
        "due_at": {"$lte": now},
    }
    if plan_id:
        query["plan_id"] = plan_id

    next_item = await db.study_review_queue.find_one(query, sort=[("due_at", 1)], projection={"_id": 0})
    if not next_item:
        upcoming = await db.study_review_queue.find_one(
            {"user_id": user_id, **({"plan_id": plan_id} if plan_id else {}), "status": {"$in": ["scheduled", "pending"]}},
            sort=[("due_at", 1)],
            projection={"_id": 0},
        )
        if upcoming:
            if hasattr(upcoming.get("due_at"), "isoformat"):
                upcoming["due_at"] = upcoming["due_at"].isoformat()
            return {"success": True, "ready": False, "next_upcoming": upcoming}
        return {"success": True, "ready": False, "message": "No review items available."}

    if hasattr(next_item.get("due_at"), "isoformat"):
        next_item["due_at"] = next_item["due_at"].isoformat()
    return {"success": True, "ready": True, "item": next_item}


@study_notes_router.post("/review/submit")
async def submit_review_feedback(payload: StudyReviewSubmitSchema, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user.get("id") or current_user.get("_id") or "")
    doc = await db.study_review_queue.find_one({"queue_id": payload.queue_id, "user_id": user_id})
    if not doc:
        raise HTTPException(404, "Review queue item not found")

    rating = str(payload.rating or "good").lower()
    step_map = {"again": 1, "hard": 2, "good": 4, "easy": 7}
    next_days = step_map.get(rating, 4)

    now = datetime.now(timezone.utc)
    next_due = now + timedelta(days=next_days)
    new_reps = int(doc.get("repetitions", 0)) + 1
    new_status = "pending" if payload.correct else "scheduled"

    await db.study_review_queue.update_one(
        {"queue_id": payload.queue_id, "user_id": user_id},
        {
            "$set": {
                "due_at": next_due,
                "status": new_status,
                "last_rating": rating,
                "updated_at": now,
                "correct": bool(payload.correct),
            },
            "$inc": {"repetitions": 1},
        },
    )

    return {
        "success": True,
        "queue_id": payload.queue_id,
        "next_due_at": next_due.isoformat(),
        "repetitions": new_reps,
        "status": new_status,
    }
