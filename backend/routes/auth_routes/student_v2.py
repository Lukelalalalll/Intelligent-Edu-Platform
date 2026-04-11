"""V2 student-facing endpoints: courses, assignments, submit, my-submissions."""
from __future__ import annotations

import logging

from fastapi import Depends, HTTPException, UploadFile, File, Form

from backend.core.database import db
from backend.core.security import get_current_user
from backend.services.grading_service import (
    list_enrollments, list_assignments, get_course_section,
    get_assignment, list_submissions_for_student, create_submission,
    create_document, get_grade,
)
from backend.services.file_asset_service import register_file_asset
from backend.services.security_audit import log_security_event
from .router import auth_router, _current_semester_label
from .profile import get_profile_courses

logger = logging.getLogger(__name__)


@auth_router.get("/v2/profile/courses")
async def get_profile_courses_v2(current_user: dict = Depends(get_current_user)):
    """Return courses for the current user using v2 enrollment model."""
    user_id = str(current_user.get("_id") or current_user.get("id") or "")
    role = current_user.get("role", "student")

    enrollments = await list_enrollments(user_id=user_id)

    if not enrollments:
        # Fall back to legacy lookup, but enrich with v2 homework/assignment counts
        legacy_result = await get_profile_courses(current_user)
        # Resolve legacy courseCode → v2 course_section to count homeworks
        for c in legacy_result.get("courses", []):
            code = c.get("courseId") or c.get("id")
            section = await db.course_sections.find_one({"courseCode": code})
            if section:
                sid = str(section["_id"])
                c["courseSectionId"] = sid
                v2_assignments = await list_assignments(sid)
                # Only count legacy homeworks NOT already represented by a v2 assignment
                v2_hw_ids = {a.get("homeworkId") for a in v2_assignments if a.get("homeworkId")}
                hw_cursor = db["homeworks"].find({"course_id": sid})
                extra_hw = 0
                async for hw in hw_cursor:
                    if str(hw["_id"]) not in v2_hw_ids:
                        extra_hw += 1
                total = len(v2_assignments) + extra_hw
                if total > c.get("assignmentCount", 0):
                    c["assignmentCount"] = total
        return legacy_result

    from bson import ObjectId as OID
    section_ids = [e["courseSectionId"] for e in enrollments]
    courses = []
    for sid in section_ids:
        try:
            course = await get_course_section(sid)
            if course:
                assignments = await list_assignments(sid)
                # Count legacy homeworks not already represented by a v2 assignment
                v2_hw_ids = {a.get("homeworkId") for a in assignments if a.get("homeworkId")}
                hw_cursor = db["homeworks"].find({"course_id": sid})
                extra_hw = 0
                async for hw in hw_cursor:
                    if str(hw["_id"]) not in v2_hw_ids:
                        extra_hw += 1
                course["assignmentCount"] = len(assignments) + extra_hw
                # Get enrollment count for this section
                section_enrollments = await list_enrollments(course_section_id=sid)
                course["studentCount"] = sum(1 for e in section_enrollments if e.get("roleInCourse") == "student")
                # Include the role for this user
                user_enrollment = next((e for e in enrollments if e["courseSectionId"] == sid), None)
                course["roleInCourse"] = user_enrollment.get("roleInCourse", "student") if user_enrollment else "student"
                courses.append(course)
        except Exception as exc:
            log_security_event(
                level="warning",
                request_id="n/a",
                user_id=user_id,
                endpoint="/api/v2/profile/courses",
                action="course_section_resolve_failed",
                detail=str(exc)[:240],
                extra={"course_section_id": sid},
            )

    return {
        "role": role,
        "semester": _current_semester_label(),
        "courses": courses,
    }


@auth_router.get("/v2/student/assignments/{course_section_id}")
async def get_student_assignments(course_section_id: str, current_user: dict = Depends(get_current_user)):
    """Return assignments for a course with the student's submission status."""
    user_id = str(current_user.get("_id") or current_user.get("id") or "")

    # Resolve legacy courseCode (e.g. "ELEC4848") to v2 course_section ObjectId
    from bson import ObjectId as _OID
    resolved_sid = course_section_id
    if not _OID.is_valid(course_section_id):
        section = await db.course_sections.find_one({"courseCode": course_section_id})
        if section:
            resolved_sid = str(section["_id"])

    # --- v2 flat assignments ---
    assignments = await list_assignments(resolved_sid)
    student_subs = await list_submissions_for_student(user_id)
    sub_by_assignment = {s.get("assignmentId", ""): s for s in student_subs}

    result = []
    # Track which homework IDs are already represented by a v2 assignment
    v2_homework_ids: set = set()
    for a in assignments:
        a_id = a.get("id", "")
        sub = sub_by_assignment.get(a_id)
        sub_id = sub.get("id", "") if sub else ""
        grade = await get_grade(sub_id) if sub_id else None
        is_graded = grade is not None and grade.get("gradingStatus") in ("draft", "final")
        result.append({
            **a,
            "submission": sub,
            "hasSubmitted": sub is not None,
            "status": "graded" if is_graded else (sub.get("status", "not_submitted") if sub else "not_submitted"),
            "totalScore": grade.get("totalScore") if grade else None,
            "grade": {
                "totalScore": grade.get("totalScore"),
                "rubricScores": grade.get("rubricScores", {}),
                "overallFeedback": grade.get("overallFeedback", ""),
                "gradingStatus": grade.get("gradingStatus", ""),
            } if grade else None,
        })
        if a.get("homeworkId"):
            v2_homework_ids.add(a["homeworkId"])

    # --- Legacy homeworks fallback (records only in homeworks collection) ---
    hw_subs_cursor = db["homework_submissions"].find({"student_id": user_id})
    hw_sub_by_id: dict = {}
    async for s in hw_subs_cursor:
        hw_sub_by_id[str(s["homework_id"])] = s

    async for hw in db["homeworks"].find({"course_id": resolved_sid}).sort("deadline", 1):
        hw_id = str(hw["_id"])
        if hw_id in v2_homework_ids:
            continue  # already represented by a v2 assignment above
        sub = hw_sub_by_id.get(hw_id)
        deadline_str = str(hw.get("deadline", ""))
        result.append({
            "id": hw_id,
            "title": hw.get("title", ""),
            "description": hw.get("description", ""),
            "dueDate": deadline_str,
            "dueAt": deadline_str,
            "requiredFileTypes": hw.get("required_file_types", []),
            "required_file_types": hw.get("required_file_types", []),
            "hasSubmitted": sub is not None,
            "status": sub.get("status", "not_submitted") if sub else "not_submitted",
            "totalScore": None,
            "submission": {
                "pdfPath": sub.get("file_name", ""),
                "submittedAt": str(sub.get("submitted_at", ""))[:10],
            } if sub else None,
            "_legacyHomework": True,
        })

    return {"assignments": result}


@auth_router.post("/v2/student/submit")
async def student_submit(
    assignment_id: str = Form(..., alias="assignmentId"),
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Student uploads a PDF submission."""
    import hashlib
    from pathlib import Path

    user_id = str(current_user.get("_id") or current_user.get("id") or "")
    username = current_user.get("username", "student")

    # --- Validation: assignment must exist (v2 collection or legacy homeworks fallback) ---
    from bson import ObjectId as _OID
    assignment = await get_assignment(assignment_id)
    legacy_homework = None
    if not assignment:
        # Try legacy homeworks collection
        if _OID.is_valid(assignment_id):
            legacy_homework = await db["homeworks"].find_one({"_id": _OID(assignment_id)})
        if not legacy_homework:
            raise HTTPException(status_code=404, detail="Assignment not found")

    # --- Validation: student must be enrolled in the course ---
    if assignment:
        course_section_id = assignment.get("courseSectionId", "")
    elif legacy_homework:
        course_section_id = legacy_homework.get("course_id", "")
    else:
        course_section_id = ""

    if course_section_id:
        # Check v2 enrollments first
        v2_enrollments = await list_enrollments(course_section_id=course_section_id, user_id=user_id)
        if not v2_enrollments:
            # Fallback: check legacy courses.studentList via courseCode
            section = await db.course_sections.find_one({"_id": _OID(course_section_id)}) if _OID.is_valid(course_section_id) else None
            code = section.get("courseCode", "") if section else ""
            legacy_enrolled = False
            if code:
                legacy_course = await db.courses.find_one({"id": code})
                if legacy_course:
                    student_ids = [
                        str(s.get("studentId", "")).strip()
                        for s in legacy_course.get("studentList", [])
                        if isinstance(s, dict)
                    ]
                    legacy_enrolled = user_id in student_ids
            if not legacy_enrolled:
                raise HTTPException(status_code=403, detail="You are not enrolled in this course")

    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    # Read file content
    content = await file.read()
    if len(content) > 50 * 1024 * 1024:  # 50MB limit
        raise HTTPException(status_code=400, detail="File too large (max 50MB)")

    # Save to disk
    upload_dir = Path(__file__).resolve().parents[2] / "uploads" / "submissions"
    upload_dir.mkdir(parents=True, exist_ok=True)

    file_hash = hashlib.sha256(content).hexdigest()[:16]
    safe_filename = f"{user_id}_{assignment_id}_{file_hash}_{file.filename}"
    file_path = upload_dir / safe_filename
    file_path.write_bytes(content)

    storage_key = f"uploads/submissions/{safe_filename}"

    # Legacy homework path: save to homework_submissions and return early
    if legacy_homework:
        import datetime as _dt
        existing = await db["homework_submissions"].find_one(
            {"homework_id": assignment_id, "student_id": user_id}
        )
        if existing:
            await db["homework_submissions"].update_one(
                {"_id": existing["_id"]},
                {"$set": {
                    "file_path": str(file_path),
                    "file_name": file.filename,
                    "status": "submitted",
                    "submitted_at": _dt.datetime.utcnow(),
                }},
            )
            legacy_sub = {"id": str(existing["_id"]), "status": "submitted"}
        else:
            legacy_doc = {
                "homework_id": assignment_id,
                "student_id": user_id,
                "file_path": str(file_path),
                "file_name": file.filename,
                "status": "submitted",
                "submitted_at": _dt.datetime.utcnow(),
            }
            ins = await db["homework_submissions"].insert_one(legacy_doc)
            legacy_sub = {"id": str(ins.inserted_id), "status": "submitted"}
        return {
            "message": "Submission uploaded successfully",
            "submission": legacy_sub,
            "document": None,
        }

    # Create document record (v2 path)
    doc_record = await create_document({
        "ownerType": "submission",
        "ownerId": "",  # Will be updated after submission is created
        "storageKey": storage_key,
        "filename": file.filename,
        "mimeType": file.content_type or "application/pdf",
        "pageCount": 0,
        "checksum": hashlib.sha256(content).hexdigest(),
        "sourceType": "original",
    })

    # Create submission
    submission = await create_submission({
        "assignmentId": assignment_id,
        "studentId": user_id,
        "studentName": username,
        "status": "pending",
        "attemptNo": 1,
        "latestDocumentId": doc_record["id"],
        "pdfPath": storage_key,
    })

    # Update document ownerId
    from backend.core.database import db as _db
    from bson import ObjectId as OID
    await _db.documents.update_one(
        {"_id": OID(doc_record["id"])},
        {"$set": {"ownerId": submission["id"]}},
    )

    try:
        await register_file_asset(
            file_type="submission_pdf",
            storage_path=storage_key,
            size=len(content),
            owner_type="submission_document",
            owner_id=str(doc_record["id"]),
            created_by=user_id,
            filename=file.filename,
            mime_type=file.content_type or "application/pdf",
            checksum=hashlib.sha256(content).hexdigest(),
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
            extra={"assignment_id": assignment_id, "submission_id": submission.get("id", "")},
        )

    return {
        "message": "Submission uploaded successfully",
        "submission": submission,
        "document": doc_record,
    }


@auth_router.get("/v2/student/my-submissions")
async def get_my_submissions(current_user: dict = Depends(get_current_user)):
    """Return all v2 submissions for the current student, with grade/feedback enriched."""
    user_id = str(current_user.get("_id") or current_user.get("id") or "")
    subs = await list_submissions_for_student(user_id)

    result = []
    for sub in subs:
        sub_id = sub.get("id", "")
        assignment_id = sub.get("assignmentId", "")

        # Enrich with assignment title/description
        assignment = await get_assignment(assignment_id) if assignment_id else None

        # Enrich with grade/feedback
        grade = await get_grade(sub_id) if sub_id else None

        result.append({
            "id": sub_id,
            "assignmentId": assignment_id,
            "assignmentTitle": (assignment or {}).get("title", ""),
            "status": sub.get("status", "pending"),
            "submittedAt": sub.get("createdAt", ""),
            "pdfPath": sub.get("pdfPath", ""),
            "grade": {
                "totalScore": (grade or {}).get("totalScore"),
                "rubricScores": (grade or {}).get("rubricScores", {}),
                "overallFeedback": (grade or {}).get("overallFeedback", ""),
                "gradingStatus": (grade or {}).get("gradingStatus", ""),
            } if grade else None,
        })

    return {"submissions": result}
