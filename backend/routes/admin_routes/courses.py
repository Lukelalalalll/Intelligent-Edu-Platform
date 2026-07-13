"""v1 JSON-based course & assignment CRUD + relations overview."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from backend.core.security import get_admin_user
from backend.repositories import user_repo
from backend.schemas import AdminCourseSchema, AdminCourseStudentSchema, AdminAssignmentSchema
from .router import _find_assignment, _find_course, _is_object_id, _load_courses_payload, _save_courses_payload

router = APIRouter()


@router.get("/relations/overview")
async def get_relations_overview(admin: dict = Depends(get_admin_user)):
    users = await db.users.find().to_list(2000)
    teachers = [
        {
            "id": str(u.get("_id")),
            "username": u.get("username", ""),
            "email": u.get("email", ""),
            "teacherCourseIds": u.get("teacherCourseIds", []),
        }
        for u in users if u.get("role") == "teacher"
    ]
    students = [
        {
            "id": str(u.get("_id")),
            "username": u.get("username", ""),
            "email": u.get("email", ""),
            "studentId": str(u.get("studentId") or u.get("id") or u.get("_id")),
        }
        for u in users if u.get("role") == "student"
    ]

    payload = await _load_courses_payload()
    return {
        "teachers": teachers,
        "students": students,
        "courses": payload.get("courses", []),
    }


@router.post("/courses")
async def create_course(req: AdminCourseSchema, admin: dict = Depends(get_admin_user)):
    payload = await _load_courses_payload()
    courses = payload.get("courses", [])
    course_id = req.courseId.strip()
    if _find_course(courses, course_id):
        raise HTTPException(status_code=400, detail="Course already exists")

    new_course = {
        "id": course_id,
        "courseId": course_id,
        "name": req.name.strip(),
        "teacherId": req.teacherId.strip(),
        "degreeLevel": req.degreeLevel,
        "semester": req.semester.strip(),
        "studentList": [{"studentId": sid.strip()} for sid in req.studentIds if sid.strip()],
        "assignments": [],
    }
    courses.append(new_course)
    await _save_courses_payload(payload)

    if req.teacherId.strip() and _is_object_id(req.teacherId.strip()):
        await user_repo.add_teacher_course(req.teacherId.strip(), course_id)

    return {"message": "Course created", "course": new_course}


@router.put("/courses/{course_id}")
async def update_course(course_id: str, req: AdminCourseSchema, admin: dict = Depends(get_admin_user)):
    payload = await _load_courses_payload()
    courses = payload.get("courses", [])
    course = _find_course(courses, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    old_teacher_id = str(course.get("teacherId") or "").strip()
    new_teacher_id = req.teacherId.strip()

    course["name"] = req.name.strip()
    course["teacherId"] = new_teacher_id
    course["degreeLevel"] = req.degreeLevel
    course["semester"] = req.semester.strip()
    course["studentList"] = [{"studentId": sid.strip()} for sid in req.studentIds if sid.strip()]

    await _save_courses_payload(payload)

    if old_teacher_id and old_teacher_id != new_teacher_id and _is_object_id(old_teacher_id):
        await user_repo.remove_teacher_course(old_teacher_id, course_id)
    if new_teacher_id and _is_object_id(new_teacher_id):
        await user_repo.add_teacher_course(new_teacher_id, course_id)

    return {"message": "Course updated", "course": course}


@router.delete("/courses/{course_id}")
async def delete_course(course_id: str, admin: dict = Depends(get_admin_user)):
    payload = await _load_courses_payload()
    courses = payload.get("courses", [])
    course = _find_course(courses, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    payload["courses"] = [c for c in courses if str(c.get("courseId") or c.get("id") or "") != course_id]
    await _save_courses_payload(payload)

    await user_repo.remove_teacher_course_from_all(course_id)
    return {"message": "Course deleted"}


@router.post("/courses/{course_id}/students")
async def add_course_student(course_id: str, req: AdminCourseStudentSchema, admin: dict = Depends(get_admin_user)):
    payload = await _load_courses_payload()
    course = _find_course(payload.get("courses", []), course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    existing = {str(item.get("studentId") or "").strip() for item in course.get("studentList", []) if isinstance(item, dict)}
    student_id = req.studentId.strip()
    if student_id and student_id not in existing:
        course.setdefault("studentList", []).append({"studentId": student_id})
        await _save_courses_payload(payload)

    return {"message": "Student added", "course": course}


@router.delete("/courses/{course_id}/students/{student_id}")
async def remove_course_student(course_id: str, student_id: str, admin: dict = Depends(get_admin_user)):
    payload = await _load_courses_payload()
    course = _find_course(payload.get("courses", []), course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    course["studentList"] = [
        item for item in course.get("studentList", [])
        if str((item or {}).get("studentId") or "").strip() != student_id
    ]
    await _save_courses_payload(payload)
    return {"message": "Student removed", "course": course}


@router.post("/courses/{course_id}/assignments")
async def create_assignment(course_id: str, req: AdminAssignmentSchema, admin: dict = Depends(get_admin_user)):
    payload = await _load_courses_payload()
    course = _find_course(payload.get("courses", []), course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    if _find_assignment(course, req.id.strip()):
        raise HTTPException(status_code=400, detail="Assignment already exists")

    assignment = {
        "id": req.id.strip(),
        "title": req.title.strip(),
        "description": req.description.strip(),
        "dueDate": req.dueDate.strip(),
        "rubric": req.rubric,
        "submissions": [],
    }
    course.setdefault("assignments", []).append(assignment)
    await _save_courses_payload(payload)
    return {"message": "Assignment created", "assignment": assignment}


@router.put("/courses/{course_id}/assignments/{assignment_id}")
async def update_assignment(course_id: str, assignment_id: str, req: AdminAssignmentSchema, admin: dict = Depends(get_admin_user)):
    payload = await _load_courses_payload()
    course = _find_course(payload.get("courses", []), course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    assignment = _find_assignment(course, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    assignment["title"] = req.title.strip()
    assignment["description"] = req.description.strip()
    assignment["dueDate"] = req.dueDate.strip()
    assignment["rubric"] = req.rubric

    await _save_courses_payload(payload)
    return {"message": "Assignment updated", "assignment": assignment}


@router.delete("/courses/{course_id}/assignments/{assignment_id}")
async def delete_assignment(course_id: str, assignment_id: str, admin: dict = Depends(get_admin_user)):
    payload = await _load_courses_payload()
    course = _find_course(payload.get("courses", []), course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    course["assignments"] = [
        item for item in course.get("assignments", [])
        if str(item.get("id") or "").strip() != assignment_id
    ]
    await _save_courses_payload(payload)
    return {"message": "Assignment deleted"}
