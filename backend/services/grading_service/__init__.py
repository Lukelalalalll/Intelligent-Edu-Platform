"""grading_service package — public API.

All symbols that were previously importable from ``backend.services.grading_service``
are re-exported here, so every existing ``from backend.services.grading_service import X``
statement continues to work without modification.

Internal layout
---------------
_shared.py           — path constants + tiny utility functions
annotation_service.py — annotation CRUD + PDF rendering (render_annotations_to_pdf)
course_service.py    — legacy courses JSON/MongoDB (load_courses, save_courses, …)
orchestration.py          — flat domain model repos (course_sections, enrollments, …)
"""
from .course_service import (
    load_courses,
    save_courses,
    normalize_course,
    normalize_courses_data,
    find_submission,
)

from .annotation_service import (
    load_annotations,
    save_annotations,
    get_source_pdf_path,
    get_source_pdf_web_path,
    get_annotated_pdf_path,
    get_pristine_pdf_path,
    render_annotations_to_pdf,
)

from .orchestration import (
    create_course_section,
    get_course_section,
    list_course_sections,
    update_course_section,
    delete_course_section,
    enroll_user,
    unenroll_user,
    list_enrollments,
    create_assignment,
    get_assignment,
    list_assignments,
    update_assignment,
    delete_assignment,
    create_submission,
    get_submission,
    list_submissions,
    list_submissions_for_student,
    update_submission,
    create_document,
    get_document,
    list_documents,
    upsert_grade,
    get_grade,
    get_submission_bundle,
    find_submission_v2,
)

__all__ = [
    # course_service
    "load_courses",
    "save_courses",
    "normalize_course",
    "normalize_courses_data",
    "find_submission",
    # annotation_service
    "load_annotations",
    "save_annotations",
    "get_source_pdf_path",
    "get_source_pdf_web_path",
    "get_annotated_pdf_path",
    "get_pristine_pdf_path",
    "render_annotations_to_pdf",
    # orchestration — course sections
    "create_course_section",
    "get_course_section",
    "list_course_sections",
    "update_course_section",
    "delete_course_section",
    # orchestration —enrollments
    "enroll_user",
    "unenroll_user",
    "list_enrollments",
    # orchestration —assignments
    "create_assignment",
    "get_assignment",
    "list_assignments",
    "update_assignment",
    "delete_assignment",
    # orchestration —submissions
    "create_submission",
    "get_submission",
    "list_submissions",
    "list_submissions_for_student",
    "update_submission",
    # orchestration —documents
    "create_document",
    "get_document",
    "list_documents",
    # orchestration —grades + bundle
    "upsert_grade",
    "get_grade",
    "get_submission_bundle",
    "find_submission_v2",
]
