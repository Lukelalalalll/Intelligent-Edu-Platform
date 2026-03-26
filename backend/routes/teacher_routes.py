from fastapi import APIRouter, Depends, HTTPException
from backend.core.security import get_current_user
from backend.routes.grading_helpers import load_courses, find_submission, load_annotations, render_annotations_to_pdf, get_source_pdf_web_path

teacher_router = APIRouter(prefix="/api/teacher", tags=["TeacherMailbox"])


def _is_admin(user: dict) -> bool:
    return user.get("role") == "admin"


def _is_teacher(user: dict) -> bool:
    return user.get("role") == "teacher"


def _assert_teacher_or_admin(user: dict) -> None:
    if not (_is_admin(user) or _is_teacher(user)):
        raise HTTPException(status_code=403, detail="Permission denied")


def _can_access_course(course: dict, user: dict) -> bool:
    if _is_admin(user):
        return True
    user_id = str(user.get("id") or user.get("_id") or "")
    if str(course.get("teacherId") or "") == user_id:
        return True

    bound_courses = {str(cid).strip() for cid in (user.get("teacherCourseIds") or []) if str(cid).strip()}
    course_id = str(course.get("courseId") or course.get("id") or "").strip()
    if course_id in bound_courses:
        return True

    legacy_teacher = str(course.get("teacher") or "").strip().lower()
    username = str(user.get("username") or "").strip().lower()
    return bool(legacy_teacher and username and legacy_teacher == username)


@teacher_router.get("/courses")
def get_courses(current_user: dict = Depends(get_current_user)):
    _assert_teacher_or_admin(current_user)
    data = load_courses()
    if _is_admin(current_user):
        return data

    filtered = [c for c in data.get("courses", []) if _can_access_course(c, current_user)]
    return {"courses": filtered}


@teacher_router.get("/assignments/{course_id}")
def get_assignments(course_id: str, current_user: dict = Depends(get_current_user)):
    _assert_teacher_or_admin(current_user)
    data = load_courses()
    for course in data.get("courses", []):
        cid = course.get("courseId") or course.get("id")
        if cid == course_id:
            if not _can_access_course(course, current_user):
                raise HTTPException(status_code=403, detail="Permission denied")
            return {"assignments": course.get("assignments", [])}
    raise HTTPException(status_code=404, detail="Course not found")


@teacher_router.get("/submissions/{assignment_id}")
def get_submissions(assignment_id: str, current_user: dict = Depends(get_current_user)):
    _assert_teacher_or_admin(current_user)
    data = load_courses()
    for course in data.get("courses", []):
        if not _can_access_course(course, current_user):
            continue
        for assignment in course.get("assignments", []):
            if assignment.get("id") == assignment_id:
                return {"submissions": assignment.get("submissions", [])}
    raise HTTPException(status_code=404, detail="Assignment not found")


@teacher_router.get("/submission/{submission_id}")
def get_submission(submission_id: str, current_user: dict = Depends(get_current_user)):
    _assert_teacher_or_admin(current_user)
    course, assignment, submission = find_submission(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    if not _can_access_course(course, current_user):
        raise HTTPException(status_code=403, detail="Permission denied")

    annotation_store = load_annotations(submission_id)
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
