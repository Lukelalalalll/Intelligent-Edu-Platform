"""Private helpers: PDF text extraction, AI prompts, schemas."""
import logging
import os
import re
import tempfile

from pydantic import BaseModel, Field

from backend.config import Config
from backend.core.dependencies import get_ai_gateway_service
from backend.utils.pdf_loader_adapter import (
    PDFLoaderError,
    convert_pdf,
    read_markdown_output,
)

logger = logging.getLogger(__name__)

UPLOAD_DIR = os.path.join(Config.BASE_DIR, "uploads", "sub5")
os.makedirs(UPLOAD_DIR, exist_ok=True)

MAX_PDF_TEXT_CHARS = 50000
STUDY_DURATION_PRESETS = {"3d": 3, "7d": 7, "14d": 14}

# ── Schemas ─────────────────────────────────────────────────────────

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


# ── PDF extraction ──────────────────────────────────────────────────

def extract_pdf_text(path: str, max_chars: int = MAX_PDF_TEXT_CHARS) -> str:
    """Extract text from PDF using OpenDataLoader, fallback to PyMuPDF."""
    try:
        with tempfile.TemporaryDirectory(prefix="sub5_odl_") as tmp_dir:
            convert_pdf(
                input_path=path,
                output_dir=tmp_dir,
                format="markdown",
                quiet=True,
                image_output="off",
            )
            text = read_markdown_output(tmp_dir, path)
            if text.strip():
                logger.info("PDF extracted via opendataloader: %d chars", len(text))
                return text[:max_chars]
    except PDFLoaderError:
        logger.warning("opendataloader_pdf failed for %s, falling back to PyMuPDF", path)

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


# ── AI prompts ──────────────────────────────────────────────────────

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


async def call_coze_text(system_prompt: str, user_content: str, endpoint_label: str = "sub5/notes", provider: str = "local_ollama") -> str:
    ai_service = get_ai_gateway_service()
    context = {"system_override": system_prompt}
    return await ai_service.chat_with_provider(message=user_content, context=context, provider=provider)


# ── Plan helpers ────────────────────────────────────────────────────

def resolve_study_days(duration_option: str, custom_days: int | None) -> int:
    from fastapi import HTTPException
    option = str(duration_option or "").strip().lower()
    if option == "custom":
        if not custom_days:
            raise HTTPException(400, "custom_days is required when duration_option is custom")
        return int(custom_days)
    if option not in STUDY_DURATION_PRESETS:
        raise HTTPException(400, "duration_option must be one of 3d, 7d, 14d, custom")
    return int(STUDY_DURATION_PRESETS[option])


def extract_study_units(notes: str) -> list[str]:
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
