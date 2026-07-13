"""Annotation persistence and PDF rendering for the grading workbench."""
import json
import logging
import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional

import fitz
from backend.core.database import db
from ._shared import (
    _ensure_directories,
    ANNOTATIONS_DIR,
    ANNOTATED_PDF_DIR,
    PRISTINE_PDF_DIR,
    PROJECT_ROOT,
    BACKEND_ROOT,
)

logger = logging.getLogger(__name__)

ANNOTATIONS_COLLECTION = "annotations"


def _default_annotation_store(submission_id: str) -> Dict[str, Any]:
    return {
        "submissionId": submission_id,
        "annotations": [],
        "totalScore": None,
        "rubricScores": {},
        "overallFeedback": "",
        "cozeAiResponses": [],
    }


async def load_annotations(submission_id: str) -> Dict[str, Any]:
    """Load annotations from MongoDB, falling back to JSON file for migration."""
    _ensure_directories()
    coll = db[ANNOTATIONS_COLLECTION]
    doc = await coll.find_one({"submissionId": submission_id}, {"_id": 0})
    if doc:
        return doc

    # Fallback: attempt to read from legacy JSON file and migrate to MongoDB
    ann_path = ANNOTATIONS_DIR / f"{submission_id}.json"
    if ann_path.exists():
        try:
            data = json.loads(ann_path.read_text())
            data["submissionId"] = submission_id
            data.pop("_id", None)
            await coll.update_one(
                {"submissionId": submission_id},
                {"$set": data},
                upsert=True,
            )
            logger.info("Migrated annotation %s from JSON to MongoDB", submission_id)
            return data
        except (json.JSONDecodeError, Exception):
            logger.exception("Failed to read legacy annotation file %s", submission_id)

    return _default_annotation_store(submission_id)


async def save_annotations(submission_id: str, payload: Dict[str, Any]) -> None:
    """Save annotations to MongoDB (primary) and JSON file (backup)."""
    _ensure_directories()
    payload["submissionId"] = submission_id
    payload.pop("_id", None)

    coll = db[ANNOTATIONS_COLLECTION]
    await coll.update_one(
        {"submissionId": submission_id},
        {"$set": payload},
        upsert=True,
    )

    # Keep JSON backup for compatibility
    ann_path = ANNOTATIONS_DIR / f"{submission_id}.json"
    ann_path.write_text(json.dumps(payload, indent=2))


def _get_test_pdf_override() -> Optional[Path]:
    from ._shared import TEST_PDF_DIR
    pdfs = sorted(TEST_PDF_DIR.glob("*.pdf"))
    for pdf in pdfs:
        try:
            if pdf.is_file() and pdf.stat().st_size > 0:
                return pdf
        except OSError:
            continue
    return None


def get_source_pdf_path(submission: Dict[str, Any]) -> Optional[Path]:
    """Resolve the source PDF path on disk for a submission."""
    raw_path = (submission or {}).get("pdfPath") or ""
    if not raw_path:
        return None

    normalized = str(raw_path).lstrip("/")
    if normalized.startswith("data/"):
        return PROJECT_ROOT / normalized
    if normalized.startswith("test_pdf/") or normalized.startswith("uploads/"):
        return BACKEND_ROOT / normalized
    return PROJECT_ROOT / normalized


def get_source_pdf_web_path(submission: Dict[str, Any]) -> str:
    return str((submission or {}).get("pdfPath") or "").lstrip("/")


def get_annotated_pdf_path(submission_id: str) -> Path:
    return ANNOTATED_PDF_DIR / f"{submission_id}.pdf"


def get_pristine_pdf_path(submission_id: str, source_pdf: Path) -> Path:
    # Keep original extension in case upstream file is not .pdf in naming convention.
    ext = source_pdf.suffix or ".pdf"
    return PRISTINE_PDF_DIR / f"{submission_id}{ext}"


def _format_timestamp(ts: Any) -> str:
    if not ts:
        return ""
    text = str(ts).strip()
    if not text:
        return ""
    return text.replace("T", " ")[:19]


def render_annotations_to_pdf(
    submission_id: str,
    submission: Dict[str, Any],
    annotations: List[Dict[str, Any]],
) -> Optional[str]:
    """Hard-overwrite source PDF using a pristine backup as render base."""
    _ensure_directories()
    source_pdf = get_source_pdf_path(submission)
    if not source_pdf or not source_pdf.exists():
        return None

    pristine_pdf = get_pristine_pdf_path(submission_id, source_pdf)
    # Track which source file the pristine was created from via a sidecar .meta file.
    # If the source path changed (e.g. test_pdf override removed), recreate pristine.
    pristine_meta = pristine_pdf.with_suffix(".meta")
    stored_source = pristine_meta.read_text().strip() if pristine_meta.exists() else ""
    if not pristine_pdf.exists() or str(source_pdf) != stored_source:
        shutil.copy2(source_pdf, pristine_pdf)
        pristine_meta.write_text(str(source_pdf))

    if not annotations:
        # Restore pristine source when all labels are removed.
        shutil.copy2(pristine_pdf, source_pdf)
        return get_source_pdf_web_path(submission)

    out_pdf = get_annotated_pdf_path(submission_id)
    doc = fitz.open(pristine_pdf)
    try:
        for idx, ann in enumerate(annotations, start=1):
            page_num = int(ann.get("pageNumber", 1)) - 1
            if page_num < 0 or page_num >= len(doc):
                continue

            page = doc[page_num]
            rect = page.rect
            x = float(ann.get("x", 0.1)) * rect.width
            y = float(ann.get("y", 0.1)) * rect.height

            x = min(max(x, 14), rect.width - 14)
            y = min(max(y, 18), rect.height - 18)

            label_title = (ann.get("title") or "").strip()
            label_body = (ann.get("comment") or "").strip()
            text = f"{label_title}\n{label_body}".strip() if label_title else label_body
            if not text:
                text = f"Label {idx}"
            ts_text = _format_timestamp(ann.get("timestamp"))

            center = fitz.Point(x, y)
            pin_color = (0.05, 0.33, 0.82)
            page.draw_circle(center, radius=8, color=pin_color, fill=pin_color, width=1)
            page.insert_text((x - 3, y + 3), str(idx), fontsize=7, color=(1, 1, 1))

            box_w = 230
            box_h = 76
            box_x0 = min(x + 12, rect.width - box_w - 8)
            box_y0 = max(y - 12, 8)
            box = fitz.Rect(box_x0, box_y0, box_x0 + box_w, min(box_y0 + box_h, rect.height - 8))

            # Arrow from pin to note box
            arrow_target = fitz.Point(box.x0, min(max(y, box.y0 + 8), box.y1 - 8))
            page.draw_line(center, arrow_target, color=pin_color, width=1.1)
            page.draw_line(arrow_target, fitz.Point(arrow_target.x + 5, arrow_target.y - 3), color=pin_color, width=1.1)
            page.draw_line(arrow_target, fitz.Point(arrow_target.x + 5, arrow_target.y + 3), color=pin_color, width=1.1)

            # Semi-transparent sticky note
            page.draw_rect(
                box,
                color=(0.78, 0.63, 0.1),
                fill=(1.0, 0.97, 0.62),
                width=0.9,
                fill_opacity=0.6,
                stroke_opacity=0.9,
            )
            text_box = fitz.Rect(box.x0 + 6, box.y0 + 6, box.x1 - 6, box.y1 - 18)
            page.insert_textbox(text_box, text[:320], fontsize=7.3, color=(0.12, 0.12, 0.12), lineheight=1.15)
            if ts_text:
                page.insert_text((box.x0 + 6, box.y1 - 7), ts_text, fontsize=6.1, color=(0.35, 0.35, 0.35))

        doc.save(out_pdf, garbage=4, deflate=True)
    finally:
        doc.close()

    shutil.copy2(out_pdf, source_pdf)
    return get_source_pdf_web_path(submission)
