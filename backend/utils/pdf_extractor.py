import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def _get_max_pages() -> int:
    try:
        from backend.config import Config
        return int(getattr(Config, "RAG_PDF_MAX_PAGES", 200))
    except Exception:
        return 200


def _extract_with_marker(path: Path, max_pages: int) -> str:
    """Primary extractor using marker-pdf (ML-based).

    Handles:
    - Normal text PDFs (course slides, textbooks)
    - Multi-column layouts (academic papers)
    - Mathematical formulas → LaTeX
    - Tables → Markdown
    - Scanned / image-only PDFs (surya-ocr built-in)

    Returns Markdown-formatted text, which pairs well with the downstream
    heading-aware chunker (build_structured_chunks).
    """
    try:
        from marker.converters.pdf import PdfConverter
        from marker.models import create_model_dict
        from marker.output import text_from_rendered
    except ImportError:
        logger.warning("marker-pdf not installed; falling back to PyMuPDF for %s", path.name)
        return ""

    try:
        logger.info("Running marker-pdf on %s (max_pages=%d)", path.name, max_pages)
        converter = PdfConverter(artifact_dict=create_model_dict())
        rendered = converter(str(path))
        text, _, _images = text_from_rendered(rendered)
        if text and text.strip():
            logger.info("marker-pdf succeeded for %s (%d chars)", path.name, len(text))
            return text
        logger.info("marker-pdf returned empty for %s", path.name)
        return ""
    except Exception:
        logger.exception("marker-pdf failed for %s", path.name)
        return ""


def _extract_with_pymupdf(path: Path, max_pages: int) -> str:
    """Fallback extractor using PyMuPDF (fitz).

    Used only when marker-pdf crashes or is unavailable.
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        logger.warning("PyMuPDF (fitz) not installed; cannot extract %s", path.name)
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
        logger.exception("PyMuPDF failed to extract text from PDF: %s", path)
        return ""
    return "\f".join(text_parts)


def _extract_pdf_outline(path: Path) -> str:
    """Extract PDF bookmarks/outline via PyMuPDF and format as Markdown headings.

    Prepended to the extracted text so the downstream chunker has reliable
    heading anchors even when body text has no detectable heading patterns.
    """
    try:
        import fitz
    except ImportError:
        return ""

    try:
        with fitz.open(str(path)) as doc:
            toc = doc.get_toc(simple=True)  # [(level, title, page), ...]
            if not toc:
                return ""
            lines: list[str] = ["# Document Outline", ""]
            for level, title, _page in toc[:100]:  # cap at 100 entries
                prefix = "#" * min(max(level, 1), 6)
                lines.append(f"{prefix} {title.strip()}")
            return "\n".join(lines)
    except Exception:
        return ""


def extract_text_from_pdf(
    pdf_path: str | Path,
    max_pages: int | None = None,
    *,
    use_fast: bool = False,
) -> str:
    """Extract text content from a PDF file.

    Pipeline (use_fast=False, default):
    1. marker-pdf (primary) — ML-based, handles multi-column, math formulas,
       tables, and scanned PDFs via built-in surya-ocr.
    2. PyMuPDF (fallback) — lightweight, used only when marker-pdf crashes
       or is not importable.

    Pipeline (use_fast=True):
    - PyMuPDF only. Skips marker-pdf entirely for speed (~10x faster).
      Suitable for grading/chat context where extraction quality matters less.

    Prepends PDF outline/bookmarks as Markdown headings when available.
    Returns an empty string if the file cannot be read.
    """
    if max_pages is None:
        max_pages = _get_max_pages()
    path = Path(pdf_path)
    if not path.exists():
        logger.warning("PDF file not found: %s", pdf_path)
        return ""

    if use_fast:
        # ── Fast path: PyMuPDF only ───────────────────────────────────────
        logger.info("Fast extract mode for %s (PyMuPDF)", path.name)
        result = _extract_with_pymupdf(path, max_pages)
        if not result.strip():
            logger.warning("PyMuPDF returned empty for %s", path.name)
            return ""
        outline_header = _extract_pdf_outline(path)
        if outline_header:
            result = outline_header + "\n\n" + result
        return result

    # ── 1. marker-pdf (primary) ───────────────────────────────────────────
    result = _extract_with_marker(path, max_pages)

    # ── 2. PyMuPDF (fallback) ─────────────────────────────────────────────
    if not result.strip():
        logger.info("marker-pdf returned empty for %s, trying PyMuPDF fallback", path.name)
        result = _extract_with_pymupdf(path, max_pages)

    if not result.strip():
        logger.warning(
            "All extractors (marker-pdf, PyMuPDF) returned empty text for %s "
            "— file may be corrupt or unreadable",
            path.name,
        )
        return ""

    # ── Prepend PDF outline as heading anchors ────────────────────────────
    outline_header = _extract_pdf_outline(path)
    if outline_header:
        result = outline_header + "\n\n" + result

    return result
