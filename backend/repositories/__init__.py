"""Repository layer — domain model data-access functions.

Provides focused modules for each collection group. All functions are
async and operate directly on the Motor ``db`` instance exposed by
``backend.core.database``.
"""
from .course_section_repo import (
    create_course_section,
    get_course_section,
    list_course_sections,
    update_course_section,
    delete_course_section,
)
from .enrollment_repo import (
    enroll_user,
    unenroll_user,
    list_enrollments,
)
from .assignment_repo import (
    create_assignment,
    get_assignment,
    list_assignments,
    update_assignment,
    delete_assignment,
)
from .submission_repo import (
    create_submission,
    get_submission,
    list_submissions,
    list_submissions_for_student,
    update_submission,
)
from .document_repo import (
    create_document,
    get_document,
    list_documents,
)
from .grade_repo import (
    upsert_grade,
    get_grade,
)

__all__ = [
    # course sections
    "create_course_section",
    "get_course_section",
    "list_course_sections",
    "update_course_section",
    "delete_course_section",
    # enrollments
    "enroll_user",
    "unenroll_user",
    "list_enrollments",
    # assignments
    "create_assignment",
    "get_assignment",
    "list_assignments",
    "update_assignment",
    "delete_assignment",
    # submissions
    "create_submission",
    "get_submission",
    "list_submissions",
    "list_submissions_for_student",
    "update_submission",
    # documents
    "create_document",
    "get_document",
    "list_documents",
    # grades
    "upsert_grade",
    "get_grade",
]
