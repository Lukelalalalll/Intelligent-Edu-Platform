from jose import JWTError
from fastapi import Request, HTTPException, Depends
from cachetools import TTLCache
from backend.config import Config
from backend.repositories import session_repo
from backend.repositories import user_repo
from backend.services.auth_session_service import decode_access_token, get_active_session_for_access

# In-memory user cache — avoids hitting MongoDB on every authenticated request.
# TTL=30s keeps it fresh enough; maxsize prevents unbounded growth.
_user_cache: TTLCache = TTLCache(maxsize=512, ttl=30)


def invalidate_user_cache(user_id: str) -> None:
    _user_cache.pop(str(user_id or ""), None)


async def get_current_user(request: Request):
    token = request.cookies.get(Config.JWT_ACCESS_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Please log in first")
    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
        session_id = payload.get("sid")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        if not session_id:
            raise HTTPException(status_code=401, detail="Invalid session")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token expired")

    user = _user_cache.get(user_id)
    if user is None:
        user = await user_repo.find_by_id(user_id)
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        user["id"] = str(user["_id"])
        _user_cache[user_id] = user
    else:
        user = dict(user)

    if str(user.get("status") or "active").lower() != "active":
        raise HTTPException(status_code=403, detail="Account is not active")

    if int(payload.get("token_version") or 0) != int(user.get("token_version") or 0):
        raise HTTPException(status_code=401, detail="Session is no longer valid")

    session = await get_active_session_for_access(
        session_id=str(session_id),
        user_id=str(user["_id"]),
        token_version=int(payload.get("token_version") or 0),
    )
    user["session_id"] = str(session.get("session_id") or "")
    request.state.current_access_payload = payload
    request.state.current_session = session
    request.state.current_user = user

    return user


async def get_current_session(request: Request, current_user: dict = Depends(get_current_user)):
    session = getattr(request.state, "current_session", None)
    if session is not None:
        return session
    session_id = str(current_user.get("session_id") or "")
    if not session_id:
        raise HTTPException(status_code=401, detail="Session is no longer valid")
    session = await session_repo.find_by_session_id(session_id)
    if not session or session.get("revoked_at"):
        raise HTTPException(status_code=401, detail="Session is no longer valid")
    request.state.current_session = session
    return session


async def require_step_up(
    current_user: dict = Depends(get_current_user),
    session_doc: dict = Depends(get_current_session),
):
    if not bool((current_user.get("mfa") or {}).get("enabled")):
        return session_doc
    expires_at = session_doc.get("step_up_expires_at")
    if not expires_at:
        raise HTTPException(status_code=403, detail="Step-up authentication required")
    from backend.services.password_security_service import utcnow

    if expires_at <= utcnow():
        raise HTTPException(status_code=403, detail="Step-up authentication required")
    return session_doc


def get_admin_user(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Permission denied")
    return current_user


# ── Shared authorization helpers ──────────────────────────────────────

def teacher_owns_course(user: dict, course: dict) -> bool:
    user_id = str(user.get("id") or user.get("_id") or "")
    # Check all teacher id fields — v2 uses ownerTeacherId, legacy uses teacherId
    for field in ("teacherId", "ownerTeacherId"):
        tid = str(course.get(field) or "")
        if user_id and tid and user_id == tid:
            return True

    teacher_course_ids = {str(cid).strip() for cid in (user.get("teacherCourseIds") or []) if str(cid).strip()}
    course_id = str(course.get("courseId") or course.get("id") or "").strip()
    course_code = str(course.get("courseCode") or "").strip()
    if teacher_course_ids:
        if course_id and course_id in teacher_course_ids:
            return True
        if course_code and course_code in teacher_course_ids:
            return True

    legacy_teacher = str(course.get("teacher") or "").strip().lower()
    username = str(user.get("username") or "").strip().lower()
    return bool(legacy_teacher and username and legacy_teacher == username)


def student_enrolled_in_course(user: dict, course: dict) -> bool:  # noqa: C901  # NOSONAR
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
