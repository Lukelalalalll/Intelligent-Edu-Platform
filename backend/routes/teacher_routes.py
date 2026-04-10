import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from backend.core.database import db
from backend.core.security import get_current_user, can_access_course as _centralized_can_access_course
from backend.services.grading_service import (
    load_courses, find_submission, find_submission_v2, load_annotations, render_annotations_to_pdf,
    get_source_pdf_web_path,
    # v2 helpers
    list_course_sections, list_assignments, list_submissions,
    get_submission_bundle, list_enrollments, get_grade,
    get_course_section, get_assignment, get_submission as get_submission_v2,
)

teacher_router = APIRouter(prefix="/api/teacher", tags=["TeacherMailbox"])
PERMISSION_DENIED = "Permission denied"


class TeacherCopilotBriefSchema(BaseModel):
    course_section_id: str | None = None
    include_actions: bool = True
    horizon_days: int = 7


def _is_admin(user: dict) -> bool:
    return user.get("role") == "admin"


def _is_teacher(user: dict) -> bool:
    return user.get("role") == "teacher"


def _assert_teacher_or_admin(user: dict) -> None:
    if not (_is_admin(user) or _is_teacher(user)):
        raise HTTPException(status_code=403, detail=PERMISSION_DENIED)


def _can_access_course(course: dict, user: dict) -> bool:
    return _centralized_can_access_course(course, user)


async def _assert_v2_course_access(course_section_id: str, user: dict) -> dict:
    """Verify the current teacher/admin can access the given v2 course section.
    Returns the course dict or raises 403/404."""
    if _is_admin(user):
        course = await get_course_section(course_section_id)
        if not course:
            raise HTTPException(status_code=404, detail="Course section not found")
        return course

    user_id = str(user.get("_id") or user.get("id") or "")
    course = await get_course_section(course_section_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course section not found")

    # Owner?
    if str(course.get("ownerTeacherId") or "") == user_id:
        return course

    # Enrolled as teacher/ta?
    enrollments = await list_enrollments(course_section_id=course_section_id, user_id=user_id)
    for e in enrollments:
        if e.get("roleInCourse") in ("teacher", "ta"):
            return course

    raise HTTPException(status_code=403, detail=f"{PERMISSION_DENIED}: you are not assigned to this course")


@teacher_router.get("/courses")
async def get_courses(current_user: dict = Depends(get_current_user)):
    _assert_teacher_or_admin(current_user)
    data = await load_courses()
    if _is_admin(current_user):
        return data

    filtered = [c for c in data.get("courses", []) if _can_access_course(c, current_user)]
    return {"courses": filtered}


@teacher_router.get("/assignments/{course_id}")
async def get_assignments(course_id: str, current_user: dict = Depends(get_current_user)):
    _assert_teacher_or_admin(current_user)
    data = await load_courses()
    for course in data.get("courses", []):
        cid = course.get("courseId") or course.get("id")
        if cid == course_id:
            if not _can_access_course(course, current_user):
                raise HTTPException(status_code=403, detail=PERMISSION_DENIED)
            return {"assignments": course.get("assignments", [])}
    raise HTTPException(status_code=404, detail="Course not found")


@teacher_router.get("/submissions/{assignment_id}")
async def get_submissions(assignment_id: str, current_user: dict = Depends(get_current_user)):
    _assert_teacher_or_admin(current_user)
    data = await load_courses()
    for course in data.get("courses", []):
        if not _can_access_course(course, current_user):
            continue
        for assignment in course.get("assignments", []):
            if assignment.get("id") == assignment_id:
                return {"submissions": assignment.get("submissions", [])}
    raise HTTPException(status_code=404, detail="Assignment not found")


@teacher_router.get("/submission/{submission_id}")
async def get_submission(submission_id: str, current_user: dict = Depends(get_current_user)):
    _assert_teacher_or_admin(current_user)
    # Try v2 flat collections first, fall back to legacy nested lookup
    course, assignment, submission = await find_submission_v2(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    if course and not _can_access_course(course, current_user):
        raise HTTPException(status_code=403, detail=PERMISSION_DENIED)

    annotation_store = await load_annotations(submission_id)
    annotations = annotation_store.get("annotations", [])
    rendered_pdf_path = render_annotations_to_pdf(submission_id, submission, annotations)
    submission = {
        **submission,
        "pdfPath": rendered_pdf_path or get_source_pdf_web_path(submission),
    }

    return {
        "course": {
            "id": course.get("id"),
            "courseId": course.get("courseId") or course.get("id"),
            "name": course.get("name"),
            "teacherId": course.get("teacherId"),
            "degreeLevel": course.get("degreeLevel"),
            "semester": course.get("semester"),
            "studentList": course.get("studentList", []),
        },
        "assignment": assignment,
        "submission": submission,
        "annotations": annotation_store,
    }


# ═══════════════════════════════════════════════════════════════════════
# v2 — Flat model endpoints
# ═══════════════════════════════════════════════════════════════════════

@teacher_router.get("/v2/courses")
async def get_courses_v2(current_user: dict = Depends(get_current_user)):
    """Return course sections the current teacher is enrolled in or owns."""
    _assert_teacher_or_admin(current_user)
    user_id = str(current_user.get("_id") or current_user.get("id") or "")

    if _is_admin(current_user):
        courses = await list_course_sections()
    else:
        enrollments = await list_enrollments(user_id=user_id)
        section_ids = [e["courseSectionId"] for e in enrollments if e.get("roleInCourse") in ("teacher", "ta")]
        # Also include courses where ownerTeacherId matches
        owned = await list_course_sections({"ownerTeacherId": user_id})
        owned_ids = {c["id"] for c in owned}
        section_ids_set = set(section_ids) | owned_ids
        if section_ids_set:
            from bson import ObjectId as OID
            courses = await list_course_sections({
                "$or": [
                    {"_id": {"$in": [OID(sid) for sid in section_ids_set if sid]}},
                    {"ownerTeacherId": user_id},
                ]
            })
        else:
            courses = await list_course_sections({"ownerTeacherId": user_id})

    # Enrich with counts
    for c in courses:
        assignments = await list_assignments(c["id"])
        total_subs = 0
        graded_subs = 0
        for a in assignments:
            subs = await list_submissions(a["id"])
            total_subs += len(subs)
            graded_subs += sum(1 for s in subs if s.get("status") == "graded")
        c["assignmentCount"] = len(assignments)
        c["totalSubmissions"] = total_subs
        c["gradedSubmissions"] = graded_subs

    return {"courses": courses}


@teacher_router.get("/v2/assignments/{course_section_id}")
async def get_assignments_v2(course_section_id: str, current_user: dict = Depends(get_current_user)):
    _assert_teacher_or_admin(current_user)
    await _assert_v2_course_access(course_section_id, current_user)
    assignments = await list_assignments(course_section_id)

    # Enrich each assignment with submission stats
    for a in assignments:
        subs = await list_submissions(a["id"])
        a["submissionCount"] = len(subs)
        a["gradedCount"] = sum(1 for s in subs if s.get("status") == "graded")
        a["pendingCount"] = sum(1 for s in subs if s.get("status") == "pending")

    return {"assignments": assignments}


@teacher_router.get("/v2/submissions/{assignment_id}")
async def get_submissions_v2(assignment_id: str, current_user: dict = Depends(get_current_user)):
    _assert_teacher_or_admin(current_user)
    from backend.core.database import db as _db

    # Validate assignment exists and teacher has access to its course
    assignment = await get_assignment(assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if assignment.get("courseSectionId"):
        await _assert_v2_course_access(assignment["courseSectionId"], current_user)

    subs = await list_submissions(assignment_id)

    # Enrich with student info and grade
    for s in subs:
        student_id = s.get("studentId", "")
        if student_id:
            try:
                from bson import ObjectId as OID
                student = await _db.users.find_one({"_id": OID(student_id)})
                if student:
                    s["studentName"] = student.get("username", "")
                    s["studentEmail"] = student.get("email", "")
            except Exception:
                pass
        grade = await get_grade(s["id"])
        if grade:
            s["totalScore"] = grade.get("totalScore")
            s["gradingStatus"] = grade.get("gradingStatus")

    return {"submissions": subs}


@teacher_router.get("/v2/submission/{submission_id}")
async def get_submission_v2(submission_id: str, current_user: dict = Depends(get_current_user)):
    _assert_teacher_or_admin(current_user)
    bundle = await get_submission_bundle(submission_id)
    if not bundle or not bundle.get("submission"):
        raise HTTPException(status_code=404, detail="Submission not found")

    # Verify course access
    course = bundle.get("course")
    if course and course.get("id"):
        await _assert_v2_course_access(course["id"], current_user)

    return bundle


@teacher_router.post("/copilot/brief")
async def create_teacher_copilot_brief(
    payload: TeacherCopilotBriefSchema,
    current_user: dict = Depends(get_current_user),
):
    _assert_teacher_or_admin(current_user)
    teacher_id = str(current_user.get("_id") or current_user.get("id") or "")
    now = datetime.now(timezone.utc)
    brief_id = uuid.uuid4().hex[:14]

    if payload.course_section_id:
        courses = [await _assert_v2_course_access(payload.course_section_id, current_user)]
    else:
        c = await get_courses_v2(current_user)
        courses = c.get("courses", [])[:8]

    course_summaries = []
    total_pending = 0
    total_graded = 0

    for course in courses:
        assignments = await list_assignments(course["id"])
        pending = 0
        graded = 0
        for assignment in assignments:
            subs = await list_submissions(assignment["id"])
            pending += sum(1 for s in subs if s.get("status") == "pending")
            graded += sum(1 for s in subs if s.get("status") == "graded")
        total_pending += pending
        total_graded += graded
        course_summaries.append(
            {
                "course_section_id": course.get("id"),
                "course_name": course.get("courseName") or course.get("name") or course.get("courseCode") or "Untitled Course",
                "assignment_count": len(assignments),
                "pending_submissions": pending,
                "graded_submissions": graded,
                "risk_level": "high" if pending >= 12 else ("medium" if pending >= 5 else "low"),
            }
        )

    actions = []
    if payload.include_actions:
        actions = [
            "Prioritize grading for courses marked high risk.",
            "Post a short clarification message for the most common mistakes.",
            "Prepare one in-class formative question for each upcoming session.",
        ]

    doc = {
        "brief_id": brief_id,
        "teacher_id": teacher_id,
        "course_section_id": payload.course_section_id,
        "horizon_days": payload.horizon_days,
        "summary": {
            "total_courses": len(course_summaries),
            "total_pending_submissions": total_pending,
            "total_graded_submissions": total_graded,
        },
        "courses": course_summaries,
        "actions": actions,
        "created_at": now,
        "updated_at": now,
    }
    await db.teacher_copilot_briefs.insert_one(doc)

    return {
        "success": True,
        "brief_id": brief_id,
        "summary": doc["summary"],
        "courses": course_summaries,
        "actions": actions,
    }


@teacher_router.get("/copilot/brief/{brief_id}")
async def get_teacher_copilot_brief(brief_id: str, current_user: dict = Depends(get_current_user)):
    _assert_teacher_or_admin(current_user)
    teacher_id = str(current_user.get("_id") or current_user.get("id") or "")
    query = {"brief_id": brief_id}
    if not _is_admin(current_user):
        query["teacher_id"] = teacher_id

    doc = await db.teacher_copilot_briefs.find_one(query, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Copilot brief not found")
    for key in ("created_at", "updated_at"):
        if hasattr(doc.get(key), "isoformat"):
            doc[key] = doc[key].isoformat()
    return {"success": True, "brief": doc}


@teacher_router.get("/copilot/agenda")
async def get_teacher_copilot_agenda(
    course_section_id: str,
    current_user: dict = Depends(get_current_user),
):
    _assert_teacher_or_admin(current_user)
    course = await _assert_v2_course_access(course_section_id, current_user)
    assignments = await list_assignments(course_section_id)
    agenda = []
    for idx, assignment in enumerate(assignments[:5], start=1):
        agenda.append(
            {
                "rank": idx,
                "assignment_id": assignment.get("id"),
                "title": assignment.get("title") or f"Assignment {idx}",
                "action": "Review pending submissions and release a rubric reminder.",
            }
        )
    return {
        "success": True,
        "course_section_id": course_section_id,
        "course_name": course.get("courseName") or course.get("name") or course.get("courseCode") or "Course",
        "agenda": agenda,
    }
