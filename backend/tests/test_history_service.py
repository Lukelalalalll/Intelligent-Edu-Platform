from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock

from backend.services import history_service


def test_serialize_history_doc_includes_tool_collection_and_result():
    created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    payload = history_service.serialize_history_doc(
        {
            "_id": "abc123",
            "_tool_key": "questions",
            "_collection_name": "sub2_generation_history",
            "tool": "generate_questions",
            "params": {"filename": "sheet.pdf"},
            "source": {"file_name": "sheet.pdf"},
            "result_preview": "preview",
            "result_full": "full-result",
            "created_at": created_at,
        },
        include_result=True,
    )

    assert payload["id"] == "abc123"
    assert payload["tool"] == "generate_questions"
    assert payload["tool_key"] == "questions"
    assert payload["collection"] == "sub2_generation_history"
    assert payload["result"] == "full-result"
    assert payload["created_at"] == created_at.isoformat()


def test_list_history_single_tool_uses_shared_repo(monkeypatch):
    docs = [{"_id": "doc1", "created_at": datetime.now(timezone.utc)}]
    find_many = AsyncMock(return_value=docs)
    count = AsyncMock(return_value=7)

    monkeypatch.setattr(history_service.history_repo, "find_many", find_many)
    monkeypatch.setattr(history_service.history_repo, "count", count)

    items, total = asyncio.run(
        history_service.list_history(
            tools=["video"],
            user_id="user-1",
            page=2,
            page_size=5,
            search="clip",
        )
    )

    assert total == 7
    assert items[0]["_tool_key"] == "video"
    assert items[0]["_collection_name"] == "video_generation_history"

    find_args = find_many.await_args.args
    assert find_args[0] == "video_generation_history"
    assert find_args[1]["user_id"] == "user-1"
    assert find_args[1]["deleted_at"] == {"$exists": False}
    assert "$or" in find_args[1]
    count.assert_awaited_once()
