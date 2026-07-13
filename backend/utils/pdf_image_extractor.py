"""PDF → base64 image extraction utilities.

Two backends are supported:
  1. opendataloader_pdf  (primary, fast, JSON-based page mapping)
  2. PyMuPDF / fitz      (fallback)

Public API
----------
extract_pdf_images(path: str) -> list[dict]
    Returns a list of {"page": int|str, "data": "data:image/png;base64,..."} dicts.
"""

import base64
import glob
import json
import logging
import os
import shutil
import tempfile

from backend.utils.pdf_loader_adapter import convert_pdf

logger = logging.getLogger(__name__)


def _collect_image_nodes(node: dict, results: list) -> None:
    """Recursively collect image items from opendataloader_pdf JSON output."""
    if str(node.get("type", "")).lower() == "image":
        results.append(node)
    for child in node.get("kids", []):
        _collect_image_nodes(child, results)


def _extract_pdf_diagrams_opendataloader(path: str) -> list[dict]:
    """Primary: use opendataloader_pdf for fast image extraction."""
    tmp_dir = tempfile.mkdtemp(prefix="sub4_pdf_")
    try:
        img_dir = os.path.join(tmp_dir, "images")
        os.makedirs(img_dir, exist_ok=True)

        convert_pdf(
            input_path=path,
            output_dir=tmp_dir,
            format="json",
            image_output="external",
            image_format="png",
            image_dir=img_dir,
            quiet=True,
        )

        # Parse JSON for page-number mapping
        json_files = glob.glob(os.path.join(tmp_dir, "*.json"))
        page_map: dict[str, int] = {}
        if json_files:
            with open(json_files[0], "r") as f:
                meta = json.load(f)
            img_nodes: list[dict] = []
            _collect_image_nodes(meta, img_nodes)
            for node in img_nodes:
                src = node.get("source", "")
                page_map[os.path.basename(src)] = node.get("page number", 0)

        extracted: list[dict] = []
        for img_file in sorted(os.listdir(img_dir)):
            img_path = os.path.join(img_dir, img_file)
            if not os.path.isfile(img_path):
                continue
            try:
                img_bytes = open(img_path, "rb").read()
                b64 = base64.b64encode(img_bytes).decode("ascii")
                page_num = page_map.get(img_file, 0)
                extracted.append({
                    "page": page_num if page_num else "Unknown",
                    "data": f"data:image/png;base64,{b64}",
                })
            except Exception:
                continue
        return extracted
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _extract_pdf_diagrams_fitz(path: str) -> list[dict]:
    """Fallback: use PyMuPDF (fitz) when opendataloader_pdf fails."""
    import fitz

    doc = fitz.open(path)
    extracted: list[dict] = []
    for i in range(doc.page_count):
        for img in doc.get_page_images(i):
            pix = fitz.Pixmap(doc, img[0])
            if pix.n >= 5:
                pix = fitz.Pixmap(fitz.csRGB, pix)
            b64 = base64.b64encode(pix.tobytes("png")).decode("ascii")
            extracted.append({"page": i + 1, "data": f"data:image/png;base64,{b64}"})
    doc.close()
    return extracted


def extract_pdf_images(path: str) -> list[dict]:
    """Extract images from PDF, with opendataloader_pdf primary and fitz fallback.

    Returns a list of {"page": int|str, "data": "data:image/png;base64,..."} dicts.
    """
    try:
        return _extract_pdf_diagrams_opendataloader(path)
    except Exception as e:
        logger.warning(
            "opendataloader_pdf failed for %s, falling back to PyMuPDF: %s", path, e
        )
    return _extract_pdf_diagrams_fitz(path)
