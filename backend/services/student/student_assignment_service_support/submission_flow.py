from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from backend.repositories.document_repo import set_document_owner
from backend.services.auth.security_audit import log_security_event
from backend.services.files.file_asset_service import register_file_asset
from backend.services.grading_service import (
    create_document,
    create_submission,
    get_assignment,
)

from .common import MAX_SUBMISSION_FILE_SIZE, save_submission_file, user_id_from_user
from .legacy_homework import load_legacy_homework, upsert_legacy_submission
from .membership import ensure_course_membership


async def submit_student_assignment(
    *,
    assignment_id: str,
    filename: str,
    content: bytes,
    mime_type: str,
    current_user: dict[str, Any],
) -> dict[str, Any]:
    user_id = user_id_from_user(current_user)
    username = current_user.get("username", "student")

    assignment = await get_assignment(assignment_id)
    legacy_homework = None if assignment else await load_legacy_homework(assignment_id)
    if not assignment and not legacy_homework:
        raise HTTPException(status_code=404, detail="Assignment not found")

    course_section_id = (
        assignment.get("courseSectionId", "")
        if assignment
        else str((legacy_homework or {}).get("course_id", ""))
    )
    await ensure_course_membership(user_id=user_id, course_section_id=course_section_id)

    if not filename:
        raise HTTPException(status_code=400, detail="No file provided")
    if len(content) > MAX_SUBMISSION_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 50MB)")

    file_path, storage_key, checksum = save_submission_file(
        user_id=user_id,
        assignment_id=assignment_id,
        filename=filename,
        content=content,
    )

    if legacy_homework:
        legacy_submission = await upsert_legacy_submission(
            assignment_id=assignment_id,
            user_id=user_id,
            file_path=file_path,
            filename=filename,
        )
        return {
            "message": "Submission uploaded successfully",
            "submission": legacy_submission,
            "document": None,
        }

    document = await create_document(
        {
            "ownerType": "submission",
            "ownerId": "",
            "storageKey": storage_key,
            "filename": filename,
            "mimeType": mime_type or "application/pdf",
            "pageCount": 0,
            "checksum": checksum,
            "sourceType": "original",
        }
    )

    submission = await create_submission(
        {
            "assignmentId": assignment_id,
            "studentId": user_id,
            "studentName": username,
            "status": "pending",
            "attemptNo": 1,
            "latestDocumentId": document["id"],
            "pdfPath": storage_key,
        }
    )

    if not await set_document_owner(document.get("id", ""), submission["id"]):
        raise HTTPException(status_code=500, detail="Invalid document id returned for submission")

    try:
        await register_file_asset(
            file_type="submission_pdf",
            storage_path=storage_key,
            size=len(content),
            owner_type="submission_document",
            owner_id=str(document["id"]),
            created_by=user_id,
            filename=filename,
            mime_type=mime_type or "application/pdf",
            checksum=checksum,
            course_id=str(course_section_id or ""),
            scope="submission",
            user_id=user_id,
            metadata={"assignmentId": assignment_id, "submissionId": submission["id"]},
        )
    except Exception as exc:
        log_security_event(
            level="warning",
            request_id="n/a",
            user_id=user_id,
            endpoint="/api/v2/student/submit",
            action="file_asset_register_failed",
            detail=str(exc)[:240],
            extra={
                "assignment_id": assignment_id,
                "submission_id": submission.get("id", ""),
            },
        )

    return {
        "message": "Submission uploaded successfully",
        "submission": submission,
        "document": document,
    }


__all__ = ["submit_student_assignment"]
