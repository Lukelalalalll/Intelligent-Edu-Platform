"""Service helpers for sub4 diagram extraction."""

from __future__ import annotations

import base64
import logging

from backend.utils.pdf_image_extractor import extract_pdf_images

logger = logging.getLogger(__name__)


def extract_diagrams_from_file(abs_path: str, filename: str) -> dict:
    """Read a PDF/DOCX from disk and extract diagram images."""
    extracted: list[dict] = []

    if filename.lower().endswith(".pdf"):
        extracted = extract_pdf_images(abs_path)
    elif filename.lower().endswith((".docx", ".doc")):
        from docx import Document

        docx = Document(abs_path)
        for idx, shape in enumerate(docx.inline_shapes):
            try:
                if shape._inline.graphic.graphicData.pic is not None:
                    rel = shape._inline.graphic.graphicData.pic.blipFill.blip.embed
                    b64 = base64.b64encode(docx.part.related_parts[rel].blob).decode("ascii")
                    extracted.append(
                        {
                            "page": f"Word-Img-{idx + 1}",
                            "data": f"data:image/png;base64,{b64}",
                        }
                    )
            except Exception:
                logger.debug("Skipping inline shape %d - not an image", idx)

    return {
        "extracted": extracted,
        "extracted_count": len(extracted),
    }
