# backend/routes/auth_routes.py
import os
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile, File, Form
from slowapi import Limiter
from slowapi.util import get_remote_address
from werkzeug.security import generate_password_hash, check_password_hash
from backend.core.database import db
from backend.core.security import create_access_token, get_current_user, teacher_owns_course, student_enrolled_in_course
from backend.schemas import AuthSchema, UpdateProfileSchema, TeacherPreferencesSchema, ResetPasswordSchema
from backend.config import Config
from backend.services.grading_service import (
    load_courses,
    # v2
    list_enrollments, list_course_sections, get_course_section,
    list_assignments, get_assignment, list_submissions_for_student, create_submission,
    create_document,
)

limiter = Limiter(key_func=get_remote_address)
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
    return teacher_owns_course(user, course)


def _student_enrolled_in_course(user: dict, course: dict) -> bool:
    return student_enrolled_in_course(user, course)


@auth_router.post("/register")
@limiter.limit("10/minute")
async def register(request: Request, req: AuthSchema):
    # Password strength validation
    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if not any(c.isdigit() for c in req.password):
        raise HTTPException(status_code=400, detail="Password must contain at least one digit")

    if await db.users.find_one({"username": req.username}):
        raise HTTPException(status_code=409, detail="Username already exists")

    # Determine role via staff code
    role = "student"
    if req.staff_code:
        from datetime import datetime, timezone
        code = req.staff_code.strip().upper()
        code_doc = await db.staff_codes.find_one({"code": code, "is_used": False})
        if not code_doc:
            raise HTTPException(status_code=400, detail="Invalid or already-used staff code")
        if code_doc["expires_at"].replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Staff code has expired")
        role = "teacher"

    user_doc = {
        "username": req.username,
        "email": req.email,
        "password_hash": generate_password_hash(req.password),
        "role": role,
        "teacherCourseIds": [],
    }
    result = await db.users.insert_one(user_doc)

    # Mark code as used after successful registration
    if req.staff_code and role == "teacher":
        from datetime import datetime, timezone
        await db.staff_codes.update_one(
            {"code": req.staff_code.strip().upper()},
            {"$set": {"is_used": True, "used_by": str(result.inserted_id), "used_at": datetime.now(timezone.utc)}}
        )

    return {"message": "Account created successfully"}


@auth_router.post("/reset-password")
@limiter.limit("5/minute")
async def reset_password(request: Request, req: ResetPasswordSchema):
    """Reset a user's password after verifying username + email match."""
    if len(req.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if not any(c.isdigit() for c in req.new_password):
        raise HTTPException(status_code=400, detail="Password must contain at least one digit")

    user = await db.users.find_one({"username": req.username})
    # Use constant-time-like response to avoid user enumeration
    if not user or (user.get("email") or "").lower() != req.email.strip().lower():
        raise HTTPException(status_code=400, detail="Username and email do not match any account")

    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"password_hash": generate_password_hash(req.new_password)}}
    )
    return {"message": "Password reset successfully"}


@auth_router.post("/login")
@limiter.limit("10/minute")
async def login(request: Request, req: AuthSchema, response: Response):
    user = await db.users.find_one({"username": req.username})
    if not user or not check_password_hash(user['password_hash'], req.password):
        raise HTTPException(status_code=401, detail="Wrong username or password")

    access_token = create_access_token(data={"sub": str(user["_id"])})

    # 设置 HttpOnly Cookie
    is_production = os.getenv('ENV', 'development').lower() in ('production', 'prod')
    response.set_cookie(
        key=Config.JWT_ACCESS_COOKIE_NAME, value=access_token,
        httponly=True, samesite="lax",
        secure=is_production,
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


# ─── Teacher Preferences ──────────────────────────────────────────────

DEFAULT_TEACHER_PREFERENCES = {
    "feedback_style": "concise",
    "feedback_language": "English",
    "auto_rag": True,
    "default_rag_top_k": 4,
    "email_auto_classify": True,
    "email_suggest_reply": True,
}


@auth_router.get("/profile/preferences")
async def get_preferences(current_user: dict = Depends(get_current_user)):
    """Get teacher AI preferences."""
    user_doc = await db.users.find_one({"_id": current_user["_id"]})
    prefs = (user_doc or {}).get("preferences", DEFAULT_TEACHER_PREFERENCES)
    return {"preferences": {**DEFAULT_TEACHER_PREFERENCES, **prefs}}


@auth_router.post("/profile/preferences")
async def update_preferences(
    payload: TeacherPreferencesSchema,
    current_user: dict = Depends(get_current_user),
):
    """Update teacher AI preferences."""
    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"preferences": payload.model_dump()}},
    )
    return {"message": "Preferences updated", "preferences": payload.model_dump()}


# ═══════════════════════════════════════════════════════════════════════
# v2 — Student-facing endpoints
# ═══════════════════════════════════════════════════════════════════════

@auth_router.get("/v2/profile/courses")
async def get_profile_courses_v2(current_user: dict = Depends(get_current_user)):
    """Return courses for the current user using v2 enrollment model."""
    user_id = str(current_user.get("_id") or current_user.get("id") or "")
    role = current_user.get("role", "student")

    enrollments = await list_enrollments(user_id=user_id)

    if not enrollments:
        # Fall back to legacy lookup
        return await get_profile_courses(current_user)

    from bson import ObjectId as OID
    section_ids = [e["courseSectionId"] for e in enrollments]
    courses = []
    for sid in section_ids:
        try:
            course = await get_course_section(sid)
            if course:
                assignments = await list_assignments(sid)
                course["assignmentCount"] = len(assignments)
                # Get enrollment count for this section
                section_enrollments = await list_enrollments(course_section_id=sid)
                course["studentCount"] = sum(1 for e in section_enrollments if e.get("roleInCourse") == "student")
                # Include the role for this user
                user_enrollment = next((e for e in enrollments if e["courseSectionId"] == sid), None)
                course["roleInCourse"] = user_enrollment.get("roleInCourse", "student") if user_enrollment else "student"
                courses.append(course)
        except Exception:
            pass

    return {
        "role": role,
        "semester": _current_semester_label(),
        "courses": courses,
    }


@auth_router.get("/v2/student/assignments/{course_section_id}")
async def get_student_assignments(course_section_id: str, current_user: dict = Depends(get_current_user)):
    """Return assignments for a course with the student's submission status."""
    user_id = str(current_user.get("_id") or current_user.get("id") or "")
    assignments = await list_assignments(course_section_id)
    student_subs = await list_submissions_for_student(user_id)
    sub_by_assignment = {}
    for s in student_subs:
        sub_by_assignment[s.get("assignmentId", "")] = s

    result = []
    for a in assignments:
        a_id = a.get("id", "")
        sub = sub_by_assignment.get(a_id)
        result.append({
            **a,
            "submission": sub,
            "hasSubmitted": sub is not None,
            "status": sub.get("status", "not_submitted") if sub else "not_submitted",
            "totalScore": sub.get("totalScore") if sub else None,
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

    # --- Validation: assignment must exist ---
    assignment = await get_assignment(assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # --- Validation: student must be enrolled in the course ---
    course_section_id = assignment.get("courseSectionId", "")
    if course_section_id:
        enrollments = await list_enrollments(course_section_id=course_section_id, user_id=user_id)
        if not enrollments:
            raise HTTPException(status_code=403, detail="You are not enrolled in this course")

    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    # Read file content
    content = await file.read()
    if len(content) > 50 * 1024 * 1024:  # 50MB limit
        raise HTTPException(status_code=400, detail="File too large (max 50MB)")

    # Save to disk
    upload_dir = Path(__file__).resolve().parents[1] / "uploads" / "submissions"
    upload_dir.mkdir(parents=True, exist_ok=True)

    file_hash = hashlib.sha256(content).hexdigest()[:16]
    safe_filename = f"{user_id}_{assignment_id}_{file_hash}_{file.filename}"
    file_path = upload_dir / safe_filename
    file_path.write_bytes(content)

    storage_key = f"uploads/submissions/{safe_filename}"

    # Create document record
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

    return {
        "message": "Submission uploaded successfully",
        "submission": submission,
        "document": doc_record,
    }