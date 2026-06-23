"""v2 flat-model course, enrollment, and assignment admin endpoints."""
from __future__ import annotations

from fastapi import Depends, HTTPException

from backend.core.security import get_admin_user
from backend.repositories import user_repo
from backend.services.grading_service import (
    create_course_section, list_course_sections, update_course_section, delete_course_section,
    enroll_user, unenroll_user, list_enrollments,
    create_assignment as v2_create_assignment, update_assignment as v2_update_assignment,
    delete_assignment as v2_delete_assignment, list_assignments as v2_list_assignments,
)
from fastapi import APIRouter
router = APIRouter()


@router.get("/v2/courses")
async def list_courses_v2(admin: dict = Depends(get_admin_user)):
    courses = await list_course_sections()
    for c in courses:
        enrolls = await list_enrollments(course_section_id=c["id"])
        c["enrollmentCount"] = len(enrolls)
        c["teacherCount"] = sum(1 for e in enrolls if e.get("roleInCourse") == "teacher")
        c["studentCount"] = sum(1 for e in enrolls if e.get("roleInCourse") == "student")
    return {"courses": courses}


@router.post("/v2/courses")
async def create_course_v2(req: dict, admin: dict = Depends(get_admin_user)):
    from backend.schemas import CourseSectionSchema
    data = CourseSectionSchema(**req).model_dump()
    course = await create_course_section(data)

    # Auto-enroll owner teacher
    if data.get("ownerTeacherId"):
        await enroll_user(course["id"], data["ownerTeacherId"], "teacher")

    return {"message": "Course created", "course": course}


@router.put("/v2/courses/{section_id}")
async def update_course_v2(section_id: str, req: dict, admin: dict = Depends(get_admin_user)):
    from backend.schemas import CourseSectionSchema
    data = CourseSectionSchema(**req).model_dump()
    course = await update_course_section(section_id, data)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return {"message": "Course updated", "course": course}


@router.delete("/v2/courses/{section_id}")
async def delete_course_v2(section_id: str, admin: dict = Depends(get_admin_user)):
    deleted = await delete_course_section(section_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Course not found")
    return {"message": "Course deleted"}


@router.get("/v2/courses/{section_id}/enrollments")
async def list_course_enrollments(section_id: str, admin: dict = Depends(get_admin_user)):
    enrolls = await list_enrollments(course_section_id=section_id)
    # Enrich with user info
    for e in enrolls:
        user = await user_repo.find_by_id(e["userId"])
        if user:
            e["username"] = user.get("username", "")
            e["email"] = user.get("email", "")
    return {"enrollments": enrolls}


@router.post("/v2/courses/{section_id}/enrollments")
async def enroll_user_v2(section_id: str, req: dict, admin: dict = Depends(get_admin_user)):
    user_id = req.get("userId", "").strip()
    role = req.get("roleInCourse", "student")
    if not user_id:
        raise HTTPException(status_code=400, detail="userId is required")
    enrollment = await enroll_user(section_id, user_id, role)
    return {"message": "User enrolled", "enrollment": enrollment}


@router.delete("/v2/courses/{section_id}/enrollments/{user_id}")
async def unenroll_user_v2(section_id: str, user_id: str, admin: dict = Depends(get_admin_user)):
    removed = await unenroll_user(section_id, user_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    return {"message": "User unenrolled"}


@router.get("/v2/courses/{section_id}/assignments")
async def list_assignments_v2(section_id: str, admin: dict = Depends(get_admin_user)):
    assignments = await v2_list_assignments(section_id)
    return {"assignments": assignments}


@router.post("/v2/courses/{section_id}/assignments")
async def create_assignment_v2(section_id: str, req: dict, admin: dict = Depends(get_admin_user)):
    from backend.schemas import AssignmentSchema
    data = AssignmentSchema(courseSectionId=section_id, **{k: v for k, v in req.items() if k != "courseSectionId"}).model_dump()
    assignment = await v2_create_assignment(data)
    return {"message": "Assignment created", "assignment": assignment}


@router.put("/v2/assignments/{assignment_id}")
async def update_assignment_v2(assignment_id: str, req: dict, admin: dict = Depends(get_admin_user)):
    assignment = await v2_update_assignment(assignment_id, req)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return {"message": "Assignment updated", "assignment": assignment}


@router.delete("/v2/assignments/{assignment_id}")
async def delete_assignment_v2(assignment_id: str, admin: dict = Depends(get_admin_user)):
    deleted = await v2_delete_assignment(assignment_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return {"message": "Assignment deleted"}


@router.get("/v2/relations/overview")
async def get_relations_overview_v2(admin: dict = Depends(get_admin_user)):
    """Comprehensive relations overview using v2 flat model."""
    users = await db.users.find().to_list(2000)
    teachers = [
        {"id": str(u["_id"]), "username": u.get("username", ""), "email": u.get("email", "")}
        for u in users if u.get("role") == "teacher"
    ]
    students = [
        {"id": str(u["_id"]), "username": u.get("username", ""), "email": u.get("email", "")}
        for u in users if u.get("role") == "student"
    ]

    courses = await list_course_sections()
    for c in courses:
        enrolls = await list_enrollments(course_section_id=c["id"])
        c["enrollments"] = enrolls

    return {"teachers": teachers, "students": students, "courses": courses}
