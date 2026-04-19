"""Thin compatibility shim — delegates to backend.repositories.

Service-level orchestration (get_submission_bundle, find_submission_v2)
lives here because it depends on annotation_service and course_service.
"""
import logging
from typing import Any, Dict, Optional, Tuple

from bson import ObjectId

from backend.core.database import db
from ._shared import _oid
from .annotation_service import (
    load_annotations,
    render_annotations_to_pdf,
    get_source_pdf_web_path,
)
from .course_service import find_submission

# Re-export every repo function so existing ``from .v2_repos import X`` works.
from backend.repositories.course_section_repo import (  # noqa: F401
    create_course_section,
    get_course_section,
    list_course_sections,
    update_course_section,
    delete_course_section,
)
from backend.repositories.enrollment_repo import (  # noqa: F401
    enroll_user,
    unenroll_user,
    list_enrollments,
)
from backend.repositories.assignment_repo import (  # noqa: F401
    create_assignment,
    get_assignment,
    list_assignments,
    update_assignment,
    delete_assignment,
)
from backend.repositories.submission_repo import (  # noqa: F401
    create_submission,
    get_submission,
    list_submissions,
    list_submissions_for_student,
    update_submission,
)
from backend.repositories.document_repo import (  # noqa: F401
    create_document,
    get_document,
    list_documents,
)
from backend.repositories.grade_repo import (  # noqa: F401
    upsert_grade,
    get_grade,
)

logger = logging.getLogger(__name__)


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

    # If submission has no pdfPath but the linked document has a storageKey, use it.
    if not submission.get("pdfPath") and doc_record and doc_record.get("storageKey"):
        submission = {**submission, "pdfPath": doc_record["storageKey"]}

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

async def find_submission_v2(
    submission_id: str,
) -> Tuple[Optional[Dict], Optional[Dict], Optional[Dict]]:
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
