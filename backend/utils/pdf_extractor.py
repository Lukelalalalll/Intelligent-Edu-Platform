import logging
from pathlib import Path
import pdfplumber

logger = logging.getLogger(__name__)

MAX_PAGES = 200


def extract_text_from_pdf(pdf_path: str | Path, max_pages: int = MAX_PAGES) -> str:
    """Extract text content from a PDF file.

    Uses form-feed (\\f) to separate pages so downstream services can
    accurately reconstruct page boundaries.

    Returns an empty string if the file cannot be read.
    """
    path = Path(pdf_path)
    if not path.exists():
        return ""

    text_parts: list[str] = []
    try:
        with pdfplumber.open(path) as pdf:
            pages = pdf.pages[:max_pages]
            for page in pages:
                page_text = page.extract_text() or ""
                text_parts.append(page_text)
            if len(pdf.pages) > max_pages:
                logger.warning(
                    "PDF truncated: %s has %d pages, extracted first %d",
                    path.name,
                    len(pdf.pages),
                    max_pages,
                )
    except Exception:
        logger.exception("Failed to extract text from PDF: %s", path)
        return ""

    # Join with form-feed for accurate page boundary detection
    return "\f".join(text_parts)
