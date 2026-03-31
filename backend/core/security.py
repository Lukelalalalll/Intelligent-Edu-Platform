from datetime import datetime, timedelta
from jose import jwt, JWTError
from fastapi import Request, HTTPException, Depends
from backend.config import Config
from backend.core.database import db
from bson import ObjectId


def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + Config.JWT_ACCESS_TOKEN_EXPIRES
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, Config.JWT_SECRET_KEY, algorithm="HS256")


async def get_current_user(request: Request):
    token = request.cookies.get(Config.JWT_ACCESS_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Please log in first")
    try:
        payload = jwt.decode(token, Config.JWT_SECRET_KEY, algorithms=["HS256"])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token expired")

    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")

    user["id"] = str(user["_id"])  # 将 ObjectId 转为字符串
    return user


async def get_admin_user(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Permission denied")
    return current_user


# ── Shared authorization helpers ──────────────────────────────────────

def teacher_owns_course(user: dict, course: dict) -> bool:
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


def student_enrolled_in_course(user: dict, course: dict) -> bool:
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


def can_access_course(course: dict, user: dict) -> bool:
    if user.get("role") == "admin":
        return True
    if user.get("role") != "teacher":
        return False
    return teacher_owns_course(user, course)