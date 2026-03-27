# backend/routes/auth_routes.py
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from werkzeug.security import generate_password_hash, check_password_hash
from backend.core.database import db
from backend.core.security import create_access_token, get_current_user
from backend.schemas import AuthSchema, UpdateProfileSchema
from backend.config import Config
from backend.routes.grading_helpers import load_courses

auth_router = APIRouter(prefix="/api", tags=["Auth"])


def _current_semester_label() -> str:
    now = datetime.now()
    if now.month <= 5:
        term = "Spring"
    elif now.month <= 8:
        term = "Summer"
    else:
        term = "Fall"
    return f"{now.year}-{term}"


def _course_summary(course: dict) -> dict:
    assignments = course.get("assignments", [])
    return {
        "id": course.get("id") or course.get("courseId"),
        "courseId": course.get("courseId") or course.get("id"),
        "name": course.get("name", ""),
        "semester": course.get("semester", ""),
        "degreeLevel": course.get("degreeLevel", ""),
        "teacherId": course.get("teacherId", ""),
        "assignmentCount": len(assignments),
        "studentCount": len(course.get("studentList", [])),
    }


def _teacher_owns_course(user: dict, course: dict) -> bool:
    user_id = str(user.get("id") or user.get("_id") or "")
    teacher_id = str(course.get("teacherId") or "")
    if user_id and teacher_id and user_id == teacher_id:
        return True

    teacher_course_ids = {str(cid).strip() for cid in (user.get("teacherCourseIds") or []) if str(cid).strip()}
    course_id = str(course.get("courseId") or course.get("id") or "").strip()
    if course_id and course_id in teacher_course_ids:
        return True

    legacy_teacher = str(course.get("teacher") or "").strip().lower()
    username = str(user.get("username") or "").strip().lower()
    return bool(legacy_teacher and username and legacy_teacher == username)


def _student_enrolled_in_course(user: dict, course: dict) -> bool:
    student_id_candidates = {
        str(v).strip()
        for v in [user.get("studentId"), user.get("id"), user.get("_id")]
        if v is not None and str(v).strip()
    }
    username = str(user.get("username") or "").strip().lower()
    email = str(user.get("email") or "").strip().lower()

    for item in course.get("studentList", []):
        if isinstance(item, str) and item.strip() in student_id_candidates:
            return True
        if isinstance(item, dict):
            sid = str(item.get("studentId") or "").strip()
            if sid and sid in student_id_candidates:
                return True
            if username and str(item.get("username") or "").strip().lower() == username:
                return True
            if email and str(item.get("email") or "").strip().lower() == email:
                return True

    for assignment in course.get("assignments", []):
        for submission in assignment.get("submissions", []):
            sid = str(submission.get("studentId") or "").strip()
            if sid and sid in student_id_candidates:
                return True
            if username and str(submission.get("studentName") or "").strip().lower() == username:
                return True

    return False


@auth_router.post("/register")
async def register(req: AuthSchema):
    if await db.users.find_one({"username": req.username}):
        raise HTTPException(status_code=409, detail="Username already exists")

    user_doc = {
        "username": req.username,
        "email": req.email,
        "password_hash": generate_password_hash(req.password),
        "role": "student",
        "teacherCourseIds": [],
    }
    await db.users.insert_one(user_doc)
    return {"message": "Account created successfully"}


@auth_router.post("/login")
async def login(req: AuthSchema, response: Response):
    user = await db.users.find_one({"username": req.username})
    if not user or not check_password_hash(user['password_hash'], req.password):
        raise HTTPException(status_code=401, detail="Wrong username or password")

    access_token = create_access_token(data={"sub": str(user["_id"])})

    # 设置 HttpOnly Cookie
    response.set_cookie(
        key=Config.JWT_ACCESS_COOKIE_NAME, value=access_token,
        httponly=True, samesite="lax"
    )

    return {
        "message": "Login successful",
        "user": {"id": str(user["_id"]), "username": user["username"], "email": user.get("email"),
                 "role": user.get("role", "student"),
                 "teacherCourseIds": user.get("teacherCourseIds", [])}
    }


@auth_router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(Config.JWT_ACCESS_COOKIE_NAME)
    return {"message": "Logout successful"}


@auth_router.get("/session")
async def get_session(current_user: dict = Depends(get_current_user)):
    return {
        "user": {
            "id": str(current_user.get("_id") or current_user.get("id") or ""),
            "username": current_user.get("username"),
            "email": current_user.get("email"),
            "role": current_user.get("role", "student"),
            "teacherCourseIds": current_user.get("teacherCourseIds", []),
        }
    }


@auth_router.post("/profile/update")
async def update_profile(req: UpdateProfileSchema, current_user: dict = Depends(get_current_user)):
    update_data = {}
    if req.username: update_data["username"] = req.username
    if req.email: update_data["email"] = req.email
    if req.password: update_data["password_hash"] = generate_password_hash(req.password)
    if req.teacherCourseIds is not None:
        update_data["teacherCourseIds"] = req.teacherCourseIds

    if update_data:
        await db.users.update_one({"_id": current_user["_id"]}, {"$set": update_data})
    return {"message": "Profile updated successfully"}


@auth_router.get("/profile/courses")
async def get_profile_courses(current_user: dict = Depends(get_current_user)):
    all_courses = (await load_courses()).get("courses", [])
    role = current_user.get("role", "student")

    if role == "teacher":
        semester = _current_semester_label()
        teaching_courses = [c for c in all_courses if _teacher_owns_course(current_user, c)]
        current_semester_courses = [c for c in teaching_courses if str(c.get("semester") or "") == semester]
        selected = current_semester_courses if current_semester_courses else teaching_courses
        return {
            "role": role,
            "semester": semester,
            "courses": [_course_summary(c) for c in selected],
        }

    if role == "student":
        enrolled = [c for c in all_courses if _student_enrolled_in_course(current_user, c)]
        return {
            "role": role,
            "semester": _current_semester_label(),
            "courses": [_course_summary(c) for c in enrolled],
        }

    return {
        "role": role,
        "semester": _current_semester_label(),
        "courses": [],
    }