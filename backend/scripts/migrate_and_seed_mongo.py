from __future__ import annotations

import json
import re
from pathlib import Path

from pymongo import MongoClient
from werkzeug.security import generate_password_hash

from backend.config import Config


ROOT_DIR = Path(__file__).resolve().parents[2]
COURSES_PATH = ROOT_DIR / "data" / "courses.json"
DEFAULT_PASSWORD = "123456"


def slugify_name(name: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", ".", name.strip().lower())
    return cleaned.strip(".") or "student"


def load_courses() -> list[dict]:
    if not COURSES_PATH.exists():
        return []
    data = json.loads(COURSES_PATH.read_text())
    return data.get("courses", []) if isinstance(data, dict) else []


def ensure_user_defaults(users) -> dict:
    admin_backfill = users.update_many(
        {"role": {"$exists": False}, "username": "admin"},
        {"$set": {"role": "admin"}},
    )
    teacher_backfill = users.update_many(
        {"role": {"$exists": False}, "username": {"$regex": r"^teacher_"}},
        {"$set": {"role": "teacher", "teacherCourseIds": []}},
    )
    student_backfill = users.update_many(
        {"role": {"$exists": False}},
        {"$set": {"role": "student"}},
    )
    teacher_courses_result = users.update_many(
        {"role": "teacher", "teacherCourseIds": {"$exists": False}},
        {"$set": {"teacherCourseIds": []}},
    )
    return {
        "admin_roles_backfilled": admin_backfill.modified_count,
        "teacher_roles_backfilled": teacher_backfill.modified_count,
        "student_roles_backfilled": student_backfill.modified_count,
        "teacher_courses_backfilled": teacher_courses_result.modified_count,
    }


def ensure_teacher(users, course_id: str):
    username = f"teacher_{course_id}"
    users.update_one(
        {"username": username},
        {
            "$setOnInsert": {
                "username": username,
                "email": f"{username}@edu.local",
                "password_hash": generate_password_hash(DEFAULT_PASSWORD),
            },
            "$set": {"role": "teacher"},
            "$addToSet": {"teacherCourseIds": course_id},
        },
        upsert=True,
    )
    return users.find_one({"username": username})


def ensure_student(users, student_id: str, student_name: str):
    username = slugify_name(student_name) if student_name else f"student.{student_id}"

    # Prefer updating an existing student by id, then by username fallback.
    existing = users.find_one({"studentId": student_id})
    if existing is None:
        existing = users.find_one({"username": username})

    if existing:
        users.update_one(
            {"_id": existing["_id"]},
            {
                "$set": {
                    "role": existing.get("role", "student") if existing.get("role") in {"student", "teacher", "admin"} else "student",
                    "studentId": student_id,
                    "teacherCourseIds": existing.get("teacherCourseIds", []),
                },
                "$setOnInsert": {
                    "password_hash": generate_password_hash(DEFAULT_PASSWORD),
                },
            },
        )
        return users.find_one({"_id": existing["_id"]})

    users.insert_one(
        {
            "username": username,
            "email": f"{username}@student.local",
            "password_hash": generate_password_hash(DEFAULT_PASSWORD),
            "role": "student",
            "studentId": student_id,
            "teacherCourseIds": [],
        }
    )
    return users.find_one({"username": username})


def collect_course_students(course: dict) -> dict[str, str]:
    students: dict[str, str] = {}

    for item in course.get("studentList", []):
        if isinstance(item, dict):
            sid = str(item.get("studentId") or "").strip()
            if sid:
                students[sid] = str(item.get("studentName") or "").strip()
        elif isinstance(item, str):
            sid = item.strip()
            if sid:
                students[sid] = ""

    for assignment in course.get("assignments", []):
        for submission in assignment.get("submissions", []):
            sid = str(submission.get("studentId") or "").strip()
            if not sid:
                continue
            name = str(submission.get("studentName") or "").strip()
            if sid not in students or (not students[sid] and name):
                students[sid] = name

    return students


def main() -> None:
    courses = load_courses()
    client = MongoClient(Config.MONGO_URI)
    db = client.get_default_database()
    users = db.users
    relations = db.course_relations

    summary = {
        "courses_seen": len(courses),
        "teachers_upserted": 0,
        "students_upserted": 0,
        "relations_upserted": 0,
    }

    summary.update(ensure_user_defaults(users))

    for course in courses:
        course_id = str(course.get("courseId") or course.get("id") or "").strip().lower()
        if not course_id:
            continue

        teacher_doc = ensure_teacher(users, course_id)
        summary["teachers_upserted"] += 1

        student_map = collect_course_students(course)
        enrolled_student_ids = []
        enrolled_student_user_ids = []
        for sid, sname in student_map.items():
            student_doc = ensure_student(users, sid, sname)
            summary["students_upserted"] += 1
            enrolled_student_ids.append(sid)
            enrolled_student_user_ids.append(str(student_doc["_id"]))

        relations.update_one(
            {"courseId": course_id},
            {
                "$set": {
                    "courseId": course_id,
                    "courseName": course.get("name", ""),
                    "semester": course.get("semester", ""),
                    "degreeLevel": course.get("degreeLevel", ""),
                    "teacherUsername": teacher_doc["username"],
                    "teacherUserId": str(teacher_doc["_id"]),
                    "studentIds": enrolled_student_ids,
                    "studentUserIds": enrolled_student_user_ids,
                }
            },
            upsert=True,
        )
        summary["relations_upserted"] += 1

    print("Migration and seed completed:")
    for key, value in summary.items():
        print(f"- {key}: {value}")


if __name__ == "__main__":
    main()
