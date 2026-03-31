import re

from fastapi import APIRouter, Depends, HTTPException, Query
from bson.objectid import ObjectId
from werkzeug.security import generate_password_hash
from backend.core.database import db
from backend.core.security import get_admin_user
from backend.schemas import (
    AuthSchema,
    UpdateProfileSchema,
    AdminCourseSchema,
    AdminCourseStudentSchema,
    AdminAssignmentSchema,
    AdminDbDocumentSchema,
)
from backend.routes.grading_helpers import (
    load_courses, save_courses, normalize_courses_data,
    # v2
    create_course_section, list_course_sections, update_course_section, delete_course_section,
    enroll_user, unenroll_user, list_enrollments,
    create_assignment as v2_create_assignment, update_assignment as v2_update_assignment,
    delete_assignment as v2_delete_assignment, list_assignments as v2_list_assignments,
)

admin_router = APIRouter(prefix="/api/admin", tags=["Admin"])


@admin_router.get("/users")
async def get_users(admin: dict = Depends(get_admin_user)):
    users = await db.users.find().to_list(1000)
    return [{"id": str(u["_id"]), "username": u["username"], "email": u["email"], "role": u.get("role", "student"),
             "teacherCourseIds": u.get("teacherCourseIds", [])} for
            u in users]


@admin_router.post("/add_user")
async def add_user(req: AuthSchema, admin: dict = Depends(get_admin_user)):
    if await db.users.find_one({"username": req.username}):
        raise HTTPException(status_code=400, detail="Username already taken")
    user_doc = {
        "username": req.username, "email": req.email,
        "password_hash": generate_password_hash(req.password or '123456'),
        "role": req.role,
        "teacherCourseIds": req.teacherCourseIds or []
    }
    await db.users.insert_one(user_doc)
    return {"message": "User created successfully"}


@admin_router.put("/update_user/{user_id}")
async def update_user(user_id: str, req: UpdateProfileSchema, admin: dict = Depends(get_admin_user)):
    if str(admin["_id"]) == user_id and req.role != 'admin':
        raise HTTPException(status_code=400, detail="Cannot remove your own admin status")

    update_data = {k: v for k, v in req.dict(exclude_unset=True).items() if k != "password"}
    if req.password: update_data["password_hash"] = generate_password_hash(req.password)

    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": update_data})
    return {"message": "User updated successfully"}


@admin_router.delete("/delete_user/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(get_admin_user)):
    if str(admin["_id"]) == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    await db.users.delete_one({"_id": ObjectId(user_id)})
    return {"message": "User deleted successfully"}


async def _load_courses_payload() -> dict:
    return normalize_courses_data(await load_courses())


async def _save_courses_payload(payload: dict) -> None:
    await save_courses(normalize_courses_data(payload))


def _find_course(courses: list[dict], course_id: str) -> dict | None:
    for course in courses:
        cid = str(course.get("courseId") or course.get("id") or "").strip()
        if cid == course_id:
            return course
    return None


def _find_assignment(course: dict, assignment_id: str) -> dict | None:
    for assignment in course.get("assignments", []):
        if str(assignment.get("id") or "").strip() == assignment_id:
            return assignment
    return None


def _is_object_id(value: str) -> bool:
    try:
        ObjectId(value)
        return True
    except Exception:
        return False


def _serialize_mongo_value(value):
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, list):
        return [_serialize_mongo_value(item) for item in value]
    if isinstance(value, dict):
        return {k: _serialize_mongo_value(v) for k, v in value.items()}
    return value


def _validate_collection_name(name: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_\-]{1,64}", name or ""):
        raise HTTPException(status_code=400, detail="Invalid collection name")
    return name


# Collections that cannot be modified via the DB console (write-protect critical data)
DB_CONSOLE_READONLY_COLLECTIONS = {"users"}
# Collections that cannot be listed or accessed via console at all
DB_CONSOLE_BLOCKED_COLLECTIONS = {"system.profile", "system.version"}


def _check_write_access(collection_name: str) -> None:
    """Block write operations on protected collections via DB console."""
    if collection_name in DB_CONSOLE_READONLY_COLLECTIONS:
        raise HTTPException(
            status_code=403,
            detail=f"Collection '{collection_name}' is read-only via DB console. Use dedicated admin endpoints.",
        )


@admin_router.get("/relations/overview")
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


@admin_router.post("/courses")
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
        await db.users.update_one(
            {"_id": ObjectId(req.teacherId.strip())},
            {"$addToSet": {"teacherCourseIds": course_id}},
        )

    return {"message": "Course created", "course": new_course}


@admin_router.put("/courses/{course_id}")
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
        await db.users.update_one(
            {"_id": ObjectId(old_teacher_id)},
            {"$pull": {"teacherCourseIds": course_id}},
        )
    if new_teacher_id and _is_object_id(new_teacher_id):
        await db.users.update_one(
            {"_id": ObjectId(new_teacher_id)},
            {"$addToSet": {"teacherCourseIds": course_id}},
        )

    return {"message": "Course updated", "course": course}


@admin_router.delete("/courses/{course_id}")
async def delete_course(course_id: str, admin: dict = Depends(get_admin_user)):
    payload = await _load_courses_payload()
    courses = payload.get("courses", [])
    course = _find_course(courses, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    payload["courses"] = [c for c in courses if str(c.get("courseId") or c.get("id") or "") != course_id]
    await _save_courses_payload(payload)

    await db.users.update_many({}, {"$pull": {"teacherCourseIds": course_id}})
    return {"message": "Course deleted"}


@admin_router.post("/courses/{course_id}/students")
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


@admin_router.delete("/courses/{course_id}/students/{student_id}")
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


@admin_router.post("/courses/{course_id}/assignments")
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


@admin_router.put("/courses/{course_id}/assignments/{assignment_id}")
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


@admin_router.delete("/courses/{course_id}/assignments/{assignment_id}")
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


@admin_router.get("/db/collections")
async def list_db_collections(admin: dict = Depends(get_admin_user)):
    names = await db.list_collection_names()
    visible = [name for name in names if not name.startswith("system.")]
    stats = []
    for name in sorted(visible):
        count = await db[name].count_documents({})
        stats.append({"name": name, "count": count})
    return {"collections": stats}


@admin_router.get("/db/{collection_name}/documents")
async def list_db_documents(
    collection_name: str,
    limit: int = Query(default=50, ge=1, le=200),
    skip: int = Query(default=0, ge=0),
    q: str = Query(default="", max_length=120),
    admin: dict = Depends(get_admin_user),
):
    collection_name = _validate_collection_name(collection_name)
    coll = db[collection_name]
    keyword = (q or "").strip()
    filter_query = {}

    if keyword:
        safe_keyword = re.escape(keyword)
        if collection_name == "users":
            filter_query = {
                "$or": [
                    {"username": {"$regex": safe_keyword, "$options": "i"}},
                    {"email": {"$regex": safe_keyword, "$options": "i"}},
                    {"role": {"$regex": safe_keyword, "$options": "i"}},
                ]
            }
        else:
            filter_query = {
                "$or": [
                    {"name": {"$regex": safe_keyword, "$options": "i"}},
                    {"title": {"$regex": safe_keyword, "$options": "i"}},
                    {"id": {"$regex": safe_keyword, "$options": "i"}},
                    {"courseId": {"$regex": safe_keyword, "$options": "i"}},
                ]
            }

    total = await coll.count_documents(filter_query)
    docs = await coll.find(filter_query).skip(skip).limit(limit).to_list(length=limit)
    return {
        "total": total,
        "documents": [_serialize_mongo_value(doc) for doc in docs],
    }


@admin_router.post("/db/{collection_name}/documents")
async def create_db_document(
    collection_name: str,
    req: AdminDbDocumentSchema,
    admin: dict = Depends(get_admin_user),
):
    collection_name = _validate_collection_name(collection_name)
    _check_write_access(collection_name)
    doc = dict(req.document or {})
    doc.pop("_id", None)

    result = await db[collection_name].insert_one(doc)
    created = await db[collection_name].find_one({"_id": result.inserted_id})
    return {"message": "Document created", "document": _serialize_mongo_value(created)}


@admin_router.put("/db/{collection_name}/documents/{document_id}")
async def update_db_document(
    collection_name: str,
    document_id: str,
    req: AdminDbDocumentSchema,
    admin: dict = Depends(get_admin_user),
):
    collection_name = _validate_collection_name(collection_name)
    _check_write_access(collection_name)
    if not _is_object_id(document_id):
        raise HTTPException(status_code=400, detail="Invalid document id")

    replacement = dict(req.document or {})
    replacement.pop("_id", None)

    result = await db[collection_name].replace_one({"_id": ObjectId(document_id)}, replacement)
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")

    updated = await db[collection_name].find_one({"_id": ObjectId(document_id)})
    return {"message": "Document updated", "document": _serialize_mongo_value(updated)}


@admin_router.delete("/db/{collection_name}/documents/{document_id}")
async def delete_db_document(
    collection_name: str,
    document_id: str,
    admin: dict = Depends(get_admin_user),
):
    collection_name = _validate_collection_name(collection_name)
    _check_write_access(collection_name)
    if not _is_object_id(document_id):
        raise HTTPException(status_code=400, detail="Invalid document id")

    result = await db[collection_name].delete_one({"_id": ObjectId(document_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"message": "Document deleted"}


# ── Telemetry / Observability endpoints ─────────────────────────────

@admin_router.get("/telemetry/stats")
async def get_telemetry_stats(
    hours: int = Query(default=24, ge=1, le=720),
    admin: dict = Depends(get_admin_user),
):
    from backend.infrastructure import llm_telemetry
    return await llm_telemetry.get_stats(hours=hours)


@admin_router.get("/telemetry/errors")
async def get_telemetry_errors(
    limit: int = Query(default=20, ge=1, le=100),
    admin: dict = Depends(get_admin_user),
):
    from backend.infrastructure import llm_telemetry
    errors = await llm_telemetry.get_recent_errors(limit=limit)
    return {"errors": errors}


# ═══════════════════════════════════════════════════════════════════════
# v2 — Flat model admin endpoints (course_sections + enrollments)
# ═══════════════════════════════════════════════════════════════════════

@admin_router.get("/v2/courses")
async def list_courses_v2(admin: dict = Depends(get_admin_user)):
    courses = await list_course_sections()
    for c in courses:
        enrolls = await list_enrollments(course_section_id=c["id"])
        c["enrollmentCount"] = len(enrolls)
        c["teacherCount"] = sum(1 for e in enrolls if e.get("roleInCourse") == "teacher")
        c["studentCount"] = sum(1 for e in enrolls if e.get("roleInCourse") == "student")
    return {"courses": courses}


@admin_router.post("/v2/courses")
async def create_course_v2(req: dict, admin: dict = Depends(get_admin_user)):
    from backend.schemas import CourseSectionSchema
    data = CourseSectionSchema(**req).model_dump()
    course = await create_course_section(data)

    # Auto-enroll owner teacher
    if data.get("ownerTeacherId"):
        await enroll_user(course["id"], data["ownerTeacherId"], "teacher")

    return {"message": "Course created", "course": course}


@admin_router.put("/v2/courses/{section_id}")
async def update_course_v2(section_id: str, req: dict, admin: dict = Depends(get_admin_user)):
    from backend.schemas import CourseSectionSchema
    data = CourseSectionSchema(**req).model_dump()
    course = await update_course_section(section_id, data)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return {"message": "Course updated", "course": course}


@admin_router.delete("/v2/courses/{section_id}")
async def delete_course_v2(section_id: str, admin: dict = Depends(get_admin_user)):
    deleted = await delete_course_section(section_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Course not found")
    return {"message": "Course deleted"}


@admin_router.get("/v2/courses/{section_id}/enrollments")
async def list_course_enrollments(section_id: str, admin: dict = Depends(get_admin_user)):
    enrolls = await list_enrollments(course_section_id=section_id)
    # Enrich with user info
    for e in enrolls:
        try:
            user = await db.users.find_one({"_id": ObjectId(e["userId"])})
            if user:
                e["username"] = user.get("username", "")
                e["email"] = user.get("email", "")
        except Exception:
            pass
    return {"enrollments": enrolls}


@admin_router.post("/v2/courses/{section_id}/enrollments")
async def enroll_user_v2(section_id: str, req: dict, admin: dict = Depends(get_admin_user)):
    user_id = req.get("userId", "").strip()
    role = req.get("roleInCourse", "student")
    if not user_id:
        raise HTTPException(status_code=400, detail="userId is required")
    enrollment = await enroll_user(section_id, user_id, role)
    return {"message": "User enrolled", "enrollment": enrollment}


@admin_router.delete("/v2/courses/{section_id}/enrollments/{user_id}")
async def unenroll_user_v2(section_id: str, user_id: str, admin: dict = Depends(get_admin_user)):
    removed = await unenroll_user(section_id, user_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    return {"message": "User unenrolled"}


@admin_router.get("/v2/courses/{section_id}/assignments")
async def list_assignments_v2(section_id: str, admin: dict = Depends(get_admin_user)):
    assignments = await v2_list_assignments(section_id)
    return {"assignments": assignments}


@admin_router.post("/v2/courses/{section_id}/assignments")
async def create_assignment_v2(section_id: str, req: dict, admin: dict = Depends(get_admin_user)):
    from backend.schemas import AssignmentSchema
    data = AssignmentSchema(courseSectionId=section_id, **{k: v for k, v in req.items() if k != "courseSectionId"}).model_dump()
    assignment = await v2_create_assignment(data)
    return {"message": "Assignment created", "assignment": assignment}


@admin_router.put("/v2/assignments/{assignment_id}")
async def update_assignment_v2(assignment_id: str, req: dict, admin: dict = Depends(get_admin_user)):
    assignment = await v2_update_assignment(assignment_id, req)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return {"message": "Assignment updated", "assignment": assignment}


@admin_router.delete("/v2/assignments/{assignment_id}")
async def delete_assignment_v2(assignment_id: str, admin: dict = Depends(get_admin_user)):
    deleted = await v2_delete_assignment(assignment_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return {"message": "Assignment deleted"}


@admin_router.get("/v2/relations/overview")
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