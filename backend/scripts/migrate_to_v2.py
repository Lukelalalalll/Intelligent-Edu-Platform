"""
Migration script: Flatten nested courses/assignments/submissions into v2 collections.

Usage:
    cd backend && python -m scripts.migrate_to_v2

This script:
1. Reads from the legacy `courses` collection (or data/courses.json)
2. Creates records in: course_sections, enrollments, assignments, submissions, documents
3. Preserves existing _id references where possible
4. Is idempotent — running it twice will skip already-migrated records
"""

import asyncio
import hashlib
import json
import logging
import sys
from pathlib import Path

# Ensure backend is importable
sys.path.insert(0, str(Path(__file__).resolve().parents[1].parent))

from motor.motor_asyncio import AsyncIOMotorClient
from backend.config import Config
from backend.repositories._helpers import require_object_id

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

DATA_ROOT = Path(__file__).resolve().parents[2] / "data"
COURSES_PATH = DATA_ROOT / "courses.json"


async def _read_all(cursor):
    return [doc async for doc in cursor]


async def migrate():
    client = AsyncIOMotorClient(Config.MONGO_URI)
    db = client.get_default_database()

    # Load legacy courses
    legacy_docs = await _read_all(db.courses.find({}))
    if not legacy_docs:
        if COURSES_PATH.exists():
            raw = json.loads(COURSES_PATH.read_text())
            legacy_docs = raw.get("courses", [])
            logger.info("Loaded %d courses from JSON file", len(legacy_docs))
        else:
            logger.warning("No legacy courses found in MongoDB or JSON. Nothing to migrate.")
            return

    logger.info("Found %d legacy courses to migrate", len(legacy_docs))

    # Load all users for ID mapping
    users = await _read_all(db.users.find())
    username_to_id = {}
    studentno_to_id = {}
    for u in users:
        uid = str(u["_id"])
        username_to_id[u.get("username", "").lower()] = uid
        if u.get("studentId"):
            studentno_to_id[str(u["studentId"])] = uid

    stats = {"courses": 0, "enrollments": 0, "assignments": 0, "submissions": 0, "documents": 0}

    for course in legacy_docs:
        course_id_legacy = str(course.get("courseId") or course.get("id") or "").strip()
        if not course_id_legacy:
            continue

        # Check if already migrated
        existing = await db.course_sections.find_one({"courseCode": course_id_legacy})
        if existing:
            section_id = str(existing["_id"])
            logger.info("Course %s already migrated (section_id=%s), skipping section creation", course_id_legacy, section_id)
        else:
            # Create course_section
            teacher_id = str(course.get("teacherId") or "").strip()
            section_doc = {
                "courseCode": course_id_legacy,
                "courseName": course.get("name", ""),
                "semester": course.get("semester", ""),
                "degreeLevel": course.get("degreeLevel", "bachelor"),
                "ownerTeacherId": teacher_id,
            }
            result = await db.course_sections.insert_one(section_doc)
            section_id = str(result.inserted_id)
            stats["courses"] += 1
            logger.info("Created course_section: %s -> %s", course_id_legacy, section_id)

            # Enroll teacher
            if teacher_id:
                await db.enrollments.update_one(
                    {"courseSectionId": section_id, "userId": teacher_id},
                    {"$set": {"courseSectionId": section_id, "userId": teacher_id, "roleInCourse": "teacher"}},
                    upsert=True,
                )
                stats["enrollments"] += 1

        # Enroll students
        for student_item in course.get("studentList", []):
            sid = str(student_item.get("studentId") or student_item if isinstance(student_item, str) else "").strip()
            if not sid:
                continue
            # Try to resolve to a real user ID
            user_id = studentno_to_id.get(sid) or username_to_id.get(sid.lower()) or sid
            existing_enrollment = await db.enrollments.find_one(
                {"courseSectionId": section_id, "userId": user_id}
            )
            if not existing_enrollment:
                await db.enrollments.insert_one({
                    "courseSectionId": section_id,
                    "userId": user_id,
                    "roleInCourse": "student",
                })
                stats["enrollments"] += 1

        # Migrate assignments
        for assignment in course.get("assignments", []):
            a_id_legacy = str(assignment.get("id", "")).strip()
            if not a_id_legacy:
                continue

            existing_a = await db.assignments.find_one({
                "courseSectionId": section_id,
                "legacyId": a_id_legacy,
            })
            if existing_a:
                assignment_id = str(existing_a["_id"])
                logger.info("Assignment %s already migrated, skipping", a_id_legacy)
            else:
                a_doc = {
                    "courseSectionId": section_id,
                    "legacyId": a_id_legacy,
                    "title": assignment.get("title", ""),
                    "description": assignment.get("description", ""),
                    "dueAt": assignment.get("dueDate", ""),
                    "maxScore": 100,
                    "rubricSchema": assignment.get("rubric", {}),
                    "submissionType": "pdf",
                }
                result = await db.assignments.insert_one(a_doc)
                assignment_id = str(result.inserted_id)
                stats["assignments"] += 1
                logger.info("Created assignment: %s -> %s", a_id_legacy, assignment_id)

            # Migrate submissions
            for submission in assignment.get("submissions", []):
                s_id_legacy = str(submission.get("id", "")).strip()
                if not s_id_legacy:
                    continue

                existing_s = await db.submissions.find_one({
                    "assignmentId": assignment_id,
                    "legacyId": s_id_legacy,
                })
                if existing_s:
                    logger.info("Submission %s already migrated, skipping", s_id_legacy)
                    continue

                student_id = str(submission.get("studentId", "")).strip()
                user_id = studentno_to_id.get(student_id) or username_to_id.get(student_id.lower()) or student_id
                pdf_path = str(submission.get("pdfPath", "")).strip()

                # Create document record for PDF
                doc_id = None
                if pdf_path:
                    doc_record = {
                        "ownerType": "submission",
                        "ownerId": "",  # Updated below
                        "storageKey": pdf_path,
                        "filename": Path(pdf_path).name if pdf_path else "",
                        "mimeType": "application/pdf",
                        "pageCount": 0,
                        "checksum": hashlib.sha256(pdf_path.encode()).hexdigest()[:32],
                        "sourceType": "original",
                    }
                    result = await db.documents.insert_one(doc_record)
                    doc_id = str(result.inserted_id)
                    stats["documents"] += 1

                s_doc = {
                    "assignmentId": assignment_id,
                    "legacyId": s_id_legacy,
                    "studentId": user_id,
                    "studentName": submission.get("studentName", ""),
                    "status": submission.get("status", "pending"),
                    "submittedAt": submission.get("submittedAt", ""),
                    "attemptNo": 1,
                    "latestDocumentId": doc_id,
                    "latestGradeId": None,
                    "pdfPath": pdf_path,  # Keep for backward compat
                }
                result = await db.submissions.insert_one(s_doc)
                submission_id = str(result.inserted_id)
                stats["submissions"] += 1

                # Update document ownerId
                if doc_id:
                    await db.documents.update_one(
                        {"_id": require_object_id(doc_id, detail="Invalid inserted document id")},
                        {"$set": {"ownerId": submission_id}},
                    )

                logger.info("Created submission: %s -> %s", s_id_legacy, submission_id)

    logger.info("═══ Migration complete ═══")
    logger.info("Stats: %s", json.dumps(stats, indent=2))

    # Verify
    for coll_name in ["course_sections", "enrollments", "assignments", "submissions", "documents"]:
        count = await db[coll_name].count_documents({})
        logger.info("  %s: %d documents", coll_name, count)

    client.close()


if __name__ == "__main__":
    asyncio.run(migrate())
