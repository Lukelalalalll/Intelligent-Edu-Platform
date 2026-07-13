from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from bson import ObjectId

from backend.services.grading_service import orchestration


class _AsyncListCursor:
    def __init__(self, rows):
        self._rows = list(rows)

    def __aiter__(self):
        self._iter = iter(self._rows)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration as exc:
            raise StopAsyncIteration from exc


class _FakeDeleteCollection:
    def __init__(self, *, delete_many=None, rows=None):
        self.delete_many = delete_many or AsyncMock()
        self._rows = list(rows or [])

    def find(self, *args, **kwargs):
        return _AsyncListCursor(self._rows)


class _FakeTransactionContext:
    def __init__(self, recorder: dict[str, bool]):
        self._recorder = recorder

    async def __aenter__(self):
        self._recorder["transaction_started"] = True
        return self

    async def __aexit__(self, exc_type, exc, tb):
        self._recorder["transaction_aborted"] = exc_type is not None
        self._recorder["transaction_committed"] = exc_type is None


class _FakeSessionContext:
    def __init__(self, recorder: dict[str, bool]):
        self._recorder = recorder

    async def __aenter__(self):
        self._recorder["session_started"] = True
        return self

    async def __aexit__(self, exc_type, exc, tb):
        self._recorder["session_closed"] = True

    def start_transaction(self):
        return _FakeTransactionContext(self._recorder)


class _FakeClient:
    def __init__(self, recorder: dict[str, bool]):
        self._recorder = recorder

    async def start_session(self):
        return _FakeSessionContext(self._recorder)


def test_list_all_course_sections_collects_all_pages(monkeypatch):
    calls: list[tuple[int, int]] = []

    async def _fake_list_course_sections(_filter, *, page, page_size):
        calls.append((page, page_size))
        pages = {
            1: {"items": [{"id": "course-1"}], "total": 3, "page": 1, "page_size": page_size},
            2: {"items": [{"id": "course-2"}], "total": 3, "page": 2, "page_size": page_size},
            3: {"items": [{"id": "course-3"}], "total": 3, "page": 3, "page_size": page_size},
        }
        return pages[page]

    monkeypatch.setattr(
        orchestration.course_section_repo,
        "list_course_sections",
        _fake_list_course_sections,
    )

    items = asyncio.run(orchestration.list_all_course_sections({"ownerTeacherId": "teacher-1"}))

    assert [item["id"] for item in items] == ["course-1", "course-2", "course-3"]
    assert calls == [(1, 100), (2, 100), (3, 100)]


def test_list_all_assignments_collects_all_pages(monkeypatch):
    calls: list[tuple[int, int]] = []

    async def _fake_list_assignments(_course_section_id, *, page, page_size):
        calls.append((page, page_size))
        if page == 1:
            return {
                "items": [{"id": "assignment-1"}, {"id": "assignment-2"}],
                "total": 3,
                "page": 1,
                "page_size": page_size,
            }
        return {
            "items": [{"id": "assignment-3"}],
            "total": 3,
            "page": page,
            "page_size": page_size,
        }

    monkeypatch.setattr(
        orchestration.assignment_repo,
        "list_assignments",
        _fake_list_assignments,
    )

    items = asyncio.run(orchestration.list_all_assignments("course-1"))

    assert [item["id"] for item in items] == [
        "assignment-1",
        "assignment-2",
        "assignment-3",
    ]
    assert calls == [(1, 100), (2, 100)]


def test_find_submission_v2_handles_invalid_id_without_objectid_blowup(monkeypatch):
    monkeypatch.setattr(orchestration, "get_submission", AsyncMock(return_value=None))
    monkeypatch.setattr(
        orchestration,
        "find_submission",
        AsyncMock(return_value=("legacy-course", "legacy-assignment", "legacy-submission")),
    )

    result = asyncio.run(orchestration.find_submission_v2("not-an-object-id"))

    assert result == ("legacy-course", "legacy-assignment", "legacy-submission")


def test_delete_assignment_aborts_transaction_on_midstream_failure(monkeypatch):
    recorder = {
        "transaction_started": False,
        "transaction_aborted": False,
        "transaction_committed": False,
        "session_started": False,
        "session_closed": False,
    }
    session_sentinel = object()

    monkeypatch.setattr(orchestration, "_get_client", lambda: _FakeClient(recorder))
    monkeypatch.setattr(
        orchestration.assignment_repo,
        "get_assignment",
        AsyncMock(return_value={"id": "assignment-1"}),
    )
    delete_assignment = AsyncMock(return_value=True)
    monkeypatch.setattr(orchestration.assignment_repo, "delete_assignment", delete_assignment)

    submissions_find = _FakeDeleteCollection(
        rows=[
            {
                "_id": ObjectId(),
                "latestDocumentId": str(ObjectId()),
            }
        ]
    )
    grades = _FakeDeleteCollection()
    annotations = _FakeDeleteCollection(delete_many=AsyncMock(side_effect=RuntimeError("boom")))
    documents = _FakeDeleteCollection()
    submissions = SimpleNamespace(
        find=submissions_find.find,
        delete_many=AsyncMock(),
    )
    monkeypatch.setattr(
        orchestration,
        "db",
        SimpleNamespace(
            submissions=submissions,
            grades=grades,
            annotations=annotations,
            documents=documents,
        ),
    )

    with pytest.raises(RuntimeError, match="boom"):
        asyncio.run(orchestration.delete_assignment("assignment-1"))

    assert recorder["transaction_started"] is True
    assert recorder["transaction_aborted"] is True
    assert recorder["transaction_committed"] is False
    assert delete_assignment.await_count == 0


def test_mongo_transaction_context_aborts_on_exception(monkeypatch):
    recorder = {
        "transaction_started": False,
        "transaction_aborted": False,
        "transaction_committed": False,
        "session_started": False,
        "session_closed": False,
    }
    monkeypatch.setattr(orchestration, "_get_client", lambda: _FakeClient(recorder))

    async def _run():
        with pytest.raises(RuntimeError, match="force abort"):
            async with orchestration._mongo_transaction():
                raise RuntimeError("force abort")

    asyncio.run(_run())

    assert recorder["session_started"] is True
    assert recorder["session_closed"] is True
    assert recorder["transaction_started"] is True
    assert recorder["transaction_aborted"] is True
    assert recorder["transaction_committed"] is False
