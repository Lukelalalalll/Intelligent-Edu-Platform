"""Legacy course/submission data model backed by MongoDB + JSON snapshot."""
import json
import logging
import uuid
from typing import Any, Dict, List, Optional, Tuple

from pymongo import UpdateOne

from backend.core.database import db
from ._shared import (
    _ensure_directories,
    _utcnow,
    COURSES_PATH,
    COURSES_COLLECTION,
    VALID_DEGREE_LEVELS,
)

logger = logging.getLogger(__name__)


async def _load_all_course_docs(courses_coll: Any) -> list[dict[str, Any]]:
    return [doc async for doc in courses_coll.find({}, {"_id": 0})]


async def load_courses() -> Dict[str, Any]:
    _ensure_directories()
    courses_coll = db[COURSES_COLLECTION]
    docs = await _load_all_course_docs(courses_coll)
    if docs:
        return normalize_courses_data({"courses": docs})

    if COURSES_PATH.exists():
        try:
            raw_data = json.loads(COURSES_PATH.read_text())
            normalized = normalize_courses_data(raw_data)
            normalized_courses = normalized.get("courses", [])
            if normalized_courses:
                await courses_coll.insert_many(normalized_courses)
            return normalized
        except json.JSONDecodeError:
            return {"courses": []}

    return {"courses": []}


async def save_courses(data: Dict[str, Any]) -> None:
    _ensure_directories()
    normalized = normalize_courses_data(data)
    courses = normalized.get("courses", [])
    courses_coll = db[COURSES_COLLECTION]

    # Keep a JSON snapshot for backup and compatibility with existing scripts.
    # Write before DB sync because Motor mutates dicts in-place (adds _id).
    COURSES_PATH.write_text(json.dumps(normalized, indent=2))

    if not courses:
        await courses_coll.delete_many({})
        return

    now = _utcnow()
    sync_version = f"sync_{uuid.uuid4().hex}"
    operations: list[UpdateOne] = []
    course_ids: list[str] = []

    for course in courses:
        cid = str(course.get("courseId") or course.get("id") or "").strip()
        if not cid:
            continue
        course_ids.append(cid)
        payload = dict(course)
        payload["id"] = cid
        payload["courseId"] = cid
        payload["updatedAt"] = now
        payload["syncVersion"] = sync_version
        operations.append(
            UpdateOne(
                {"courseId": cid},
                {"$set": payload, "$setOnInsert": {"createdAt": now}},
                upsert=True,
            )
        )

    if operations:
        await courses_coll.bulk_write(operations, ordered=False)

    # Delete stale records after all target docs are present to avoid transient empty windows.
    await courses_coll.delete_many({"courseId": {"$nin": course_ids}})


def _normalize_student_list(course: Dict[str, Any]) -> List[Dict[str, Any]]:
    students = course.get("studentList")
    if not isinstance(students, list):
        students = []

    normalized: List[Dict[str, Any]] = []
    seen_ids: set[str] = set()

    for item in students:
        if isinstance(item, dict):
            sid = str(item.get("studentId") or "").strip()
            if not sid or sid in seen_ids:
                continue
            normalized.append({"studentId": sid})
            seen_ids.add(sid)
        elif isinstance(item, str):
            sid = item.strip()
            if not sid or sid in seen_ids:
                continue
            normalized.append({"studentId": sid})
            seen_ids.add(sid)

    # Backfill from submissions to avoid missing student references.
    for assignment in course.get("assignments", []):
        for submission in assignment.get("submissions", []):
            sid = str(submission.get("studentId") or "").strip()
            if sid and sid not in seen_ids:
                normalized.append({"studentId": sid})
                seen_ids.add(sid)

    return normalized


def normalize_course(course: Dict[str, Any]) -> Dict[str, Any]:
    course_id = str(course.get("courseId") or course.get("id") or "").strip()
    teacher_id = str(course.get("teacherId") or "").strip()
    degree_level = str(course.get("degreeLevel") or "bachelor").lower().strip()
    if degree_level not in VALID_DEGREE_LEVELS:
        degree_level = "bachelor"

    return {
        "id": course_id,  # Keep compatibility with existing frontend usages.
        "courseId": course_id,
        "name": course.get("name", ""),
        "teacherId": teacher_id,
        "teacher": course.get("teacher", ""),
        "degreeLevel": degree_level,
        "semester": str(course.get("semester") or "").strip(),
        "studentList": _normalize_student_list(course),
        "assignments": course.get("assignments", []),
    }


def normalize_courses_data(data: Dict[str, Any]) -> Dict[str, Any]:
    courses = data.get("courses", []) if isinstance(data, dict) else []
    normalized_courses = [normalize_course(c) for c in courses if isinstance(c, dict)]
    return {"courses": normalized_courses}


async def find_submission(
    submission_id: str,
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """Return (course, assignment, submission) for an id."""
    data = await load_courses()
    for course in data.get("courses", []):
        for assignment in course.get("assignments", []):
            for submission in assignment.get("submissions", []):
                if submission.get("id") == submission_id:
                    return course, assignment, submission
    return None, None, None
