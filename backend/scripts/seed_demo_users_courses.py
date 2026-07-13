from __future__ import annotations

from datetime import datetime, timezone

from pymongo import MongoClient
from werkzeug.security import generate_password_hash

from backend.config import Config

DEFAULT_PASSWORD = "123456"

TEACHERS = [
    {
        "username": "teacher_elec",
        "email": "teacher.elec@edu.local",
        "role": "teacher",
    }
]

STUDENTS = [
    {
        "username": "student_alice",
        "email": "alice.student@edu.local",
        "role": "student",
        "studentId": "S10001",
    },
    {
        "username": "student_bob",
        "email": "bob.student@edu.local",
        "role": "student",
        "studentId": "S10002",
    },
    {
        "username": "student_cathy",
        "email": "cathy.student@edu.local",
        "role": "student",
        "studentId": "S10003",
    },
]

COURSES = [
    {
        "courseCode": "ELEC3442",
        "courseName": "Embedded Systems Design",
        "semester": "2025-26 Semester 2",
        "degreeLevel": "bachelor",
    },
    {
        "courseCode": "ELEC4848",
        "courseName": "Advanced Power Electronics",
        "semester": "2025-26 Semester 2",
        "degreeLevel": "master",
    },
]


def now_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def ensure_user(users, payload: dict) -> dict:
    username = payload["username"]
    existing = users.find_one({"username": username})

    if existing:
        update = {
            "email": payload["email"],
            "role": payload["role"],
        }
        if payload.get("studentId"):
            update["studentId"] = payload["studentId"]
        if payload["role"] == "teacher":
            update.setdefault("teacherCourseIds", existing.get("teacherCourseIds", []))
        users.update_one({"_id": existing["_id"]}, {"$set": update})
        return users.find_one({"_id": existing["_id"]})

    doc = {
        "username": username,
        "email": payload["email"],
        "password_hash": generate_password_hash(DEFAULT_PASSWORD),
        "role": payload["role"],
        "teacherCourseIds": [] if payload["role"] == "teacher" else [],
    }
    if payload.get("studentId"):
        doc["studentId"] = payload["studentId"]
    users.insert_one(doc)
    return users.find_one({"username": username})


def ensure_v2_course_sections(db, owner_teacher_id: str) -> list[dict]:
    created = []
    for c in COURSES:
        existing = db.course_sections.find_one({"courseCode": c["courseCode"]})
        base = {
            "courseCode": c["courseCode"],
            "courseName": c["courseName"],
            "semester": c["semester"],
            "degreeLevel": c["degreeLevel"],
            "ownerTeacherId": owner_teacher_id,
        }
        if existing:
            db.course_sections.update_one({"_id": existing["_id"]}, {"$set": base})
            section = db.course_sections.find_one({"_id": existing["_id"]})
        else:
            inserted = db.course_sections.insert_one(base)
            section = db.course_sections.find_one({"_id": inserted.inserted_id})
        created.append(section)
    return created


def ensure_enrollments(db, section_ids: list[str], teacher_id: str, student_ids: list[str]) -> None:
    for section_id in section_ids:
        db.enrollments.update_one(
            {"courseSectionId": section_id, "userId": teacher_id},
            {"$set": {"courseSectionId": section_id, "userId": teacher_id, "roleInCourse": "teacher"}},
            upsert=True,
        )
        for sid in student_ids:
            db.enrollments.update_one(
                {"courseSectionId": section_id, "userId": sid},
                {"$set": {"courseSectionId": section_id, "userId": sid, "roleInCourse": "student"}},
                upsert=True,
            )


def ensure_legacy_courses(db, teacher_id: str, student_ids: list[str]) -> None:
    # Keep legacy collection in sync for backward-compatible screens/routes.
    now = now_str()
    legacy_courses = []
    for c in COURSES:
        legacy_courses.append(
            {
                "id": c["courseCode"],
                "courseId": c["courseCode"],
                "name": c["courseName"],
                "teacherId": teacher_id,
                "degreeLevel": c["degreeLevel"],
                "semester": c["semester"],
                "studentList": [{"studentId": sid} for sid in student_ids],
                "assignments": [],
                "updatedAt": now,
            }
        )

    for course in legacy_courses:
        db.courses.update_one(
            {"courseId": course["courseId"]},
            {"$set": course},
            upsert=True,
        )


def main() -> None:
    client = MongoClient(Config.MONGO_URI)
    db = client.get_default_database()
    users = db.users

    teacher_docs = [ensure_user(users, t) for t in TEACHERS]
    student_docs = [ensure_user(users, s) for s in STUDENTS]

    teacher = teacher_docs[0]
    teacher_id = str(teacher["_id"])
    student_ids = [str(s["_id"]) for s in student_docs]

    # Ensure teacher has both courses in profile.
    users.update_one(
        {"_id": teacher["_id"]},
        {"$addToSet": {"teacherCourseIds": {"$each": [c["courseCode"] for c in COURSES]}}},
    )

    sections = ensure_v2_course_sections(db, owner_teacher_id=teacher_id)
    section_ids = [str(sec["_id"]) for sec in sections]

    ensure_enrollments(db, section_ids=section_ids, teacher_id=teacher_id, student_ids=student_ids)
    ensure_legacy_courses(db, teacher_id=teacher_id, student_ids=[s.get("studentId", "") for s in student_docs])

    print("=== Seed completed ===")
    print(f"Teacher password (all demo users): {DEFAULT_PASSWORD}")
    print("Teachers:")
    for t in teacher_docs:
        print(f"- {t['username']} | {t['email']}")
    print("Students:")
    for s in student_docs:
        print(f"- {s['username']} | {s['email']} | studentId={s.get('studentId', '')}")
    print("Courses:")
    for c in COURSES:
        print(f"- {c['courseCode']} | {c['courseName']} | {c['semester']}")


if __name__ == "__main__":
    main()
