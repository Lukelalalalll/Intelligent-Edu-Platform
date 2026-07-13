"""Service-level orchestration for the flat grading domain model."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

from bson import ObjectId

from backend.config import Config
from backend.core.database import _get_client, db
from backend.core.settings import SENSITIVE_ENVS
from backend.repositories import assignment_repo, course_section_repo, document_repo, enrollment_repo
from backend.repositories import grade_repo, submission_repo
from backend.repositories._helpers import coerce_object_id

from ._shared import _oid
from .annotation_service import load_annotations, render_annotations_to_pdf, get_source_pdf_web_path
from .course_service import find_submission

logger = logging.getLogger(__name__)
_COLLECT_ALL_PAGE_SIZE = 100


def _transactions_required() -> bool:
    return str(Config.ENV or "").lower() in SENSITIVE_ENVS


@asynccontextmanager
async def _mongo_transaction():
    try:
        client = _get_client()
        session = await client.start_session()
    except Exception as exc:
        if _transactions_required():
            raise RuntimeError(
                "MongoDB transactions require a replica set in staging/production."
            ) from exc
        yield None
        return

    async with session:
        async with session.start_transaction():
            yield session


async def create_course_section(data: dict[str, Any]) -> dict[str, Any]:
    return await course_section_repo.create_course_section(data)


async def get_course_section(section_id: str) -> dict[str, Any] | None:
    return await course_section_repo.get_course_section(section_id)


async def list_course_sections(
    filter_query: dict[str, Any] | None = None,
    *,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    return await course_section_repo.list_course_sections(
        filter_query,
        page=page,
        page_size=page_size,
    )


async def _collect_all_pages(fetch_page) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    page = 1
    while True:
        result = await fetch_page(page=page, page_size=_COLLECT_ALL_PAGE_SIZE)
        batch = list(result.get("items") or [])
        items.extend(batch)
        total = int(result.get("total", len(items)))
        if not batch or len(items) >= total:
            return items
        page += 1


async def list_all_course_sections(
    filter_query: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    return await _collect_all_pages(
        lambda *, page, page_size: list_course_sections(
            filter_query,
            page=page,
            page_size=page_size,
        )
    )


async def update_course_section(section_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
    return await course_section_repo.update_course_section(section_id, data)


async def delete_course_section(section_id: str) -> bool:
    async with _mongo_transaction() as session:
        section = await course_section_repo.get_course_section(section_id, session=session)
        if not section:
            return False

        assignment_ids: list[str] = []
        async for assignment in db.assignments.find(
            {"courseSectionId": section_id},
            {"_id": 1},
            session=session,
        ):
            assignment_ids.append(str(assignment.get("_id")))

        submission_ids: list[str] = []
        document_ids: list[ObjectId] = []
        if assignment_ids:
            async for submission in db.submissions.find(
                {"assignmentId": {"$in": assignment_ids}},
                {"_id": 1, "latestDocumentId": 1},
                session=session,
            ):
                submission_ids.append(str(submission.get("_id")))
                latest_document_id = coerce_object_id(submission.get("latestDocumentId"))
                if latest_document_id is not None:
                    document_ids.append(latest_document_id)

        assignment_object_ids = [
            oid for oid in (coerce_object_id(value) for value in assignment_ids) if oid is not None
        ]
        await db.enrollments.delete_many({"courseSectionId": section_id}, session=session)
        if assignment_object_ids:
            await db.assignments.delete_many(
                {"_id": {"$in": assignment_object_ids}},
                session=session,
            )
        if submission_ids:
            submission_object_ids = [
                oid for oid in (coerce_object_id(value) for value in submission_ids) if oid is not None
            ]
            await db.grades.delete_many({"submissionId": {"$in": submission_ids}}, session=session)
            await db.annotations.delete_many({"submissionId": {"$in": submission_ids}}, session=session)
            await db.documents.delete_many(
                {
                    "$or": [
                        {"ownerId": {"$in": submission_ids}},
                        {"_id": {"$in": document_ids}} if document_ids else {"_id": {"$exists": False}},
                    ]
                },
                session=session,
            )
            if submission_object_ids:
                await db.submissions.delete_many(
                    {"_id": {"$in": submission_object_ids}},
                    session=session,
                )
        return await course_section_repo.delete_course_section(section_id, session=session)


async def enroll_user(course_section_id: str, user_id: str, role: str = "student") -> dict[str, Any]:
    return await enrollment_repo.enroll_user(course_section_id, user_id, role)


async def unenroll_user(course_section_id: str, user_id: str) -> bool:
    return await enrollment_repo.unenroll_user(course_section_id, user_id)


async def list_enrollments(
    course_section_id: str | None = None,
    user_id: str | None = None,
    *,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    return await enrollment_repo.list_enrollments(
        course_section_id=course_section_id,
        user_id=user_id,
        page=page,
        page_size=page_size,
    )


async def list_all_enrollments(
    course_section_id: str | None = None,
    user_id: str | None = None,
) -> list[dict[str, Any]]:
    return await _collect_all_pages(
        lambda *, page, page_size: list_enrollments(
            course_section_id=course_section_id,
            user_id=user_id,
            page=page,
            page_size=page_size,
        )
    )


async def create_assignment(data: dict[str, Any]) -> dict[str, Any]:
    return await assignment_repo.create_assignment(data)


async def get_assignment(assignment_id: str) -> dict[str, Any] | None:
    return await assignment_repo.get_assignment(assignment_id)


async def list_assignments(
    course_section_id: str,
    *,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    return await assignment_repo.list_assignments(
        course_section_id,
        page=page,
        page_size=page_size,
    )


async def list_all_assignments(course_section_id: str) -> list[dict[str, Any]]:
    return await _collect_all_pages(
        lambda *, page, page_size: list_assignments(
            course_section_id,
            page=page,
            page_size=page_size,
        )
    )


async def update_assignment(assignment_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
    return await assignment_repo.update_assignment(assignment_id, data)


async def delete_assignment(assignment_id: str) -> bool:
    async with _mongo_transaction() as session:
        assignment = await assignment_repo.get_assignment(assignment_id, session=session)
        if not assignment:
            return False

        submission_ids: list[str] = []
        document_ids: list[ObjectId] = []
        async for submission in db.submissions.find(
            {"assignmentId": assignment_id},
            {"_id": 1, "latestDocumentId": 1},
            session=session,
        ):
            submission_ids.append(str(submission.get("_id")))
            latest_document_id = coerce_object_id(submission.get("latestDocumentId"))
            if latest_document_id is not None:
                document_ids.append(latest_document_id)

        if submission_ids:
            submission_object_ids = [
                oid for oid in (coerce_object_id(value) for value in submission_ids) if oid is not None
            ]
            await db.grades.delete_many({"submissionId": {"$in": submission_ids}}, session=session)
            await db.annotations.delete_many({"submissionId": {"$in": submission_ids}}, session=session)
            await db.documents.delete_many(
                {
                    "$or": [
                        {"ownerId": {"$in": submission_ids}},
                        {"_id": {"$in": document_ids}} if document_ids else {"_id": {"$exists": False}},
                    ]
                },
                session=session,
            )
            if submission_object_ids:
                await db.submissions.delete_many(
                    {"_id": {"$in": submission_object_ids}},
                    session=session,
                )

        return await assignment_repo.delete_assignment(assignment_id, session=session)


async def create_submission(data: dict[str, Any]) -> dict[str, Any]:
    return await submission_repo.create_submission(data)


async def get_submission(submission_id: str) -> dict[str, Any] | None:
    return await submission_repo.get_submission(submission_id)


async def list_submissions(
    assignment_id: str,
    *,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    return await submission_repo.list_submissions(
        assignment_id,
        page=page,
        page_size=page_size,
    )


async def list_all_submissions(assignment_id: str) -> list[dict[str, Any]]:
    return await _collect_all_pages(
        lambda *, page, page_size: list_submissions(
            assignment_id,
            page=page,
            page_size=page_size,
        )
    )


async def list_submissions_for_student(
    student_id: str,
    *,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    return await submission_repo.list_submissions_for_student(
        student_id,
        page=page,
        page_size=page_size,
    )


async def list_all_submissions_for_student(student_id: str) -> list[dict[str, Any]]:
    return await _collect_all_pages(
        lambda *, page, page_size: list_submissions_for_student(
            student_id,
            page=page,
            page_size=page_size,
        )
    )


async def update_submission(submission_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
    return await submission_repo.update_submission(submission_id, data)


async def create_document(data: dict[str, Any]) -> dict[str, Any]:
    return await document_repo.create_document(data)


async def get_document(document_id: str) -> dict[str, Any] | None:
    return await document_repo.get_document(document_id)


async def list_documents(
    owner_id: str,
    source_type: str | None = None,
    *,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    return await document_repo.list_documents(
        owner_id,
        source_type=source_type,
        page=page,
        page_size=page_size,
    )


async def upsert_grade(submission_id: str, grader_id: str, data: dict[str, Any]) -> dict[str, Any]:
    submission_oid = coerce_object_id(submission_id)
    if submission_oid is None:
        raise ValueError("Invalid submission id")

    async with _mongo_transaction() as session:
        grade = await grade_repo.upsert_grade(
            submission_id,
            grader_id,
            data,
            session=session,
        )
        status = "graded" if data.get("gradingStatus") == "final" else "grading"
        await db.submissions.update_one(
            {"_id": submission_oid},
            {"$set": {"status": status, "latestGradeId": grade["id"]}},
            session=session,
        )
        return grade


async def get_grade(submission_id: str) -> dict[str, Any] | None:
    return await grade_repo.get_grade(submission_id)


async def get_submission_bundle(submission_id: str) -> dict[str, Any] | None:
    submission = await get_submission(submission_id)
    if not submission:
        return None

    assignment = await get_assignment(submission["assignmentId"]) if submission.get("assignmentId") else None
    course = None
    if assignment and assignment.get("courseSectionId"):
        course = await get_course_section(assignment["courseSectionId"])

    annotation_store = await load_annotations(submission_id)
    grade = await get_grade(submission_id)

    doc_record = None
    if submission.get("latestDocumentId"):
        doc_record = await get_document(submission["latestDocumentId"])

    if not submission.get("pdfPath") and doc_record and doc_record.get("storageKey"):
        submission = {**submission, "pdfPath": doc_record["storageKey"]}

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


async def find_submission_v2(
    submission_id: str,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None, dict[str, Any] | None]:
    sub = await get_submission(submission_id)

    if sub:
        assignment = await get_assignment(sub["assignmentId"]) if sub.get("assignmentId") else None
        course = None
        if assignment and assignment.get("courseSectionId"):
            course = await get_course_section(assignment["courseSectionId"])
        return course, assignment, sub

    return await find_submission(submission_id)
