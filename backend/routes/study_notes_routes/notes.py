"""Study notes and flashcard generation endpoints."""
import json
import logging
import os
import uuid
from datetime import datetime, timezone

from fastapi import Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from backend.core.ai_provider import resolve_provider
from backend.core.database import compute_history_expires_at, db
from backend.core.security import get_current_user
from .helpers import (
    FLASHCARD_SYSTEM_PROMPT,
    MAX_PDF_TEXT_CHARS,
    NOTES_SYSTEM_PROMPT,
    UPLOAD_DIR,
    call_coze_text,
    extract_pdf_text,
)
from .router import study_notes_router

logger = logging.getLogger(__name__)


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

    file_id = uuid.uuid4().hex[:12]
    save_path = os.path.join(UPLOAD_DIR, f"{file_id}.pdf")
    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 20MB)")
    with open(save_path, "wb") as f:
        f.write(content)

    try:
        text = extract_pdf_text(save_path)
        if len(text.strip()) < 50:
            raise HTTPException(400, "Could not extract meaningful text from PDF")

        style_hint = ""
        if style == "concise":
            style_hint = "\n\nKeep notes very concise — bullet points only, minimal explanation."
        elif style == "exam":
            style_hint = "\n\nFocus on exam-relevant material. Emphasize definitions, formulas, and common exam questions."

        prompt = f"Generate study notes for the following lecture material:{style_hint}\n\n---\n{text}\n---"
        resolved_provider = resolve_provider(provider, feature="study_notes.generate_notes")
        notes_md = await call_coze_text(
            NOTES_SYSTEM_PROMPT,
            prompt,
            endpoint_label="sub5/generate_notes",
            provider=resolved_provider,
        )

        # Save to generation history
        try:
            user_id = str(_user.get("id") or _user.get("_id") or "")
            _exp = await compute_history_expires_at(user_id)
            _doc = {
                "user_id": user_id,
                "params": {
                    "tool": "generate_notes",
                    "source_type": "file",
                    "filename": file.filename or "",
                    "style": style,
                    "provider": resolved_provider,
                },
                "source": {"file_name": file.filename or "", "file_id": file_id},
                "result_preview": (notes_md or "")[:500],
                "result_full": notes_md or "",
                "created_at": datetime.now(timezone.utc),
            }
            if _exp is not None:
                _doc["expires_at"] = _exp
            await db.sub5_generation_history.insert_one(_doc)
        except Exception:
            pass

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
            source_text = extract_pdf_text(save_path)
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
        raw = await call_coze_text(
            FLASHCARD_SYSTEM_PROMPT,
            f"Generate flashcards from:\n\n{source_text}",
            endpoint_label="sub5/generate_flashcards",
            provider=resolved_provider,
        )
        # Try to parse JSON from response
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        flashcards = json.loads(cleaned)
        # Save to generation history
        try:
            user_id = str(_user.get("id") or _user.get("_id") or "")
            src_name = (file.filename if file and file.filename else "text_input") or "text_input"
            _exp = await compute_history_expires_at(user_id)
            _doc = {
                "user_id": user_id,
                "params": {
                    "tool": "generate_flashcards",
                    "source_type": "file" if (file and file.filename) else "text",
                    "filename": src_name,
                    "flashcards_count": len(flashcards),
                    "provider": resolved_provider,
                },
                "source": {"file_name": src_name},
                "result_preview": f"Generated {len(flashcards)} flashcards",
                "result_full": json.dumps({"flashcards": flashcards}),
                "created_at": datetime.now(timezone.utc),
            }
            if _exp is not None:
                _doc["expires_at"] = _exp
            await db.sub5_generation_history.insert_one(_doc)
        except Exception:
            pass

        return JSONResponse({
            "success": True,
            "flashcards": flashcards,
            "count": len(flashcards),
        })
    except (json.JSONDecodeError, KeyError, IndexError):
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
