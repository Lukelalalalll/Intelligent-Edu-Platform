"""Step A — Content extraction (PDF, MD, TXT)."""
from __future__ import annotations

import logging
import os
import re
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)


def extract_text_from_pdf(pdf_path: str) -> list[str]:
    """Extract text per page, using OpenDataLoader (high-quality) with fitz fallback."""
    try:
        import opendataloader_pdf
        with tempfile.TemporaryDirectory(prefix="video_odl_") as tmp_dir:
            opendataloader_pdf.convert(
                input_path=pdf_path,
                output_dir=tmp_dir,
                format="markdown",
                quiet=True,
                image_output="off",
            )
            stem = os.path.splitext(os.path.basename(pdf_path))[0]
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
                text = open(md_path, "r", encoding="utf-8", errors="replace").read()
                # Split by markdown headings or double newlines
                chunks = re.split(r"\n#{1,3} |\n\n", text)
                result = [c.strip() for c in chunks if len(c.strip()) > 20]
                if result:
                    return result
    except Exception as exc:
        logger.info("OpenDataLoader unavailable, using PyMuPDF fallback: %s", exc)

    # Fallback: pymupdf page-by-page
    import fitz
    doc = fitz.open(pdf_path)
    return [page.get_text("text").strip() for page in doc if page.get_text("text").strip()]


def extract_text_from_pdf_by_page(pdf_path: str) -> list[str]:
    """Extract text strictly per page — len(result) == number of PDF pages.

    Guarantees index parity with pdf_to_images() so slide[i] is always
    narrated by script[i].  Blank pages get a placeholder so the index
    never shifts.
    """
    import fitz
    doc = fitz.open(pdf_path)
    pages: list[str] = []
    for page in doc:
        text = page.get_text("text").strip()
        pages.append(text if text else f"（第 {page.number + 1} 页 / Page {page.number + 1}）")
    return pages


def pdf_to_images(pdf_path: str, work_dir: Path) -> list[Path]:
    """Render each PDF page as a 1280×720 PNG image."""
    import fitz
    doc = fitz.open(pdf_path)
    paths: list[Path] = []
    for i, page in enumerate(doc):
        # Scale to ~1280px wide
        zoom = 1280 / max(page.rect.width, 1)
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat)
        out = work_dir / f"slide_{i:03d}.png"
        pix.save(str(out))
        paths.append(out)
    return paths


def extract_text_from_md_txt(file_path: str) -> list[str]:
    text = Path(file_path).read_text(encoding="utf-8")
    chunks = re.split(r"\n#{1,3} |\n\n", text)
    return [c.strip() for c in chunks if len(c.strip()) > 30]
