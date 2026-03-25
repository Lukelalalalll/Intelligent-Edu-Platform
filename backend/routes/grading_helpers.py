import json
import shutil
from pathlib import Path
from typing import Tuple, Optional, Dict, Any
from urllib.parse import quote

import fitz

DATA_ROOT = Path(__file__).resolve().parents[2] / "data"
COURSES_PATH = DATA_ROOT / "courses.json"
ANNOTATIONS_DIR = DATA_ROOT / "annotations"
BACKEND_ROOT = Path(__file__).resolve().parents[1]
TEST_PDF_DIR = BACKEND_ROOT / "test_pdf"
ANNOTATED_PDF_DIR = BACKEND_ROOT / "static" / "grading_annotated"
PRISTINE_PDF_DIR = BACKEND_ROOT / "static" / "grading_pristine"
VALID_DEGREE_LEVELS = {"bachelor", "master", "phd"}


def _ensure_directories() -> None:
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    ANNOTATIONS_DIR.mkdir(parents=True, exist_ok=True)
    ANNOTATED_PDF_DIR.mkdir(parents=True, exist_ok=True)
    PRISTINE_PDF_DIR.mkdir(parents=True, exist_ok=True)


def load_courses() -> Dict[str, Any]:
    _ensure_directories()
    if not COURSES_PATH.exists():
        return {"courses": []}
    try:
        raw_data = json.loads(COURSES_PATH.read_text())
        normalized = normalize_courses_data(raw_data)
        return normalized
    except json.JSONDecodeError:
        return {"courses": []}


def save_courses(data: Dict[str, Any]) -> None:
    _ensure_directories()
    COURSES_PATH.write_text(json.dumps(data, indent=2))


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


def find_submission(submission_id: str) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """Return (course, assignment, submission) for an id."""
    data = load_courses()
    for course in data.get("courses", []):
        for assignment in course.get("assignments", []):
            for submission in assignment.get("submissions", []):
                if submission.get("id") == submission_id:
                    return course, assignment, submission
    return None, None, None


def load_annotations(submission_id: str) -> Dict[str, Any]:
    _ensure_directories()
    ann_path = ANNOTATIONS_DIR / f"{submission_id}.json"
    if not ann_path.exists():
        return {
            "submissionId": submission_id,
            "annotations": [],
            "totalScore": None,
            "rubricScores": {},
            "overallFeedback": "",
            "cozeAiResponses": [],
        }
    try:
        return json.loads(ann_path.read_text())
    except json.JSONDecodeError:
        return {
            "submissionId": submission_id,
            "annotations": [],
            "totalScore": None,
            "rubricScores": {},
            "overallFeedback": "",
            "cozeAiResponses": [],
        }


def save_annotations(submission_id: str, payload: Dict[str, Any]) -> None:
    _ensure_directories()
    ann_path = ANNOTATIONS_DIR / f"{submission_id}.json"
    ann_path.write_text(json.dumps(payload, indent=2))


def _get_test_pdf_override() -> Optional[Path]:
    pdfs = sorted(TEST_PDF_DIR.glob("*.pdf"))
    return pdfs[0] if pdfs else None


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
