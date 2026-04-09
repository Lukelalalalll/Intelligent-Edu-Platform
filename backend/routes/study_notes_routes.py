from backend.services.ai_gateway_service import AIGatewayService
# backend/routes/sub5_routes.py
"""AI Study Notes Generator – extracts text from uploaded PDF and generates
structured study notes, key concepts, and flashcards via Coze."""

import asyncio
import logging
import os
import tempfile
import uuid

import httpx
import opendataloader_pdf
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from backend.config import Config
from backend.core.ai_provider import resolve_provider
from backend.core.security import get_current_user
from backend.infrastructure import TelemetryTimer

logger = logging.getLogger(__name__)

study_notes_router = APIRouter(prefix="/api/study-notes", tags=["Study Notes"])

UPLOAD_DIR = os.path.join(Config.BASE_DIR, "uploads", "sub5")
os.makedirs(UPLOAD_DIR, exist_ok=True)

MAX_PDF_TEXT_CHARS = 50000  # increased limit for better context coverage


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
