"""PaddleOCR-based handwriting extractor for image-only / handwritten PDFs.

Drop-in OCR upgrade over pytesseract:
- PP-OCRv5 server model (paddleocr>=3.4)
- Chinese + English mixed recognition out of the box
- Confidence-threshold filtering to suppress gibberish regions
- Lazy singleton: model loads once per worker process and is reused

paddleocr 3.x API notes:
- Constructor accepts only: lang, ocr_version, device, use_doc_orientation_classify,
  use_doc_unwarping, use_textline_orientation, text_det_*, text_rec_*, return_word_box
- Input to predict(): numpy.ndarray or file-path str  (NOT bytes)
- Result: list[OCRResult], each has rec_texts / rec_scores / rec_polys
"""
from __future__ import annotations

import logging
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

# Module-level lazy singleton (per-process, thread-safe after init)
_paddle_ocr = None


def _get_paddle_ocr():
    global _paddle_ocr
    if _paddle_ocr is None:
        try:
            from paddleocr import PaddleOCR  # type: ignore[import]
        except ImportError as exc:
            raise ImportError(
                "paddleocr is not installed. "
                "Run: pip install paddlepaddle paddleocr"
            ) from exc

        _paddle_ocr = PaddleOCR(
            lang="ch",                          # Chinese + English mixed
            use_doc_orientation_classify=True,  # detect rotated/upside-down pages
            use_doc_unwarping=False,            # skip dewarping (slow, not needed for PDFs)
            use_textline_orientation=True,      # per-line orientation (tilted handwriting)
            device="cpu",
        )
        logger.info("PaddleOCR (PP-OCRv5 server, lang=ch) initialized")
    return _paddle_ocr


def _get_confidence_threshold() -> float:
    try:
        from backend.config import Config
        return float(getattr(Config, "HANDWRITING_OCR_CONFIDENCE", 0.5))
    except Exception:
        return 0.5


def _get_dpi() -> int:
    try:
        from backend.config import Config
        return int(getattr(Config, "HANDWRITING_OCR_DPI", 200))
    except Exception:
        return 200


def _page_to_numpy(page, dpi: int) -> np.ndarray:
    """Render a PyMuPDF page to an RGB numpy array."""
    mat = page.parent.Matrix if False else __import__("fitz").Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
    return arr


def _parse_ocr_result(result_item, confidence_threshold: float) -> str:
    """Extract and sort text lines from an OCRResult object (paddleocr>=3.4).

    OCRResult has parallel lists: rec_texts, rec_scores, rec_polys.
    rec_polys[i] is a polygon [[x0,y0],[x1,y1],[x2,y2],[x3,y3]].
    Sort by the top-left y-coordinate to maintain reading order.
    """
    rec_texts = result_item["rec_texts"]
    rec_scores = result_item["rec_scores"]
    rec_polys = result_item["rec_polys"]

    if not rec_texts:
        return ""

    lines = [
        (poly, text)
        for poly, text, score in zip(rec_polys, rec_texts, rec_scores)
        if score >= confidence_threshold and text.strip()
    ]

    # Sort top-to-bottom by top-left y coordinate
    lines.sort(key=lambda item: item[0][0][1])

    return "\n".join(text for _, text in lines)


def extract_handwriting_from_pdf(
    path: Path,
    max_pages: int | None = None,
) -> str:
    """Extract text from an image-only or handwritten PDF using PaddleOCR.

    Pages are rendered at HANDWRITING_OCR_DPI (default 200 DPI) and fed to
    PP-OCRv5 server model. Results are sorted by vertical position to preserve
    reading order, then joined with form-feed separators so callers can
    reconstruct page boundaries.

    Args:
        path: Absolute path to the PDF file.
        max_pages: Override maximum pages (falls back to
            HANDWRITING_OCR_MAX_PAGES config, default 30).

    Returns:
        Extracted text string, pages separated by \\f.
        Returns "" if PaddleOCR is unavailable or the file cannot be read.
    """
    # Respect kill-switch
    try:
        from backend.config import Config
        if not getattr(Config, "HANDWRITING_OCR_ENABLED", True):
            logger.info("HANDWRITING_OCR_ENABLED=False — skipping PaddleOCR for %s", path.name)
            return ""
    except Exception:
        pass

    if max_pages is None:
        try:
            from backend.config import Config
            max_pages = int(getattr(Config, "HANDWRITING_OCR_MAX_PAGES", 30))
        except Exception:
            max_pages = 30

    try:
        import fitz  # PyMuPDF
    except ImportError:
        logger.warning("PyMuPDF (fitz) not available — cannot render PDF pages for PaddleOCR")
        return ""

    try:
        ocr = _get_paddle_ocr()
    except ImportError:
        logger.warning("PaddleOCR not installed — skipping handwriting extraction")
        return ""

    dpi = _get_dpi()
    confidence_threshold = _get_confidence_threshold()
    text_parts: list[str] = []

    try:
        with fitz.open(str(path)) as doc:
            pages = list(doc)[:max_pages]
            total = len(pages)
            logger.info(
                "PaddleOCR: processing %d/%d pages of %s (dpi=%d)",
                total, len(doc), path.name, dpi,
            )

            for page_num, page in enumerate(pages, start=1):
                try:
                    mat = fitz.Matrix(dpi / 72, dpi / 72)
                    pix = page.get_pixmap(matrix=mat, alpha=False)
                    img_arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(
                        pix.height, pix.width, 3
                    )

                    results = ocr.predict(img_arr)

                    if not results:
                        text_parts.append("")
                        continue

                    page_text = _parse_ocr_result(results[0], confidence_threshold)
                    text_parts.append(page_text)
                    logger.debug(
                        "PaddleOCR page %d/%d: %d chars (confidence>=%.2f)",
                        page_num, total, len(page_text), confidence_threshold,
                    )

                except Exception:
                    logger.exception(
                        "PaddleOCR failed on page %d of %s", page_num, path.name
                    )
                    text_parts.append("")

    except Exception:
        logger.exception("PaddleOCR: failed to open PDF %s", path)
        return ""

    full_text = "\f".join(text_parts)
    logger.info(
        "PaddleOCR complete: %s -> %d chars across %d pages",
        path.name, len(full_text), len(text_parts),
    )
    return full_text
