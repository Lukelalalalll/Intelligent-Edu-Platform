from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from bson import ObjectId

from backend.services.homework import homework_service


@pytest.mark.asyncio
async def test_publish_homework_writes_aware_utc_created_at(monkeypatch):
    insert_homework = AsyncMock(return_value=SimpleNamespace(inserted_id=ObjectId()))
    create_assignment = AsyncMock(return_value=None)
    deadline = datetime(2026, 7, 1, 9, 0, tzinfo=timezone.utc)

    monkeypatch.setattr(homework_service.homework_repo, "insert_homework", insert_homework)
    monkeypatch.setattr(homework_service, "create_assignment", create_assignment)

    result = await homework_service.publish_homework(
        homework=SimpleNamespace(
            course_id="course-1",
            title="Essay 1",
            description="Write an essay",
            required_file_types=[".pdf"],
            deadline=deadline,
        ),
        current_user={"_id": ObjectId(), "role": "teacher"},
    )

    inserted = insert_homework.await_args.args[0]
    assert inserted["created_at"].tzinfo == timezone.utc
    assert result.created_at.tzinfo == timezone.utc


@pytest.mark.asyncio
async def test_submit_homework_writes_aware_utc_submitted_at(monkeypatch):
    homework_id = str(ObjectId())
    student_id = ObjectId()
    insert_submission = AsyncMock(return_value=SimpleNamespace(inserted_id=ObjectId()))

    monkeypatch.setattr(
        homework_service.homework_repo,
        "find_homework_by_id",
        AsyncMock(return_value={"_id": ObjectId(homework_id), "required_file_types": [".pdf"]}),
    )
    monkeypatch.setattr(homework_service.homework_repo, "insert_submission", insert_submission)
    monkeypatch.setattr(
        homework_service,
        "_save_submission_file",
        lambda **_kwargs: "uploads/homeworks/work.pdf",
    )

    result = await homework_service.submit_homework(
        homework_id=homework_id,
        filename="work.pdf",
        content=b"pdf",
        current_user={"_id": student_id, "role": "student"},
    )

    inserted = insert_submission.await_args.args[0]
    assert inserted["submitted_at"].tzinfo == timezone.utc
    assert result.submitted_at.tzinfo == timezone.utc
