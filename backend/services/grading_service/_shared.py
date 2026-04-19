"""Shared constants and utility functions for the grading_service package."""
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

logger = logging.getLogger(__name__)

# This file lives at:  backend/services/grading_service/_shared.py
# parents[0] = grading_service/
# parents[1] = services/
# parents[2] = backend/
# parents[3] = project root
BACKEND_ROOT = Path(__file__).resolve().parents[2]
PROJECT_ROOT = Path(__file__).resolve().parents[3]

DATA_ROOT = PROJECT_ROOT / "data"
COURSES_PATH = DATA_ROOT / "courses.json"
ANNOTATIONS_DIR = DATA_ROOT / "annotations"
TEST_PDF_DIR = BACKEND_ROOT / "test_pdf"
ANNOTATED_PDF_DIR = BACKEND_ROOT / "static" / "grading_annotated"
PRISTINE_PDF_DIR = BACKEND_ROOT / "static" / "grading_pristine"

VALID_DEGREE_LEVELS = {"bachelor", "master", "phd"}
COURSES_COLLECTION = "courses"


def _ensure_directories() -> None:
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    ANNOTATIONS_DIR.mkdir(parents=True, exist_ok=True)
    ANNOTATED_PDF_DIR.mkdir(parents=True, exist_ok=True)
    PRISTINE_PDF_DIR.mkdir(parents=True, exist_ok=True)


def _oid(doc: Dict[str, Any]) -> str:
    """Stringify the Mongo _id field."""
    return str(doc.get("_id", ""))


def _serialize_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Replace ObjectId _id with a plain string 'id' so FastAPI can JSON-encode it."""
    doc["id"] = _oid(doc)
    doc.pop("_id", None)
    return doc


def _utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
