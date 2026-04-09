import os
import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from bson.objectid import ObjectId
from werkzeug.security import generate_password_hash
from backend.core.database import db
from backend.core.security import get_admin_user
from backend.core.utils import safe_object_id
from backend.config import Config
from backend.schemas import (
    AuthSchema,
    UpdateProfileSchema,
    AdminCourseSchema,
    AdminCourseStudentSchema,
    AdminAssignmentSchema,
    AdminDbDocumentSchema,
)
from backend.services.grading_service import (
    load_courses, save_courses, normalize_courses_data,
    # v2
    create_course_section, list_course_sections, update_course_section, delete_course_section,
    enroll_user, unenroll_user, list_enrollments,
    create_assignment as v2_create_assignment, update_assignment as v2_update_assignment,
    delete_assignment as v2_delete_assignment, list_assignments as v2_list_assignments,
)
from backend.services.file_asset_service import (
    list_assets,
    get_asset,
    soft_delete_asset,
    restore_asset,
    hard_delete_asset,
    run_audit,
    ensure_ai_session_image_assets,
)
from backend.services.admin_query_service import build_admin_collection_search_filter

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

    await db.users.update_one({"_id": safe_object_id(user_id, label="user")}, {"$set": update_data})
    return {"message": "User updated successfully"}


@admin_router.delete("/delete_user/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(get_admin_user)):
    if str(admin["_id"]) == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    await db.users.delete_one({"_id": safe_object_id(user_id, label="user")})
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
    filter_query = build_admin_collection_search_filter(collection_name, keyword)

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


@admin_router.get("/telemetry/timeseries")
async def get_telemetry_timeseries(
    hours: int = Query(default=24, ge=1, le=720),
    bucket: int = Query(default=60, ge=5, le=1440),
    admin: dict = Depends(get_admin_user),
):
    from backend.infrastructure import llm_telemetry
    data = await llm_telemetry.get_timeseries(hours=hours, bucket_minutes=bucket)
    return {"timeseries": data}


@admin_router.get("/telemetry/breakdown")
async def get_telemetry_breakdown(
    hours: int = Query(default=24, ge=1, le=720),
    group_by: str = Query(default="provider"),
    admin: dict = Depends(get_admin_user),
):
    from backend.infrastructure import llm_telemetry
    data = await llm_telemetry.get_breakdown(hours=hours, group_by=group_by)
    return {"breakdown": data, "group_by": group_by}


@admin_router.get("/telemetry/cost")
async def get_telemetry_cost(
    hours: int = Query(default=24, ge=1, le=720),
    admin: dict = Depends(get_admin_user),
):
    from backend.infrastructure import llm_telemetry
    return await llm_telemetry.get_cost_summary(hours=hours)


# ── API Key Management ──────────────────────────────────────────────

@admin_router.post("/verify-password")
async def verify_admin_password(
    req: dict,
    admin: dict = Depends(get_admin_user),
):
    """Verify admin password before showing sensitive data (API keys)."""
    from werkzeug.security import check_password_hash
    password = req.get("password", "")
    if not password:
        raise HTTPException(status_code=400, detail="Password required")
    if not check_password_hash(admin.get("password_hash", ""), password):
        raise HTTPException(status_code=403, detail="Invalid password")
    return {"verified": True}


# ── RAG Telemetry endpoints ─────────────────────────────────────────

@admin_router.get("/rag-telemetry/stats")
async def rag_telemetry_stats(
    hours: int = Query(default=24, ge=1, le=720),
    admin: dict = Depends(get_admin_user),
):
    from backend.infrastructure.rag_telemetry import rag_telemetry
    return await rag_telemetry.get_stats(hours)


@admin_router.get("/rag-telemetry/course-breakdown")
async def rag_telemetry_course_breakdown(
    hours: int = Query(default=24, ge=1, le=720),
    admin: dict = Depends(get_admin_user),
):
    from backend.infrastructure.rag_telemetry import rag_telemetry
    return {"breakdown": await rag_telemetry.get_course_breakdown(hours)}


@admin_router.get("/rag-telemetry/role-breakdown")
async def rag_telemetry_role_breakdown(
    hours: int = Query(default=24, ge=1, le=720),
    admin: dict = Depends(get_admin_user),
):
    from backend.infrastructure.rag_telemetry import rag_telemetry
    return {"breakdown": await rag_telemetry.get_role_breakdown(hours)}


@admin_router.get("/rag-telemetry/alerts")
async def rag_telemetry_alerts(
    hours: int = Query(default=1, ge=1, le=24),
    admin: dict = Depends(get_admin_user),
):
    from backend.infrastructure.rag_telemetry import rag_telemetry
    return {"alerts": await rag_telemetry.check_alerts(hours)}


# ── RAG Evaluation endpoints ────────────────────────────────────────

@admin_router.get("/rag-eval/datasets")
async def list_eval_datasets(admin: dict = Depends(get_admin_user)):
    from backend.services.rag_eval_service import list_datasets
    return {"datasets": await list_datasets()}


@admin_router.post("/rag-eval/datasets")
async def create_eval_dataset(req: dict, admin: dict = Depends(get_admin_user)):
    from backend.services.rag_eval_service import create_dataset
    name = (req.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Dataset name is required")
    cases = req.get("cases", [])
    if not cases:
        raise HTTPException(400, "At least one test case is required")
    ds = await create_dataset(name, cases, req.get("description", ""))
    return ds


@admin_router.get("/rag-eval/datasets/{dataset_id}")
async def get_eval_dataset(dataset_id: str, admin: dict = Depends(get_admin_user)):
    from backend.services.rag_eval_service import get_dataset
    ds = await get_dataset(dataset_id)
    if not ds:
        raise HTTPException(404, "Dataset not found")
    return ds


@admin_router.delete("/rag-eval/datasets/{dataset_id}")
async def delete_eval_dataset(dataset_id: str, admin: dict = Depends(get_admin_user)):
    from backend.services.rag_eval_service import delete_dataset
    ok = await delete_dataset(dataset_id)
    if not ok:
        raise HTTPException(404, "Dataset not found")
    return {"ok": True}


@admin_router.post("/rag-eval/run")
async def run_rag_evaluation(req: dict, admin: dict = Depends(get_admin_user)):
    """Start a full evaluation run on a dataset."""
    from backend.services.rag_eval_service import run_evaluation

    dataset_id = (req.get("dataset_id") or "").strip()
    course_id = (req.get("course_id") or "").strip()
    if not dataset_id or not course_id:
        raise HTTPException(400, "dataset_id and course_id are required")

    config = req.get("config", {})
    triggered_by = str(admin.get("username", admin.get("_id", "admin")))

    try:
        result = await run_evaluation(dataset_id, course_id, config, triggered_by)
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception:
        import logging
        logging.getLogger(__name__).exception("Eval run failed")
        raise HTTPException(500, "Evaluation run failed")


@admin_router.get("/rag-eval/runs")
async def list_eval_runs(
    limit: int = Query(default=50, ge=1, le=200),
    admin: dict = Depends(get_admin_user),
):
    from backend.services.rag_eval_service import list_runs
    return {"runs": await list_runs(limit)}


@admin_router.get("/rag-eval/run/{run_id}")
async def get_eval_run(run_id: str, admin: dict = Depends(get_admin_user)):
    from backend.services.rag_eval_service import get_run, get_run_results
    run = await get_run(run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    run["results"] = await get_run_results(run_id)
    return run


@admin_router.post("/rag-eval/case-test")
async def rag_case_test(req: dict, admin: dict = Depends(get_admin_user)):
    """Single-query debug test — not persisted."""
    from backend.services.rag_eval_service import case_test

    course_id = (req.get("course_id") or "").strip()
    query = (req.get("query") or "").strip()
    if not course_id or not query:
        raise HTTPException(400, "course_id and query are required")

    result = await case_test(
        course_id=course_id,
        query=query,
        top_k=int(req.get("top_k", 5)),
        use_hybrid=bool(req.get("use_hybrid", True)),
    )
    return result


@admin_router.post("/rag-eval/baseline/{run_id}")
async def set_eval_baseline(run_id: str, req: dict, admin: dict = Depends(get_admin_user)):
    from backend.services.rag_eval_service import set_baseline
    course_id = (req.get("course_id") or "").strip()
    if not course_id:
        raise HTTPException(400, "course_id is required")
    return await set_baseline(run_id, course_id)


@admin_router.get("/rag-eval/baseline/{course_id}")
async def get_eval_baseline(course_id: str, admin: dict = Depends(get_admin_user)):
    from backend.services.rag_eval_service import get_baseline, get_run
    bl = await get_baseline(course_id)
    if not bl:
        return {"baseline": None}
    run = await get_run(bl.get("run_id", ""))
    return {"baseline": bl, "run": run}


@admin_router.get("/rag-eval/compare")
async def compare_eval_runs(
    base: str = Query(...),
    target: str = Query(...),
    admin: dict = Depends(get_admin_user),
):
    from backend.services.rag_eval_service import compare_runs
    try:
        return await compare_runs(base, target)
    except ValueError as e:
        raise HTTPException(404, str(e))


@admin_router.post("/rag-eval/quality-gate")
async def rag_quality_gate(req: dict, admin: dict = Depends(get_admin_user)):
    """
    Release quality gate: run evaluation on a dataset, compare against baseline,
    and return pass/fail based on configurable thresholds.

    Request body:
        dataset_id:  str            (required)
        course_id:   str            (required)
        config:      { top_k?, use_hybrid? }
        thresholds:  { max_hit_rate_drop_pct?, max_p95_latency_increase_pct?, max_error_rate? }

    Default thresholds:
        - Recall@k (hit_rate) must not drop more than 3 % vs baseline
        - P95 latency must not increase more than 20 % vs baseline
        - empty_retrieval_rate must be <= 2 %
    """
    from backend.services.rag_eval_service import (
        run_evaluation, get_baseline, get_run, compare_runs,
    )

    dataset_id = (req.get("dataset_id") or "").strip()
    course_id = (req.get("course_id") or "").strip()
    if not dataset_id or not course_id:
        raise HTTPException(400, "dataset_id and course_id are required")

    config = req.get("config", {})
    th = req.get("thresholds", {})
    max_hit_rate_drop = th.get("max_hit_rate_drop_pct", 3)
    max_p95_increase = th.get("max_p95_latency_increase_pct", 20)
    max_empty_rate = th.get("max_error_rate", 0.02)

    triggered_by = str(admin.get("username", admin.get("_id", "quality-gate")))

    # 1) Run evaluation
    try:
        run = await run_evaluation(dataset_id, course_id, config, triggered_by)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception:
        import logging
        logging.getLogger(__name__).exception("Quality gate eval run failed")
        raise HTTPException(500, "Evaluation run failed")

    run_metrics = run.get("metrics", {})
    run_id = run.get("run_id", "")

    # 2) Compare against baseline if one exists
    gate_checks: list[dict] = []
    baseline = await get_baseline(course_id)

    if baseline:
        baseline_run_id = baseline.get("run_id", "")
        try:
            comparison = await compare_runs(baseline_run_id, run_id)
            diff = comparison.get("diff", {})

            # hit_rate drop check
            hr_diff = diff.get("hit_rate", {})
            hr_delta_pct = hr_diff.get("pct_change", 0)
            hr_pass = hr_delta_pct >= -max_hit_rate_drop
            gate_checks.append({
                "check": "hit_rate_vs_baseline",
                "passed": hr_pass,
                "base": hr_diff.get("base", 0),
                "current": hr_diff.get("target", 0),
                "delta_pct": hr_delta_pct,
                "threshold": f">= -{max_hit_rate_drop}%",
            })

            # P95 latency increase check
            p95_diff = diff.get("p95_latency_ms", {})
            p95_delta_pct = p95_diff.get("pct_change", 0)
            p95_pass = p95_delta_pct <= max_p95_increase
            gate_checks.append({
                "check": "p95_latency_vs_baseline",
                "passed": p95_pass,
                "base": p95_diff.get("base", 0),
                "current": p95_diff.get("target", 0),
                "delta_pct": p95_delta_pct,
                "threshold": f"<= +{max_p95_increase}%",
            })
        except ValueError:
            gate_checks.append({
                "check": "baseline_comparison",
                "passed": True,
                "note": "Baseline run not found, skipping comparison",
            })
    else:
        gate_checks.append({
            "check": "baseline_comparison",
            "passed": True,
            "note": "No baseline set for this course, skipping comparison",
        })

    # 3) Absolute empty retrieval rate check
    er = run_metrics.get("empty_retrieval_rate", 0)
    er_pass = er <= max_empty_rate
    gate_checks.append({
        "check": "empty_retrieval_rate",
        "passed": er_pass,
        "current": er,
        "threshold": f"<= {max_empty_rate * 100}%",
    })

    overall_pass = all(c["passed"] for c in gate_checks)

    return {
        "passed": overall_pass,
        "run_id": run_id,
        "metrics": run_metrics,
        "checks": gate_checks,
    }


@admin_router.get("/api-keys")
async def get_api_keys(admin: dict = Depends(get_admin_user)):
    """Return configured API key metadata (masked). Never returns raw keys."""
    from backend.config import Config
    keys = [
        {"alias": "COZE_TOKEN",      "provider": "coze",     "value": _mask_key(Config.COZE_TOKEN)},
        {"alias": "DEEPSEEK_API_KEY", "provider": "deepseek", "value": _mask_key(Config.DEEPSEEK_API_KEY)},
        {"alias": "ZHIPU_API_KEY",   "provider": "zhipu",    "value": _mask_key(Config.ZHIPU_API_KEY)},
        {"alias": "SERP_API_KEY",    "provider": "serp",     "value": _mask_key(Config.SERP_API_KEY)},
    ]
    return {"keys": keys}


# Allowed env var names for API key updates (whitelist)
_EDITABLE_KEY_ALIASES = {"COZE_TOKEN", "DEEPSEEK_API_KEY", "ZHIPU_API_KEY", "SERP_API_KEY"}


@admin_router.put("/api-keys")
async def update_api_key(
    req: dict,
    admin: dict = Depends(get_admin_user),
):
    """Update an API key value after password verification.

    Writes to the .env file and updates the runtime Config attribute.
    """
    from werkzeug.security import check_password_hash
    from backend.config import Config

    password = (req.get("password") or "").strip()
    alias = (req.get("alias") or "").strip()
    new_value = (req.get("value") or "").strip()

    if not password:
        raise HTTPException(status_code=400, detail="Password required")
    if not check_password_hash(admin.get("password_hash", ""), password):
        raise HTTPException(status_code=403, detail="Invalid password")
    if alias not in _EDITABLE_KEY_ALIASES:
        raise HTTPException(status_code=400, detail="Invalid key alias")
    if not new_value:
        raise HTTPException(status_code=400, detail="Key value cannot be empty")

    # ── Update .env file ──
    env_path = os.path.join(Config.BASE_DIR, ".env")
    _update_env_file(env_path, alias, new_value)

    # ── Update runtime Config + os.environ ──
    os.environ[alias] = new_value
    setattr(Config, alias, new_value)

    return {"message": f"{alias} updated successfully", "value": _mask_key(new_value)}


def _update_env_file(env_path: str, key: str, value: str) -> None:
    """Safely update a single key in a .env file (or append if missing)."""
    import re as _re

    if not os.path.isfile(env_path):
        with open(env_path, "w", encoding="utf-8") as f:
            f.write(f"{key}={value}\n")
        return

    with open(env_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    pattern = _re.compile(rf"^\s*{_re.escape(key)}\s*=")
    found = False
    new_lines = []
    for line in lines:
        if pattern.match(line):
            new_lines.append(f"{key}={value}\n")
            found = True
        else:
            new_lines.append(line)

    if not found:
        new_lines.append(f"{key}={value}\n")

    with open(env_path, "w", encoding="utf-8") as f:
        f.writelines(new_lines)


def _mask_key(value: str | None) -> str:
    """Mask an API key showing only first 4 and last 4 chars."""
    if not value:
        return "(not set)"
    if len(value) <= 10:
        return value[:2] + "***" + value[-2:]
    return value[:4] + "***" + value[-4:]


# ── File Center endpoints ─────────────────────────────────────────────

@admin_router.get("/files/assets")
async def list_file_assets(
    file_type: str = Query(default="", max_length=64),
    status: str = Query(default="", max_length=32),
    owner_type: str = Query(default="", max_length=64),
    course_id: str = Query(default="", max_length=128),
    created_by: str = Query(default="", max_length=64),
    q: str = Query(default="", max_length=120),
    limit: int = Query(default=100, ge=1, le=300),
    skip: int = Query(default=0, ge=0),
    admin: dict = Depends(get_admin_user),
):
    data = await list_assets(
        file_type=file_type,
        status=status,
        owner_type=owner_type,
        course_id=course_id,
        created_by=created_by,
        q=q,
        limit=limit,
        skip=skip,
    )
    return data


@admin_router.get("/files/assets/{asset_id}")
async def get_file_asset(asset_id: str, admin: dict = Depends(get_admin_user)):
    asset = await get_asset(asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return {"asset": asset}


@admin_router.post("/files/assets/{asset_id}/soft-delete")
async def soft_delete_file_asset(asset_id: str, req: dict, admin: dict = Depends(get_admin_user)):
    actor_id = str(admin.get("_id", ""))
    reason = str((req or {}).get("reason", "") or "").strip()
    asset = await soft_delete_asset(asset_id, actor_id=actor_id, reason=reason)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return {"asset": asset}


@admin_router.post("/files/assets/{asset_id}/restore")
async def restore_file_asset(asset_id: str, admin: dict = Depends(get_admin_user)):
    actor_id = str(admin.get("_id", ""))
    asset = await restore_asset(asset_id, actor_id=actor_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found or not soft deleted")
    return {"asset": asset}


@admin_router.post("/files/assets/{asset_id}/hard-delete")
async def hard_delete_file_asset(asset_id: str, admin: dict = Depends(get_admin_user)):
    actor_id = str(admin.get("_id", ""))
    result = await hard_delete_asset(asset_id, actor_id=actor_id)
    if not result:
        raise HTTPException(status_code=404, detail="Asset not found")
    if result.get("blocked"):
        raise HTTPException(status_code=409, detail=f"Delete blocked: {result.get('reason', 'referenced')}")
    return {"asset": result}


@admin_router.get("/files/assets/{asset_id}/download")
async def download_file_asset(asset_id: str, admin: dict = Depends(get_admin_user)):
    from backend.services.file_asset_service import get_asset, _absolute_from_storage_path
    from fastapi.responses import FileResponse, Response
    import base64
    asset = await get_asset(asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
        
    storage_path = str(asset.get("storage_path", ""))
    if storage_path.startswith("mongo://"):
        session_id = asset.get("session_id")
        meta = asset.get("metadata", {})
        msg_idx = meta.get("message_index")
        img_idx = meta.get("image_index")
        if ObjectId.is_valid(session_id):
            sess = await db.ai_chat_sessions.find_one({"_id": ObjectId(session_id)})
            if sess:
                msgs = sess.get("messages", [])
                if 0 <= msg_idx < len(msgs):
                    imgs = msgs[msg_idx].get("images", [])
                    if 0 <= img_idx < len(imgs):
                        b64_data = imgs[img_idx]
                        if b64_data.startswith("data:image"):
                            _, b64_data = b64_data.split(",", 1)
                        content = base64.b64decode(b64_data)
                        return Response(content=content, media_type="image/jpeg", headers={"Content-Disposition": f"attachment; filename=\"{asset.get('filename')}\""})
        raise HTTPException(status_code=404, detail="Mongo base64 image not found")

    path = _absolute_from_storage_path(storage_path)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File missing from disk")
    return FileResponse(path, filename=asset.get("filename", "download"))


@admin_router.get("/files/audit")
async def audit_file_assets(admin: dict = Depends(get_admin_user)):
    result = await run_audit()
    return result


@admin_router.get("/files/stats")
async def file_asset_stats(admin: dict = Depends(get_admin_user)):
    pipeline = [
        {
            "$group": {
                "_id": {"file_type": "$file_type", "status": "$status"},
                "count": {"$sum": 1},
                "total_size": {"$sum": "$size"},
            }
        },
        {"$sort": {"_id.file_type": 1, "_id.status": 1}},
    ]

    rows = []
    async for item in db.file_assets.aggregate(pipeline):
        rows.append({
            "file_type": item.get("_id", {}).get("file_type", ""),
            "status": item.get("_id", {}).get("status", ""),
            "count": int(item.get("count", 0) or 0),
            "total_size": int(item.get("total_size", 0) or 0),
        })
    return {"rows": rows}


def _date_bucket(value, group_by: str) -> str:
    if isinstance(value, datetime):
        if group_by == "month":
            return value.strftime("%Y-%m")
        return value.strftime("%Y-%m-%d")
    if isinstance(value, str) and value:
        if group_by == "month":
            return value[:7]
        return value[:10]
    return "unknown"


@admin_router.get("/files/chat/rooms")
async def list_chat_rooms_for_file_center(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    admin: dict = Depends(get_admin_user)
):
    pipeline = [
        {"$match": {"type": "group"}},
        {
            "$lookup": {
                "from": "file_assets",
                "let": {"rid": {"$toString": "$_id"}},
                "pipeline": [
                    {
                        "$match": {
                            "$expr": {
                                "$and": [
                                    {"$eq": ["$room_id", "$$rid"]},
                                    {"$eq": ["$scope", "chat_group"]},
                                    {"$ne": ["$status", "hard_deleted"]},
                                ]
                            }
                        }
                    }
                ],
                "as": "assets",
            }
        },
        {
            "$project": {
                "_id": 0,
                "room_id": {"$toString": "$_id"},
                "name": "$name",
                "type": "$type",
                "course_id": "$courseId",
                "member_count": {"$size": {"$ifNull": ["$members", []]}},
                "asset_count": {"$size": "$assets"},
                "created_at": "$createdAt",
            }
        },
        {"$sort": {"asset_count": -1, "name": 1}},
        {"$skip": skip},
        {"$limit": limit}
    ]
    rooms = []
    async for doc in db.chat_rooms.aggregate(pipeline):
        rooms.append(_serialize_mongo_value(doc))
    
    total = await db.chat_rooms.count_documents({"type": "group"})
    return {"rooms": rooms, "total": total, "skip": skip, "limit": limit}


@admin_router.get("/files/chat/rooms/{room_id}/assets")
async def list_chat_room_assets(
    room_id: str,
    status: str = Query(default="", max_length=32),
    admin: dict = Depends(get_admin_user),
):
    query: dict = {"room_id": room_id, "scope": "chat_group"}
    if status:
        query["status"] = status
    else:
        query["status"] = {"$ne": "hard_deleted"}

    room = None
    if ObjectId.is_valid(room_id):
        room = await db.chat_rooms.find_one({"_id": ObjectId(room_id)}, {"name": 1, "courseId": 1, "type": 1})

    assets = []
    async for doc in db.file_assets.find(query).sort("created_at", -1):
        item = _serialize_mongo_value(doc)
        storage_path = str(item.get("storage_path", "") or "").lstrip("/")
        item["exists_on_disk"] = os.path.exists(os.path.join(Config.BASE_DIR, storage_path))
        assets.append(item)
    return {
        "room": _serialize_mongo_value(room) if room else {"id": room_id},
        "assets": assets,
        "total": len(assets),
    }


@admin_router.get("/files/ai/users")
async def list_ai_users_for_file_center(
    role: str = Query(default="student", pattern="^(teacher|student)$"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    admin: dict = Depends(get_admin_user),
):
    users = []
    cursor = db.users.find({"role": role}, {"username": 1, "email": 1, "role": 1}).sort("username", 1).skip(skip).limit(limit)
    async for u in cursor:
        uid = str(u.get("_id"))
        await ensure_ai_session_image_assets(uid)
        session_count = await db.ai_chat_sessions.count_documents({"userId": ObjectId(uid)})
        asset_count = await db.file_assets.count_documents(
            {"scope": "ai_personal", "user_id": uid, "status": {"$ne": "hard_deleted"}}
        )
        users.append(
            {
                "user_id": uid,
                "username": u.get("username", ""),
                "email": u.get("email", ""),
                "role": u.get("role", role),
                "session_count": session_count,
                "asset_count": asset_count,
            }
        )
    total = await db.users.count_documents({"role": role})
    return {"users": users, "total": total, "skip": skip, "limit": limit}


@admin_router.get("/files/ai/users/{user_id}/assets")
async def list_ai_user_assets(
    user_id: str,
    group_by: str = Query(default="day", pattern="^(day|month)$"),
    status: str = Query(default="", max_length=32),
    admin: dict = Depends(get_admin_user),
):
    if not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=400, detail="Invalid user id")

    await ensure_ai_session_image_assets(user_id)

    query: dict = {"scope": "ai_personal", "user_id": user_id}
    if status:
        query["status"] = status
    else:
        query["status"] = {"$ne": "hard_deleted"}

    grouped: dict[str, dict] = {}
    async for doc in db.file_assets.find(query).sort("created_at", -1):
        item = _serialize_mongo_value(doc)
        bucket = _date_bucket(doc.get("created_at") or item.get("conversation_date"), group_by)
        if bucket not in grouped:
            grouped[bucket] = {"date": bucket, "count": 0, "total_size": 0, "items": []}
        grouped[bucket]["count"] += 1
        grouped[bucket]["total_size"] += int(item.get("size", 0) or 0)
        grouped[bucket]["items"].append(item)

    groups = sorted(grouped.values(), key=lambda x: x["date"], reverse=True)
    return {
        "user_id": user_id,
        "group_by": group_by,
        "groups": groups,
        "total": sum(g["count"] for g in groups),
    }


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


# ─── Staff Codes ─────────────────────────────────────────────────────────────

@admin_router.post("/staff-codes/generate")
async def generate_staff_code(admin: dict = Depends(get_admin_user)):
    import secrets
    from datetime import datetime, timezone, timedelta
    code = secrets.token_hex(4).upper()  # 8 uppercase hex chars
    now = datetime.now(timezone.utc)
    doc = {
        "code": code,
        "created_by": str(admin["_id"]),
        "created_at": now,
        "expires_at": now + timedelta(days=7),
        "is_used": False,
        "used_by": None,
        "used_at": None,
    }
    await db.staff_codes.insert_one(doc)
    return {"code": code, "expires_at": doc["expires_at"].isoformat()}


@admin_router.get("/staff-codes")
async def list_staff_codes(admin: dict = Depends(get_admin_user)):
    codes = await db.staff_codes.find().sort("created_at", -1).to_list(200)
    return [
        {
            "code": c["code"],
            "is_used": c["is_used"],
            "created_at": c["created_at"].isoformat(),
            "expires_at": c["expires_at"].isoformat(),
            "used_by": c.get("used_by"),
            "used_at": c["used_at"].isoformat() if c.get("used_at") else None,
        }
        for c in codes
    ]


@admin_router.delete("/staff-codes/{code}")
async def revoke_staff_code(code: str, admin: dict = Depends(get_admin_user)):
    result = await db.staff_codes.delete_one({"code": code.upper(), "is_used": False})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Code not found or already used")
    return {"ok": True}