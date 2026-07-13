"""PDF text extraction and OCR fallback for sub2."""

from __future__ import annotations

import logging
import tempfile

import fitz

from backend.utils.pdf_loader_adapter import (
    PDFLoaderError,
    convert_pdf,
    is_pdf_loader_available,
    read_markdown_output,
)

logger = logging.getLogger(__name__)


def _page_numbers_to_spec(page_numbers):
    """Convert 0-based selected pages to opendataloader page spec (1-based)."""
    if not page_numbers:
        return None

    pages = sorted({int(p) + 1 for p in page_numbers if int(p) >= 0})
    if not pages:
        return None

    ranges = []
    start = prev = pages[0]
    for page in pages[1:]:
        if page == prev + 1:
            prev = page
            continue
        ranges.append(f"{start}-{prev}" if start != prev else f"{start}")
        start = prev = page
    ranges.append(f"{start}-{prev}" if start != prev else f"{start}")
    return ",".join(ranges)


def _extract_pdf_text_with_fitz(pdf_path, page_numbers):
    """Fallback extractor using PyMuPDF when OpenDataLoader cannot run."""
    selected_pages = sorted({int(p) for p in (page_numbers or []) if int(p) >= 0})
    text_chunks = []

    doc = fitz.open(pdf_path)
    try:
        page_indexes = selected_pages if selected_pages else list(range(len(doc)))
        for page_idx in page_indexes:
            if page_idx >= len(doc):
                continue
            page_text = doc[page_idx].get_text("text") or ""
            if page_text.strip():
                text_chunks.append(page_text)
    finally:
        doc.close()

    text = "\n".join(text_chunks).strip()
    if not text:
        raise Exception("No text could be extracted from PDF with fallback parser")
    return text


def _extract_pdf_text_with_paddle(pdf_path, page_numbers):
    """PaddleOCR extractor for scanned or handwritten PDFs."""
    from pathlib import Path

    from backend.utils.handwriting_ocr import extract_handwriting_from_pdf

    selected_pages = sorted({int(p) for p in (page_numbers or []) if int(p) >= 0})
    path = Path(pdf_path)
    full_text = extract_handwriting_from_pdf(path)
    if not full_text.strip():
        raise Exception("PaddleOCR returned empty text for " + path.name)

    if not selected_pages:
        return full_text

    all_pages = full_text.split("\f")
    chunks = [all_pages[i] for i in selected_pages if i < len(all_pages) and all_pages[i].strip()]
    if not chunks:
        raise Exception("Selected pages yielded no text after PaddleOCR")
    return "\n".join(chunks)


def _fitz_then_paddle(pdf_path, page_numbers):
    """Try PyMuPDF first, then PaddleOCR if needed."""
    try:
        text = _extract_pdf_text_with_fitz(pdf_path, page_numbers)
        if text.strip():
            return text
        logger.info("PyMuPDF returned empty text for %s, trying PaddleOCR", pdf_path)
    except Exception as exc:
        logger.warning("PyMuPDF extraction failed for %s: %s", pdf_path, exc)

    try:
        return _extract_pdf_text_with_paddle(pdf_path, page_numbers)
    except Exception as exc:
        logger.warning("PaddleOCR also failed for %s: %s", pdf_path, exc)
        raise Exception(f"All PDF extractors failed for {pdf_path}") from exc


def extract_pdf_text_with_loader(pdf_path, page_numbers):
    """Use OpenDataLoader to extract selected PDF pages as markdown text."""
    if not is_pdf_loader_available():
        logger.warning("OpenDataLoader unavailable, using PyMuPDF fallback")
        return _fitz_then_paddle(pdf_path, page_numbers)

    page_spec = _page_numbers_to_spec(page_numbers)
    try:
        with tempfile.TemporaryDirectory(prefix="sub2_odl_") as tmp_dir:
            convert_pdf(
                input_path=pdf_path,
                output_dir=tmp_dir,
                format="markdown",
                quiet=True,
                image_output="off",
                pages=page_spec,
            )
            return read_markdown_output(tmp_dir, pdf_path)
    except PDFLoaderError as exc:
        logger.warning("OpenDataLoader failed, using PyMuPDF fallback: %s", exc)
        return _fitz_then_paddle(pdf_path, page_numbers)
