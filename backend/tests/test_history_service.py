from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from bson import ObjectId
from fastapi import HTTPException

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


def test_serialize_history_doc_preserves_source_metadata():
    created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    payload = history_service.serialize_history_doc(
        {
            "_id": "abc123",
            "_tool_key": "slides",
            "_collection_name": "sub1_generation_history",
            "tool": "generate_render",
            "params": {"provider": "openai"},
            "source": {"source_filename": "stored.pdf", "source_display_name": "Lecture.pdf"},
            "result_preview": "preview",
            "created_at": created_at,
        }
    )

    assert payload["source"]["source_filename"] == "stored.pdf"
    assert payload["source"]["source_display_name"] == "Lecture.pdf"


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
    find_kwargs = find_many.await_args.kwargs
    assert find_args[0] == "video_generation_history"
    assert find_args[1]["user_id"] == "user-1"
    assert find_args[1]["deleted_at"] == {"$exists": False}
    assert "$or" in find_args[1]
    assert find_kwargs == {
        "projection": {"result_full": 0},
        "skip": 5,
        "limit": 5,
        "sort": [("created_at", -1)],
    }
    count.assert_awaited_once()


def test_enrich_slides_history_detail_uses_task_tracker(monkeypatch):
    get_task = AsyncMock(return_value={"request_id": "req-1", "status": "success", "steps": [{"step": "render", "status": "success"}]})
    monkeypatch.setattr(history_service.TaskTracker, "get_task", get_task)

    payload = asyncio.run(history_service.enrich_slides_history_detail({
        "params": {"request_id": "req-1"},
        "source": {
            "kind": "upload",
            "source_filename": "stored.pdf",
            "source_display_name": "Lecture.pdf",
            "source_download_url": "/api/slides/download_source/stored.pdf",
        },
        "result": '{"pptx_download_url": "/api/slides/download_ppt/deck.pptx", "page_count": 4}',
    }))

    assert payload["slides_detail"]["workflow"]["request_id"] == "req-1"
    assert payload["slides_detail"]["source_artifacts"]["source_display_name"] == "Lecture.pdf"
    assert payload["slides_detail"]["result_artifacts"]["pptx_download_url"] == "/api/slides/download_ppt/deck.pptx"


def test_enrich_slides_history_detail_supports_legacy_records(monkeypatch):
    get_task = AsyncMock(return_value=None)
    monkeypatch.setattr(history_service.TaskTracker, "get_task", get_task)

    payload = asyncio.run(history_service.enrich_slides_history_detail({
        "params": {
            "source_kind": "upload",
            "source_filename": "stored.pdf",
            "source_display_name": "Lecture.pdf",
            "base_style": "neon_tech",
        },
        "result": {
            "title": "Deck",
            "page_count": 4,
            "pptx_download_url": "/api/slides/download_ppt/deck.pptx",
            "html_preview_url": "/api/slides/download_html/deck.html",
        },
    }))

    assert payload["slides_detail"]["workflow"] is None
    assert payload["slides_detail"]["source_artifacts"]["source_download_url"] == "/api/slides/download_source/stored.pdf"
    assert payload["slides_detail"]["result_artifacts"]["pptx_filename"] == "deck.pptx"
    assert payload["slides_detail"]["result_artifacts"]["html_preview_filename"] == "deck.html"


def test_enrich_slides_history_detail_falls_back_to_persisted_workflow(monkeypatch):
    get_task = AsyncMock(return_value=None)
    monkeypatch.setattr(history_service.TaskTracker, "get_task", get_task)

    payload = asyncio.run(history_service.enrich_slides_history_detail({
        "params": {"request_id": "req-ppt-generator"},
        "source": {
            "workflow": {
                "request_id": "req-ppt-generator",
                "task_type": "ppt_generator_generate_v2",
                "status": "failed",
                "steps": [{"step": "outline", "status": "failed", "error": "boom"}],
            },
            "result_artifacts": {
                "pptx_download_url": "/api/slides/download_ppt/ppt-generator.pptx",
                "pptx_filename": "ppt-generator.pptx",
            },
        },
        "result": {"status": "failed", "error": "boom"},
    }))

    assert payload["slides_detail"]["workflow"]["task_type"] == "ppt_generator_generate_v2"
    assert payload["slides_detail"]["workflow"]["steps"][0]["step"] == "outline"
    assert payload["slides_detail"]["result_artifacts"]["pptx_filename"] == "ppt-generator.pptx"


def test_get_history_document_rejects_invalid_id_before_repo_lookup(monkeypatch):
    find_one = AsyncMock(return_value=None)
    monkeypatch.setattr(history_service.history_repo, "find_one", find_one)

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(
            history_service.get_history_document(
                tools=["slides"],
                history_id="not-a-history-object-id",
                user_id="user-1",
            )
        )

    assert excinfo.value.status_code == 400
    assert excinfo.value.detail == "Invalid history ID format"
    assert find_one.await_count == 0


def test_batch_soft_delete_history_filters_invalid_ids_but_keeps_valid_ones(monkeypatch):
    valid_id = str(ObjectId())
    update_many = AsyncMock(return_value=SimpleNamespace(modified_count=1))
    monkeypatch.setattr(history_service.history_repo, "update_many", update_many)

    result = asyncio.run(
        history_service.batch_soft_delete_history(
            tool="slides",
            history_ids=["bad-id", valid_id],
            user_id="user-1",
        )
    )

    assert result == 1
    update_args = update_many.await_args.args
    assert update_args[0] == "sub1_generation_history"
    assert update_args[1]["_id"] == {"$in": [ObjectId(valid_id)]}
    assert update_args[2]["$set"]["deleted_at"].tzinfo == timezone.utc


def test_batch_hard_delete_history_rejects_when_no_valid_ids(monkeypatch):
    delete_many = AsyncMock()
    monkeypatch.setattr(history_service.history_repo, "delete_many", delete_many)

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(
            history_service.batch_hard_delete_history(
                tool="slides",
                history_ids=["bad-id-1", "bad-id-2"],
            )
        )

    assert excinfo.value.status_code == 400
    assert excinfo.value.detail == "No valid IDs"
    assert delete_many.await_count == 0


def test_soft_delete_history_writes_aware_utc_deleted_at(monkeypatch):
    valid_id = str(ObjectId())
    update_one = AsyncMock(return_value=SimpleNamespace(modified_count=1))
    monkeypatch.setattr(history_service.history_repo, "update_one", update_one)

    result = asyncio.run(
        history_service.soft_delete_history(
            tool="slides",
            history_id=valid_id,
            user_id="user-1",
        )
    )

    assert result == 1
    update_args = update_one.await_args.args
    assert update_args[0] == "sub1_generation_history"
    assert update_args[1]["_id"] == ObjectId(valid_id)
    assert update_args[2]["$set"]["deleted_at"].tzinfo == timezone.utc


def test_save_history_record_writes_aware_utc_created_at(monkeypatch):
    insert_one = AsyncMock(return_value=None)
    monkeypatch.setattr(history_service.history_repo, "insert_one", insert_one)

    asyncio.run(
        history_service.save_history_record(
            tool="slides",
            user_id="user-1",
            params={"title": "Deck"},
            result_preview="preview",
            result_full={"ok": True},
            source={"source_filename": "deck.md"},
            tool_name="generate_render",
        )
    )

    insert_args = insert_one.await_args.args
    assert insert_args[0] == "sub1_generation_history"
    inserted = insert_args[1]
    assert inserted["created_at"].tzinfo == timezone.utc
    assert inserted["source"] == {"source_filename": "deck.md"}
    assert inserted["tool"] == "generate_render"
