import asyncio
import json
import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Tuple, Optional, Dict, Any, List
from urllib.parse import quote

import fitz
from bson import ObjectId
from backend.core.database import db

logger = logging.getLogger(__name__)

DATA_ROOT = Path(__file__).resolve().parents[2] / "data"
COURSES_PATH = DATA_ROOT / "courses.json"
ANNOTATIONS_DIR = DATA_ROOT / "annotations"
BACKEND_ROOT = Path(__file__).resolve().parents[1]
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


async def load_courses() -> Dict[str, Any]:
    _ensure_directories()
    courses_coll = db[COURSES_COLLECTION]
    docs = await courses_coll.find({}, {"_id": 0}).to_list(length=5000)
    if docs:
        return normalize_courses_data({"courses": docs})

    if COURSES_PATH.exists():
        try:
            raw_data = json.loads(COURSES_PATH.read_text())
            normalized = normalize_courses_data(raw_data)
            normalized_courses = normalized.get("courses", [])
            if normalized_courses:
                await courses_coll.insert_many(normalized_courses)
            return normalized
        except json.JSONDecodeError:
            return {"courses": []}

    return {"courses": []}


async def save_courses(data: Dict[str, Any]) -> None:
    _ensure_directories()
    normalized = normalize_courses_data(data)
    courses = normalized.get("courses", [])
    courses_coll = db[COURSES_COLLECTION]
    await courses_coll.delete_many({})
    if courses:
        await courses_coll.insert_many(courses)

    # Keep a JSON snapshot for backup and compatibility with existing scripts.
    COURSES_PATH.write_text(json.dumps(normalized, indent=2))


def _normalize_student_list(course: Dict[str, Any]) -> list[Dict[str, Any]]:
    students = course.get("studentList")
    if not isinstance(students, list):
        students = []

    normalized = []
    seen_ids = set()

    for item in students:
        if isinstance(item, dict):
            sid = str(item.get("studentId") or "").strip()
            if not sid or sid in seen_ids:
                continue
            normalized.append({"studentId": sid})
            seen_ids.add(sid)
        elif isinstance(item, str):
            sid = item.strip()
            if not sid or sid in seen_ids:
                continue
            normalized.append({"studentId": sid})
            seen_ids.add(sid)

    # Backfill from submissions to avoid missing student references.
    for assignment in course.get("assignments", []):
        for submission in assignment.get("submissions", []):
            sid = str(submission.get("studentId") or "").strip()
            if sid and sid not in seen_ids:
                normalized.append({"studentId": sid})
                seen_ids.add(sid)

    return normalized


def normalize_course(course: Dict[str, Any]) -> Dict[str, Any]:
    course_id = str(course.get("courseId") or course.get("id") or "").strip()
    teacher_id = str(course.get("teacherId") or "").strip()
    degree_level = str(course.get("degreeLevel") or "bachelor").lower().strip()
    if degree_level not in VALID_DEGREE_LEVELS:
        degree_level = "bachelor"

    normalized = {
        "id": course_id,  # Keep compatibility with existing frontend usages.
        "courseId": course_id,
        "name": course.get("name", ""),
        "teacherId": teacher_id,
        "teacher": course.get("teacher", ""),
        "degreeLevel": degree_level,
        "semester": str(course.get("semester") or "").strip(),
        "studentList": _normalize_student_list(course),
        "assignments": course.get("assignments", []),
    }
    return normalized


def normalize_courses_data(data: Dict[str, Any]) -> Dict[str, Any]:
    courses = data.get("courses", []) if isinstance(data, dict) else []
    normalized_courses = [normalize_course(c) for c in courses if isinstance(c, dict)]
    return {"courses": normalized_courses}


async def find_submission(submission_id: str) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """Return (course, assignment, submission) for an id."""
    data = await load_courses()
    for course in data.get("courses", []):
        for assignment in course.get("assignments", []):
            for submission in assignment.get("submissions", []):
                if submission.get("id") == submission_id:
                    return course, assignment, submission
    return None, None, None


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
    test_pdf = _get_test_pdf_override()
    if test_pdf:
        return test_pdf

    raw_path = (submission or {}).get("pdfPath") or ""
    if not raw_path:
        return None

    normalized = str(raw_path).lstrip("/")
    if normalized.startswith("data/"):
        return Path(__file__).resolve().parents[2] / normalized
    if normalized.startswith("test_pdf/"):
        return BACKEND_ROOT / normalized
    return Path(__file__).resolve().parents[2] / normalized


def get_source_pdf_web_path(submission: Dict[str, Any]) -> str:
    test_pdf = _get_test_pdf_override()
    if test_pdf:
        return f"test_pdf/{quote(test_pdf.name)}"
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


def render_annotations_to_pdf(submission_id: str, submission: Dict[str, Any], annotations: list[Dict[str, Any]]) -> Optional[str]:
    """Hard-overwrite source PDF using a pristine backup as render base."""
    _ensure_directories()
    source_pdf = get_source_pdf_path(submission)
    if not source_pdf or not source_pdf.exists():
        return None

    pristine_pdf = get_pristine_pdf_path(submission_id, source_pdf)
    if not pristine_pdf.exists():
        shutil.copy2(source_pdf, pristine_pdf)

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


# ═══════════════════════════════════════════════════════════════════════
# v2 — Flat domain model helpers
# These operate on individual MongoDB collections instead of the legacy
# nested "courses" document.
# ═══════════════════════════════════════════════════════════════════════

def _oid(doc: Dict[str, Any]) -> str:
    """Stringify the Mongo _id field."""
    return str(doc.get("_id", ""))


def _utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


# ── Course Sections ───────────────────────────────────────────────────

async def create_course_section(data: Dict[str, Any]) -> Dict[str, Any]:
    data.pop("_id", None)
    result = await db.course_sections.insert_one(data)
    doc = await db.course_sections.find_one({"_id": result.inserted_id})
    doc["id"] = _oid(doc)
    return doc


async def get_course_section(section_id: str) -> Optional[Dict[str, Any]]:
    doc = await db.course_sections.find_one({"_id": ObjectId(section_id)})
    if doc:
        doc["id"] = _oid(doc)
    return doc


async def list_course_sections(filter_query: Optional[Dict] = None) -> List[Dict[str, Any]]:
    docs = await db.course_sections.find(filter_query or {}).to_list(length=5000)
    for d in docs:
        d["id"] = _oid(d)
    return docs


async def update_course_section(section_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    data.pop("_id", None)
    await db.course_sections.update_one({"_id": ObjectId(section_id)}, {"$set": data})
    return await get_course_section(section_id)


async def delete_course_section(section_id: str) -> bool:
    result = await db.course_sections.delete_one({"_id": ObjectId(section_id)})
    if result.deleted_count:
        await db.enrollments.delete_many({"courseSectionId": section_id})
        await db.assignments.delete_many({"courseSectionId": section_id})
    return result.deleted_count > 0


# ── Enrollments ───────────────────────────────────────────────────────

async def enroll_user(course_section_id: str, user_id: str, role: str = "student") -> Dict[str, Any]:
    doc = {
        "courseSectionId": course_section_id,
        "userId": user_id,
        "roleInCourse": role,
    }
    await db.enrollments.update_one(
        {"courseSectionId": course_section_id, "userId": user_id},
        {"$set": doc},
        upsert=True,
    )
    return doc


async def unenroll_user(course_section_id: str, user_id: str) -> bool:
    result = await db.enrollments.delete_one({"courseSectionId": course_section_id, "userId": user_id})
    return result.deleted_count > 0


async def list_enrollments(course_section_id: Optional[str] = None, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
    q: Dict[str, Any] = {}
    if course_section_id:
        q["courseSectionId"] = course_section_id
    if user_id:
        q["userId"] = user_id
    docs = await db.enrollments.find(q).to_list(length=5000)
    for d in docs:
        d["id"] = _oid(d)
    return docs


# ── Assignments ───────────────────────────────────────────────────────

async def create_assignment(data: Dict[str, Any]) -> Dict[str, Any]:
    data.pop("_id", None)
    result = await db.assignments.insert_one(data)
    doc = await db.assignments.find_one({"_id": result.inserted_id})
    doc["id"] = _oid(doc)
    return doc


async def get_assignment(assignment_id: str) -> Optional[Dict[str, Any]]:
    doc = await db.assignments.find_one({"_id": ObjectId(assignment_id)})
    if doc:
        doc["id"] = _oid(doc)
    return doc


async def list_assignments(course_section_id: str) -> List[Dict[str, Any]]:
    docs = await db.assignments.find({"courseSectionId": course_section_id}).to_list(length=5000)
    for d in docs:
        d["id"] = _oid(d)
    return docs


async def update_assignment(assignment_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    data.pop("_id", None)
    await db.assignments.update_one({"_id": ObjectId(assignment_id)}, {"$set": data})
    return await get_assignment(assignment_id)


async def delete_assignment(assignment_id: str) -> bool:
    result = await db.assignments.delete_one({"_id": ObjectId(assignment_id)})
    return result.deleted_count > 0


# ── Submissions ───────────────────────────────────────────────────────

async def create_submission(data: Dict[str, Any]) -> Dict[str, Any]:
    data.pop("_id", None)
    data.setdefault("status", "pending")
    data.setdefault("submittedAt", _utcnow())
    data.setdefault("attemptNo", 1)
    result = await db.submissions.insert_one(data)
    doc = await db.submissions.find_one({"_id": result.inserted_id})
    doc["id"] = _oid(doc)
    return doc


async def get_submission(submission_id: str) -> Optional[Dict[str, Any]]:
    doc = await db.submissions.find_one({"_id": ObjectId(submission_id)})
    if doc:
        doc["id"] = _oid(doc)
    return doc


async def list_submissions(assignment_id: str) -> List[Dict[str, Any]]:
    docs = await db.submissions.find({"assignmentId": assignment_id}).to_list(length=5000)
    for d in docs:
        d["id"] = _oid(d)
    return docs


async def list_submissions_for_student(student_id: str) -> List[Dict[str, Any]]:
    docs = await db.submissions.find({"studentId": student_id}).to_list(length=5000)
    for d in docs:
        d["id"] = _oid(d)
    return docs


async def update_submission(submission_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    data.pop("_id", None)
    await db.submissions.update_one({"_id": ObjectId(submission_id)}, {"$set": data})
    return await get_submission(submission_id)


# ── Documents (PDF asset management) ─────────────────────────────────

async def create_document(data: Dict[str, Any]) -> Dict[str, Any]:
    data.pop("_id", None)
    result = await db.documents.insert_one(data)
    doc = await db.documents.find_one({"_id": result.inserted_id})
    doc["id"] = _oid(doc)
    return doc


async def get_document(document_id: str) -> Optional[Dict[str, Any]]:
    doc = await db.documents.find_one({"_id": ObjectId(document_id)})
    if doc:
        doc["id"] = _oid(doc)
    return doc


async def list_documents(owner_id: str, source_type: Optional[str] = None) -> List[Dict[str, Any]]:
    q: Dict[str, Any] = {"ownerId": owner_id}
    if source_type:
        q["sourceType"] = source_type
    docs = await db.documents.find(q).to_list(length=500)
    for d in docs:
        d["id"] = _oid(d)
    return docs


# ── Grades ────────────────────────────────────────────────────────────

async def upsert_grade(submission_id: str, grader_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    data.pop("_id", None)
    data["submissionId"] = submission_id
    data["graderId"] = grader_id
    data.setdefault("gradedAt", _utcnow())
    data.setdefault("gradingStatus", "draft")

    await db.grades.update_one(
        {"submissionId": submission_id},
        {"$set": data},
        upsert=True,
    )
    doc = await db.grades.find_one({"submissionId": submission_id})
    doc["id"] = _oid(doc)

    # Sync submission status
    status = "graded" if data.get("gradingStatus") == "final" else "grading"
    await db.submissions.update_one(
        {"_id": ObjectId(submission_id)},
        {"$set": {"status": status, "latestGradeId": doc["id"]}},
    )
    return doc


async def get_grade(submission_id: str) -> Optional[Dict[str, Any]]:
    doc = await db.grades.find_one({"submissionId": submission_id})
    if doc:
        doc["id"] = _oid(doc)
    return doc


# ── Submission Bundle (for workbench) ─────────────────────────────────

async def get_submission_bundle(submission_id: str) -> Optional[Dict[str, Any]]:
    """Load the full bundle needed by the grading workbench in a single call."""
    submission = await get_submission(submission_id)
    if not submission:
        return None

    assignment = await get_assignment(submission["assignmentId"]) if submission.get("assignmentId") else None
    course = None
    if assignment and assignment.get("courseSectionId"):
        course = await get_course_section(assignment["courseSectionId"])

    annotation_store = await load_annotations(submission_id)
    grade = await get_grade(submission_id)

    # Resolve PDF path — try v2 document first, fall back to legacy pdfPath
    doc_record = None
    if submission.get("latestDocumentId"):
        doc_record = await get_document(submission["latestDocumentId"])

    # Render existing annotations onto the PDF so the viewer shows them
    annotations_list = annotation_store.get("annotations", [])
    rendered_pdf_path = render_annotations_to_pdf(submission_id, submission, annotations_list)
    if rendered_pdf_path:
        submission = {**submission, "pdfPath": rendered_pdf_path}
    elif not submission.get("pdfPath"):
        submission = {**submission, "pdfPath": get_source_pdf_web_path(submission)}

    return {
        "course": course,
        "assignment": assignment,
        "submission": submission,
        "annotations": annotation_store,
        "grade": grade,
        "document": doc_record,
    }


# ── Legacy compatibility: find_submission using v2 collections ─────

async def find_submission_v2(submission_id: str) -> Tuple[Optional[Dict], Optional[Dict], Optional[Dict]]:
    """v2 version: look up from flat collections first, fall back to legacy."""
    try:
        sub = await db.submissions.find_one({"_id": ObjectId(submission_id)})
    except Exception:
        sub = None

    if sub:
        sub["id"] = _oid(sub)
        assignment = await get_assignment(sub["assignmentId"]) if sub.get("assignmentId") else None
        course = None
        if assignment and assignment.get("courseSectionId"):
            course = await get_course_section(assignment["courseSectionId"])
        return course, assignment, sub

    # Fall back to legacy nested search
    return await find_submission(submission_id)
