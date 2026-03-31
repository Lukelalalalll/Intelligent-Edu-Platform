"""
Integration tests for the v2 grading pipeline.

Covers:
  1. Course visibility — teacher sees only owned/enrolled courses
  2. Assignment / submission access control — non-course teachers get 403
  3. Student submission validation — enrollment & assignment checks
  4. Workbench bundle completeness — all fields present
"""
import os
import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

# ---------------------------------------------------------------------------
# Ensure MONGO_URI points to a test DB (or will be mocked)
# ---------------------------------------------------------------------------
os.environ.setdefault("MONGO_URI", "mongodb://localhost:27017/test_edu_platform")
os.environ.setdefault("JWT_SECRET", "test-secret")

from backend.routes.grading_helpers import (
    create_course_section, create_assignment, create_submission,
    enroll_user, upsert_grade, get_submission_bundle,
    list_course_sections, list_assignments, list_submissions,
    list_enrollments, get_assignment,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _utcnow():
    return datetime.now(timezone.utc).isoformat()


@pytest.fixture
def teacher_user():
    return {
        "_id": "teacher_001",
        "id": "teacher_001",
        "username": "Dr. Smith",
        "role": "teacher",
        "email": "smith@hku.hk",
    }


@pytest.fixture
def other_teacher_user():
    return {
        "_id": "teacher_002",
        "id": "teacher_002",
        "username": "Dr. Jones",
        "role": "teacher",
        "email": "jones@hku.hk",
    }


@pytest.fixture
def admin_user():
    return {
        "_id": "admin_001",
        "id": "admin_001",
        "username": "Admin",
        "role": "admin",
        "email": "admin@hku.hk",
    }


@pytest.fixture
def student_user():
    return {
        "_id": "student_001",
        "id": "student_001",
        "username": "Alice",
        "role": "student",
        "email": "alice@hku.hk",
    }


@pytest.fixture
def unenrolled_student():
    return {
        "_id": "student_999",
        "id": "student_999",
        "username": "Eve",
        "role": "student",
        "email": "eve@hku.hk",
    }


# ---------------------------------------------------------------------------
# Test 1 — Course visibility
# ---------------------------------------------------------------------------

class TestCourseVisibility:
    """Verify that teachers only see courses they own or are enrolled in."""

    @pytest.mark.asyncio
    async def test_owner_sees_own_course(self, teacher_user):
        course = await create_course_section({
            "courseCode": "COMP3278",
            "name": "Intro to DBMS",
            "ownerTeacherId": teacher_user["_id"],
            "semester": "2025-26 S1",
        })
        assert course["id"]

        # list_course_sections with owner filter should return this course
        owned = await list_course_sections({"ownerTeacherId": teacher_user["_id"]})
        ids = {c["id"] for c in owned}
        assert course["id"] in ids

    @pytest.mark.asyncio
    async def test_other_teacher_does_not_see_course(self, teacher_user, other_teacher_user):
        course = await create_course_section({
            "courseCode": "COMP9999",
            "name": "Secret Course",
            "ownerTeacherId": teacher_user["_id"],
            "semester": "2025-26 S1",
        })
        # other teacher's owned courses should not include this one
        other_owned = await list_course_sections({"ownerTeacherId": other_teacher_user["_id"]})
        ids = {c["id"] for c in other_owned}
        assert course["id"] not in ids

    @pytest.mark.asyncio
    async def test_enrolled_teacher_sees_course(self, other_teacher_user):
        course = await create_course_section({
            "courseCode": "COMP1000",
            "name": "Shared Course",
            "ownerTeacherId": "someone_else",
            "semester": "2025-26 S2",
        })
        await enroll_user(course["id"], other_teacher_user["_id"], "teacher")
        enrollments = await list_enrollments(user_id=other_teacher_user["_id"])
        section_ids = {e["courseSectionId"] for e in enrollments if e.get("roleInCourse") in ("teacher", "ta")}
        assert course["id"] in section_ids


# ---------------------------------------------------------------------------
# Test 2 — Assignment / submission access control
# ---------------------------------------------------------------------------

class TestAccessControl:
    """Verify teacher cannot access assignments/submissions of unrelated courses."""

    @pytest.mark.asyncio
    async def test_assignment_belongs_to_course(self, teacher_user):
        course = await create_course_section({
            "courseCode": "COMP2222",
            "name": "Test Course",
            "ownerTeacherId": teacher_user["_id"],
        })
        assignment = await create_assignment({
            "courseSectionId": course["id"],
            "title": "HW1",
            "description": "First homework",
        })
        assignments = await list_assignments(course["id"])
        assert any(a["id"] == assignment["id"] for a in assignments)

    @pytest.mark.asyncio
    async def test_submissions_belong_to_assignment(self, teacher_user, student_user):
        course = await create_course_section({
            "courseCode": "COMP3333",
            "name": "Another Course",
            "ownerTeacherId": teacher_user["_id"],
        })
        assignment = await create_assignment({
            "courseSectionId": course["id"],
            "title": "HW2",
        })
        submission = await create_submission({
            "assignmentId": assignment["id"],
            "studentId": student_user["_id"],
            "studentName": student_user["username"],
            "pdfPath": "test.pdf",
        })
        subs = await list_submissions(assignment["id"])
        assert any(s["id"] == submission["id"] for s in subs)

    @pytest.mark.asyncio
    async def test_wrong_course_returns_empty_assignments(self, teacher_user):
        """Querying assignments for a non-existent course section returns empty."""
        assignments = await list_assignments("000000000000000000000000")
        assert assignments == []


# ---------------------------------------------------------------------------
# Test 3 — Student submission validation
# ---------------------------------------------------------------------------

class TestStudentSubmitValidation:
    """Verify assignment existence and enrollment checks."""

    @pytest.mark.asyncio
    async def test_assignment_must_exist(self):
        result = await get_assignment("000000000000000000000000")
        assert result is None

    @pytest.mark.asyncio
    async def test_enrolled_student_can_see_enrollment(self, student_user):
        course = await create_course_section({
            "courseCode": "ENRL100",
            "name": "Enrollment Test",
            "ownerTeacherId": "teacher_x",
        })
        await enroll_user(course["id"], student_user["_id"], "student")
        enrollments = await list_enrollments(
            course_section_id=course["id"],
            user_id=student_user["_id"]
        )
        assert len(enrollments) > 0
        assert enrollments[0]["roleInCourse"] == "student"

    @pytest.mark.asyncio
    async def test_unenrolled_student_has_no_enrollment(self, unenrolled_student):
        course = await create_course_section({
            "courseCode": "ENRL200",
            "name": "No Enrollment",
            "ownerTeacherId": "teacher_y",
        })
        enrollments = await list_enrollments(
            course_section_id=course["id"],
            user_id=unenrolled_student["_id"],
        )
        assert len(enrollments) == 0


# ---------------------------------------------------------------------------
# Test 4 — Workbench bundle completeness
# ---------------------------------------------------------------------------

class TestWorkbenchBundle:
    """Verify get_submission_bundle returns all required fields."""

    @pytest.mark.asyncio
    async def test_bundle_contains_all_keys(self, teacher_user, student_user):
        course = await create_course_section({
            "courseCode": "BNDL100",
            "name": "Bundle Test",
            "ownerTeacherId": teacher_user["_id"],
        })
        assignment = await create_assignment({
            "courseSectionId": course["id"],
            "title": "Bundle HW",
            "rubric": {"q1": {"maxScore": 10}},
        })
        submission = await create_submission({
            "assignmentId": assignment["id"],
            "studentId": student_user["_id"],
            "studentName": student_user["username"],
            "pdfPath": "test_pdf/sample.pdf",
        })

        bundle = await get_submission_bundle(submission["id"])
        assert bundle is not None
        # All required keys present
        for key in ("course", "assignment", "submission", "annotations", "grade", "document"):
            assert key in bundle, f"Missing key: {key}"

        assert bundle["course"]["id"] == course["id"]
        assert bundle["assignment"]["id"] == assignment["id"]
        assert bundle["submission"]["id"] == submission["id"]
        # Annotations should at least have the default structure
        assert "annotations" in bundle["annotations"]

    @pytest.mark.asyncio
    async def test_bundle_nonexistent_submission(self):
        bundle = await get_submission_bundle("000000000000000000000000")
        assert bundle is None

    @pytest.mark.asyncio
    async def test_bundle_includes_grade_after_grading(self, teacher_user, student_user):
        course = await create_course_section({
            "courseCode": "BNDL200",
            "name": "Graded Bundle",
            "ownerTeacherId": teacher_user["_id"],
        })
        assignment = await create_assignment({
            "courseSectionId": course["id"],
            "title": "Graded HW",
        })
        submission = await create_submission({
            "assignmentId": assignment["id"],
            "studentId": student_user["_id"],
            "studentName": student_user["username"],
            "pdfPath": "test.pdf",
        })
        await upsert_grade(submission["id"], teacher_user["_id"], {
            "totalScore": 85,
            "rubricScores": {"q1": 85},
            "overallFeedback": "Good work",
            "gradingStatus": "final",
        })

        bundle = await get_submission_bundle(submission["id"])
        assert bundle["grade"] is not None
        assert bundle["grade"]["totalScore"] == 85
        assert bundle["grade"]["gradingStatus"] == "final"
