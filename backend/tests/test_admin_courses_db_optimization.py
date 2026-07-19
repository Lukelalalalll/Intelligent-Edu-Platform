from __future__ import annotations

import pytest
from bson import ObjectId

from backend.routes.admin_routes import courses


class _AsyncSequenceCursor:
    def __init__(self, docs: list[dict]):
        self._docs = list(docs)
        self._iter = iter(())

    def __aiter__(self):
        self._iter = iter(self._docs)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration as exc:
            raise StopAsyncIteration from exc


@pytest.mark.asyncio
async def test_relations_overview_streams_all_users_without_fixed_2000_cap(monkeypatch):
    users = [
        {
            "_id": ObjectId(),
            "role": "teacher",
            "username": f"teacher-{idx}",
            "email": f"teacher-{idx}@example.com",
            "teacherCourseIds": [f"course-{idx}"],
        }
        for idx in range(5)
    ] + [
        {
            "_id": ObjectId(),
            "role": "student",
            "username": f"student-{idx}",
            "email": f"student-{idx}@example.com",
            "studentId": f"S{idx:04d}",
        }
        for idx in range(2001)
    ]
    captured: dict[str, object] = {}

    def _fake_find_users_cursor(*, filt=None, projection=None, sort=None):
        captured["filt"] = filt
        captured["projection"] = projection
        captured["sort"] = sort
        return _AsyncSequenceCursor(users)

    async def _fake_load_courses_payload():
        return {"courses": [{"courseId": "course-0", "name": "Algorithms"}]}

    monkeypatch.setattr(courses.user_repo, "find_users_cursor", _fake_find_users_cursor)
    monkeypatch.setattr(courses, "_load_courses_payload", _fake_load_courses_payload)

    result = await courses.get_relations_overview(admin={"_id": ObjectId()})

    assert captured == {
        "filt": None,
        "projection": {"username": 1, "email": 1, "role": 1, "teacherCourseIds": 1, "studentId": 1, "id": 1},
        "sort": [("role", 1), ("username", 1)],
    }
    assert len(result["teachers"]) == 5
    assert len(result["students"]) == 2001
    assert result["teachers"][0] == {
        "id": str(users[0]["_id"]),
        "username": "teacher-0",
        "email": "teacher-0@example.com",
        "teacherCourseIds": ["course-0"],
    }
    assert result["students"][-1]["studentId"] == "S2000"
    assert result["courses"] == [{"courseId": "course-0", "name": "Algorithms"}]
