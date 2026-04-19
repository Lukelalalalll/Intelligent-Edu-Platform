import logging
from pathlib import Path
import pdfplumber

logger = logging.getLogger(__name__)

OCR_DPI = 200  # Lower DPI = faster OCR; raise to 300 for better accuracy

MAX_PAGES = 200


def _extract_with_ocr(path: Path, max_pages: int) -> str:
    """Last-resort OCR extraction using PyMuPDF page rendering + pytesseract.
    Only called when both pdfplumber and PyMuPDF text extraction return empty (image-only PDFs).
    Does NOT require poppler.
    """
    try:
        import fitz
        import pytesseract
        from PIL import Image
        import io
    except ImportError:
        logger.warning("fitz / pytesseract / Pillow not available; cannot OCR %s", path.name)
        return ""

    logger.info("Running OCR on %s (max %d pages, dpi=%d)", path.name, max_pages, OCR_DPI)
    text_parts: list[str] = []
    try:
        with fitz.open(str(path)) as doc:
            pages = list(doc)[:max_pages]
            for page in pages:
                # Render page to PNG at target DPI
                mat = fitz.Matrix(OCR_DPI / 72, OCR_DPI / 72)
                pix = page.get_pixmap(matrix=mat, alpha=False)
                img = Image.open(io.BytesIO(pix.tobytes("png")))
                text_parts.append(pytesseract.image_to_string(img) or "")
    except Exception:
        logger.exception("OCR failed for %s", path.name)
        return ""
    return "\f".join(text_parts)


def _extract_with_pymupdf(path: Path, max_pages: int) -> str:
    """Fallback extractor using PyMuPDF (fitz). Handles PDFs that pdfplumber can't parse."""
    try:
        import fitz  # PyMuPDF
    except ImportError:
        return ""
    text_parts: list[str] = []
    try:
        with fitz.open(str(path)) as doc:
            pages = list(doc)[:max_pages]
            for page in pages:
                text_parts.append(page.get_text() or "")
            if len(doc) > max_pages:
                logger.warning(
                    "PDF truncated (fitz): %s has %d pages, extracted first %d",
                    path.name, len(doc), max_pages,
                )
    except Exception:
        logger.exception("fitz failed to extract text from PDF: %s", path)
        return ""
    return "\f".join(text_parts)


def extract_text_from_pdf(pdf_path: str | Path, max_pages: int = MAX_PAGES) -> str:
    """Extract text content from a PDF file.

    Tries pdfplumber first; falls back to PyMuPDF (fitz) if pdfplumber
    returns no text (e.g. PDFs with non-standard encoding or structure).

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

    result = "\f".join(text_parts)

    # If pdfplumber returned nothing, try PyMuPDF as fallback
    if not result.strip():
        logger.info("pdfplumber returned empty text for %s, trying PyMuPDF fallback", path.name)
        result = _extract_with_pymupdf(path, max_pages)

    # If still empty, try OCR (image-only PDF)
    if not result.strip():
        logger.info("PyMuPDF returned empty text for %s, trying OCR fallback", path.name)
        result = _extract_with_ocr(path, max_pages)
        if result.strip():
            logger.info("OCR fallback succeeded for %s (%d chars)", path.name, len(result))
        else:
            logger.warning(
                "All extractors (pdfplumber, PyMuPDF, OCR) returned empty text for %s — file may be corrupt or non-PDF",
                path.name,
            )

    return result
