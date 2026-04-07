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


async def _call_coze_text(system_prompt: str, user_content: str, endpoint_label: str = "sub5/notes") -> str:
    """Call Coze v3 chat API (text-only) with polling."""
    api_key = Config.COZE_TOKEN
    bot_id = Config.COZE_BOT_ID
    api_root = (Config.COZE_API_ROOT or "https://api.coze.com").rstrip("/")

    if not api_key or not bot_id:
        raise HTTPException(503, "Coze API key or bot id not configured")

    full_prompt = f"{system_prompt}\n\n{user_content}"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "bot_id": bot_id,
        "user_id": "sub5_study_notes",
        "stream": False,
        "additional_messages": [
            {"role": "user", "content": full_prompt, "content_type": "text"}
        ],
    }

    timeout_seconds = float(Config.COZE_REQUEST_TIMEOUT_SECONDS)
    poll_interval = float(Config.COZE_POLL_INTERVAL_SECONDS)
    poll_max_attempts = int(Config.COZE_POLL_MAX_ATTEMPTS)

    timer = TelemetryTimer(
        provider="coze", model=bot_id,
        endpoint=endpoint_label, api_type="chat",
        credential_alias="COZE_TOKEN",
    )
    with timer:
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            start_resp = await client.post(f"{api_root}/v3/chat", headers=headers, json=payload)
            if start_resp.status_code != 200:
                logger.error("Coze start chat error %s: %s", start_resp.status_code, start_resp.text[:500])
                await timer.save(success=False, error=f"Coze start error {start_resp.status_code}")
                raise HTTPException(502, f"AI service error: {start_resp.status_code}")

            start_data = start_resp.json().get("data", {})
            chat_id = start_data.get("id")
            conversation_id = start_data.get("conversation_id")
            if not chat_id or not conversation_id:
                await timer.save(success=False, error="Invalid chat identifiers")
                raise HTTPException(502, "AI service returned invalid chat identifiers")

            for _ in range(poll_max_attempts):
                retrieve_resp = await client.get(
                    f"{api_root}/v3/chat/retrieve",
                    headers=headers,
                    params={"chat_id": chat_id, "conversation_id": conversation_id},
                )
                if retrieve_resp.status_code != 200:
                    logger.error("Coze retrieve error %s: %s", retrieve_resp.status_code, retrieve_resp.text[:500])
                    await timer.save(success=False, error=f"Coze retrieve error {retrieve_resp.status_code}")
                    raise HTTPException(502, f"AI service error: {retrieve_resp.status_code}")

                status = retrieve_resp.json().get("data", {}).get("status")
                if status == "completed":
                    message_resp = await client.get(
                        f"{api_root}/v3/chat/message/list",
                        headers=headers,
                        params={"chat_id": chat_id, "conversation_id": conversation_id},
                    )
                    if message_resp.status_code != 200:
                        logger.error("Coze message list error %s: %s", message_resp.status_code, message_resp.text[:500])
                        await timer.save(success=False, error=f"Coze message error {message_resp.status_code}")
                        raise HTTPException(502, f"AI service error: {message_resp.status_code}")

                    messages = message_resp.json().get("data", [])
                    for msg in messages:
                        if msg.get("type") in {"answer", "assistant_answer"} and msg.get("content"):
                            answer = str(msg.get("content"))
                            await timer.save(
                                prompt_tokens=max(1, len(full_prompt) // 3),
                                completion_tokens=max(1, len(answer) // 3),
                            )
                            return answer
                        if msg.get("role") == "assistant" and msg.get("content"):
                            answer = str(msg.get("content"))
                            await timer.save(
                                prompt_tokens=max(1, len(full_prompt) // 3),
                                completion_tokens=max(1, len(answer) // 3),
                            )
                            return answer
                    await timer.save(success=False, error="No answer in completed chat")
                    raise HTTPException(502, "AI service completed but returned no answer")

                if status in {"failed", "canceled", "requires_action"}:
                    await timer.save(success=False, error=f"Coze status: {status}")
                    raise HTTPException(502, f"AI service ended with status: {status}")

                await asyncio.sleep(poll_interval)

    await timer.save(success=False, error="Coze timeout")
    raise HTTPException(504, "AI service timeout")


@study_notes_router.post("/generate-notes")
async def generate_notes(
    file: UploadFile = File(...),
    style: str = Form("detailed"),
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
        notes_md = await _call_coze_text(NOTES_SYSTEM_PROMPT, prompt, endpoint_label="sub5/generate_notes")

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
        raw = await _call_coze_text(
            FLASHCARD_SYSTEM_PROMPT,
            f"Generate flashcards from:\n\n{source_text}",
            endpoint_label="sub5/generate_flashcards",
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
