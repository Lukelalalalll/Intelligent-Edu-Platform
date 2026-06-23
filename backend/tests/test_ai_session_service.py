from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
from bson import ObjectId

import backend.services.course_rag_service as course_rag_package
from backend.routes.ai_routes import rag_orchestrator
from backend.routes.ai_routes.memory import get_ai_role_info
from backend.routes.ai_routes.chat_models import ParsedRequest, RAGResult, StreamMeta
from backend.routes.ai_routes.chat_providers import SSE_DONE, generate_chat_response
from backend.schemas.ai import UpdateAiSessionSchema
from backend.services.ai import ai_session_service
from backend.services.llm_service.deepseek_service import DeepSeekService
from backend.repositories import ai_session_repo


async def test_get_session_for_user_returns_rich_message_fields(monkeypatch):
    session_oid = ObjectId()
    message_doc = {
        "role": "assistant",
        "content": "Here is the answer.",
        "reasoning": "First retrieve context, then summarize it.",
        "is_course_relevant": True,
        "images": ["data:image/png;base64,abc"],
        "files": [{"file_name": "notes.pdf", "mime_type": "application/pdf"}],
        "citations": [{"index": 1, "doc_name": "Lecture 3", "score": 0.9, "text": "Evidence"}],
        "ui_elements": [{"type": "file", "url": "/download/deck", "file_name": "deck.pptx"}],
        "tool_progresses": [{"name": "RAG", "status": "done", "message": "Context ready"}],
    }

    async def fake_load_session_doc(session_id: str):
        return session_oid, {
            "_id": session_oid,
            "userId": "user-1",
            "title": "Test Session",
            "messages": [],
            "bucketCount": 1,
            "createdAt": "created",
            "updatedAt": "updated",
        }

    async def fake_load_all_messages(session_id: str, inline_messages: list[dict]):
        return [message_doc]

    monkeypatch.setattr(ai_session_service, "_load_session_doc", fake_load_session_doc)
    monkeypatch.setattr(ai_session_service, "load_all_messages", fake_load_all_messages)

    result = await ai_session_service.get_session_for_user(session_id=str(session_oid), user_id="user-1")
    message = result["messages"][0]

    assert message["content"] == "Here is the answer."
    assert message["reasoning"] == "First retrieve context, then summarize it."
    assert message["is_course_relevant"] is True
    assert message["files"][0]["file_name"] == "notes.pdf"
    assert message["citations"][0]["doc_name"] == "Lecture 3"
    assert message["ui_elements"][0]["file_name"] == "deck.pptx"
    assert message["tool_progresses"][0]["status"] == "done"


async def test_get_session_for_user_returns_tail_window_and_history_start(monkeypatch):
    session_oid = ObjectId()
    all_messages = [{"role": "user", "content": f"m-{idx}"} for idx in range(20)]

    async def fake_load_session_doc(session_id: str):
        return session_oid, {
            "_id": session_oid,
            "userId": "user-1",
            "title": "Tail Session",
            "messages": [],
            "bucketCount": 1,
            "messageCount": len(all_messages),
            "createdAt": "created",
            "updatedAt": "updated",
        }

    async def fake_load_all_messages(session_id: str, inline_messages: list[dict]):
        return list(all_messages)

    monkeypatch.setattr(ai_session_service, "_load_session_doc", fake_load_session_doc)
    monkeypatch.setattr(ai_session_service, "load_all_messages", fake_load_all_messages)

    result = await ai_session_service.get_session_for_user(
        session_id=str(session_oid),
        user_id="user-1",
        limit=5,
    )

    assert [msg["content"] for msg in result["messages"]] == [f"m-{idx}" for idx in range(15, 20)]
    assert result["historyStart"] == 15
    assert result["hasMoreMessages"] is True
    assert result["messageCount"] == 20


async def test_generate_chat_response_uses_forced_response_before_provider_dispatch(monkeypatch):
    async def unexpected_provider(*args, **kwargs):
        raise AssertionError("provider dispatch should not run when forced response is present")
        yield ""  # pragma: no cover

    telemetry_phases: list[str] = []

    async def fake_record_chat_telemetry(**kwargs):
        telemetry_phases.append(kwargs["phase"])

    monkeypatch.setattr("backend.routes.ai_routes.chat_providers._generate_via_local_ollama", unexpected_provider)
    monkeypatch.setattr("backend.routes.ai_routes.chat_providers._generate_via_deepseek", unexpected_provider)
    monkeypatch.setattr("backend.routes.ai_routes.chat_providers._generate_via_coze", unexpected_provider)
    monkeypatch.setattr("backend.routes.ai_routes.chat_providers.record_chat_telemetry", fake_record_chat_telemetry)

    req = ParsedRequest(
        latest_user_message="Explain this concept",
        prompt_only_message="Explain this concept",
        uploaded_attachment_text="",
        effective_question="Explain this concept",
        latest_user_images=[],
        tutor_mode="tutor",
        requested_provider="coze",
        resolved_provider="coze",
        role="student",
        is_student=True,
        user={},
        user_id="user-1",
        cleaned_messages=[{"role": "user", "content": "Explain this concept"}],
        compact_history=[],
        memory_text="",
    )
    rag = RAGResult(forced_response_message="I do not have enough evidence to answer that.")
    meta = StreamMeta(provider="coze", requested_provider="coze", tutor_mode="tutor")

    frames = [frame async for frame in generate_chat_response(req, rag, meta, {})]
    forced_text = "".join(
        json.loads(frame.removeprefix("data: ").strip())["choices"][0]["delta"]["content"]
        for frame in frames
        if "\"delta\"" in frame
    )

    assert any("insufficient_evidence" in frame for frame in frames)
    assert forced_text == "I do not have enough evidence to answer that."
    assert frames[-1] == SSE_DONE
    assert telemetry_phases == ["insufficient_evidence"]


def test_deepseek_service_from_config_prefers_user_values(monkeypatch):
    monkeypatch.setattr("backend.services.llm_service.deepseek_service.Config.DEEPSEEK_API_KEY", "env-key")
    monkeypatch.setattr("backend.services.llm_service.deepseek_service.Config.DEEPSEEK_BASE_URL", "https://env.example")
    monkeypatch.setattr("backend.services.llm_service.deepseek_service.Config.DEEPSEEK_MODEL", "env-model")

    service = DeepSeekService.from_config(
        {
            "api_key": "user-key",
            "base_url": "https://user.example/v1/",
            "model": "user-model",
            "reasoning_effort": "low",
            "thinking_type": "disabled",
        }
    )
    assert service.api_key == "user-key"
    assert service._chat_url == "https://user.example/v1/chat/completions"
    assert service.model == "user-model"

    payload: dict = {}
    service._apply_reasoning_options(payload)
    assert payload == {}

    fallback = DeepSeekService.from_config({"api_key": "", "base_url": "", "model": ""})
    assert fallback.api_key == "env-key"
    assert fallback.base_url == "https://env.example"
    assert fallback.model == "env-model"


async def test_generate_chat_response_uses_deepseek_user_config(monkeypatch):
    user_config = {
        "api_key": "user-key",
        "base_url": "https://user.example",
        "model": "user-model",
        "reasoning_effort": "medium",
        "thinking_type": "enabled",
    }
    seen: dict = {}

    async def fake_load_deepseek_runtime_config(user: dict):
        seen["user"] = user
        return user_config

    class FakeDeepSeekService:
        @classmethod
        def from_config(cls, config: dict):
            seen["config"] = config
            return cls()

        async def chat_stream(self, message: str, context: dict | None = None, *, enable_thinking: bool = True):
            seen["message"] = message
            seen["enable_thinking"] = enable_thinking
            yield "DeepSeek says hi"

    async def fake_record_chat_telemetry(**kwargs):
        seen["phase"] = kwargs["phase"]

    monkeypatch.setattr(
        "backend.services.auth.user_profile_service.load_deepseek_runtime_config",
        fake_load_deepseek_runtime_config,
    )
    monkeypatch.setattr(
        "backend.services.llm_service.deepseek_service.DeepSeekService",
        FakeDeepSeekService,
    )
    monkeypatch.setattr(
        "backend.routes.ai_routes.chat_providers.record_chat_telemetry",
        fake_record_chat_telemetry,
    )

    req = ParsedRequest(
        latest_user_message="Hello",
        prompt_only_message="Hello",
        uploaded_attachment_text="",
        effective_question="Hello",
        latest_user_images=[],
        tutor_mode="tutor",
        requested_provider="deepseek",
        resolved_provider="deepseek",
        role="teacher",
        is_student=False,
        user={"_id": "user-1"},
        user_id="user-1",
        cleaned_messages=[{"role": "user", "content": "Hello"}],
        compact_history=[],
        memory_text="",
    )
    rag = RAGResult()
    meta = StreamMeta(provider="deepseek", requested_provider="deepseek", tutor_mode="tutor")

    frames = [frame async for frame in generate_chat_response(req, rag, meta, {})]

    assert seen["user"] == {"_id": "user-1"}
    assert seen["config"] == user_config
    assert seen["message"] == "Hello"
    assert seen["enable_thinking"] is False
    assert seen["phase"] == "answer_deepseek"
    assert any("DeepSeek says hi" in frame for frame in frames)
    assert frames[-1] == SSE_DONE


async def test_create_session_for_user_initializes_revision(monkeypatch):
    inserted: dict = {}

    async def fake_insert_session(document: dict):
        inserted["document"] = document
        return SimpleNamespace(inserted_id=ObjectId())

    monkeypatch.setattr(ai_session_service.ai_session_repo, "insert_session", fake_insert_session)

    result = await ai_session_service.create_session_for_user(
        user_id=str(ObjectId()),
        system_content="System prompt",
    )

    assert inserted["document"]["revision"] == 0
    assert result["revision"] == 0


async def test_update_session_for_user_allows_legacy_session_without_revision(monkeypatch):
    session_oid = ObjectId()
    seen: dict = {}

    async def fake_load_session_doc(session_id: str):
        return session_oid, {
            "_id": session_oid,
            "userId": "user-1",
            "title": "Legacy Session",
            "messages": [],
        }

    async def fake_save_messages_bucketed(session_id: str, messages: list[dict]):
        seen["bucket_session_id"] = session_id
        seen["bucket_messages"] = messages
        return {
            "inline_messages": messages,
            "bucket_count": 0,
        }

    async def fake_update_with_revision(*, session_id, current_revision: int, update_fields: dict):
        seen["session_id"] = session_id
        seen["current_revision"] = current_revision
        seen["update_fields"] = update_fields
        return SimpleNamespace(matched_count=1, modified_count=1)

    async def fake_sync_assets(user_id: str):
        seen["asset_user_id"] = user_id

    monkeypatch.setattr(ai_session_service, "_load_session_doc", fake_load_session_doc)
    monkeypatch.setattr(ai_session_service, "save_messages_bucketed", fake_save_messages_bucketed)
    monkeypatch.setattr(ai_session_service.ai_session_repo, "update_with_revision", fake_update_with_revision)
    monkeypatch.setattr(ai_session_service, "ensure_ai_session_image_assets", fake_sync_assets)

    payload = UpdateAiSessionSchema(
        title="Updated",
        messages=[
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there"},
        ],
    )

    result = await ai_session_service.update_session_for_user(
        session_id=str(session_oid),
        payload=payload,
        user={"id": "user-1", "_id": "user-1"},
        request_id="req-1",
        idempotency_key="",
    )

    assert result == {"ok": True}
    assert seen["current_revision"] == 0
    assert seen["update_fields"]["revision"] == 1
    assert seen["bucket_messages"][0]["content"] == "Hello"
    assert seen["asset_user_id"] == "user-1"


async def test_update_session_for_user_appends_without_rewriting_buckets(monkeypatch):
    session_oid = ObjectId()
    seen: dict = {}
    existing_messages = [
        {"role": "system", "content": "System"},
        {"role": "user", "content": "Hello"},
    ]

    async def fake_load_session_doc(session_id: str):
        return session_oid, {
            "_id": session_oid,
            "userId": "user-1",
            "title": "Existing Session",
            "messages": list(existing_messages),
            "bucketCount": 2,
            "messageCount": len(existing_messages),
            "revision": 3,
        }

    async def fake_load_all_messages(session_id: str, inline_messages: list[dict]):
        return list(existing_messages)

    async def fake_append_messages_bucketed(session_id: str, delta_messages: list[dict], *, existing_inline_messages, existing_bucket_count):
        seen["append_session_id"] = session_id
        seen["delta_messages"] = delta_messages
        seen["existing_inline_messages"] = existing_inline_messages
        seen["existing_bucket_count"] = existing_bucket_count
        return {"inline_messages": existing_inline_messages + delta_messages, "bucket_count": existing_bucket_count}

    async def fake_save_messages_bucketed(session_id: str, messages: list[dict]):
        raise AssertionError("full rewrite should not be used for pure append")

    async def fake_update_with_revision(*, session_id, current_revision: int, update_fields: dict):
        seen["update_fields"] = update_fields
        return SimpleNamespace(matched_count=1, modified_count=1)

    async def fake_sync_assets(user_id: str):
        seen["asset_user_id"] = user_id

    monkeypatch.setattr(ai_session_service, "_load_session_doc", fake_load_session_doc)
    monkeypatch.setattr(ai_session_service, "load_all_messages", fake_load_all_messages)
    monkeypatch.setattr(ai_session_service, "append_messages_bucketed", fake_append_messages_bucketed)
    monkeypatch.setattr(ai_session_service, "save_messages_bucketed", fake_save_messages_bucketed)
    monkeypatch.setattr(ai_session_service.ai_session_repo, "update_with_revision", fake_update_with_revision)
    monkeypatch.setattr(ai_session_service, "ensure_ai_session_image_assets", fake_sync_assets)

    payload = UpdateAiSessionSchema(
        messages=[
            {"role": "assistant", "content": "Hi there"},
        ],
        history_start=2,
    )

    result = await ai_session_service.update_session_for_user(
        session_id=str(session_oid),
        payload=payload,
        user={"id": "user-1", "_id": "user-1"},
        request_id="req-append",
        idempotency_key="",
    )

    assert result == {"ok": True}
    assert seen["delta_messages"] == [{"role": "assistant", "content": "Hi there", "reasoning": "", "images": [], "files": [], "citations": [], "ui_elements": [], "tool_progresses": []}]
    assert seen["update_fields"]["messageCount"] == 3
    assert seen["update_fields"]["bucketCount"] == 2
    assert seen["asset_user_id"] == "user-1"


async def test_update_with_revision_matches_legacy_revisionless_sessions(monkeypatch):
    seen: dict = {}
    session_oid = ObjectId()

    class FakeCollection:
        async def update_one(self, filt: dict, update: dict):
            seen["filter"] = filt
            seen["update"] = update
            return SimpleNamespace(matched_count=1, modified_count=1)

    monkeypatch.setattr(ai_session_repo.db, "ai_chat_sessions", FakeCollection(), raising=False)

    await ai_session_repo.update_with_revision(
        session_id=session_oid,
        current_revision=0,
        update_fields={"revision": 1, "title": "Updated"},
    )

    assert seen["filter"] == {
        "_id": session_oid,
        "$or": [
            {"revision": 0},
            {"revision": {"$exists": False}},
        ],
    }
    assert seen["update"] == {"$set": {"revision": 1, "title": "Updated"}}


@pytest.mark.parametrize(
    "question",
    [
        "Hello",
        "hi",
        "娴嬭瘯涓€涓?deepseek",
        "who are you are you deepseek",
        "浣犳槸璋?,
        "浣犳槸 deepseek 鍚?,
    ],
)
async def test_run_student_rag_does_not_force_response_for_small_talk(monkeypatch, question: str):
    rag_orchestrator._enrollment_cache.clear()

    async def fake_get_user_course_profile(user: dict) -> dict:
        return {"courses": []}

    monkeypatch.setattr(
        "backend.services.student.enrollment_service.get_user_course_profile",
        fake_get_user_course_profile,
    )

    result = await rag_orchestrator.run_student_rag(
        user={"id": "user-1", "_id": "user-1", "role": "student"},
        effective_question=question,
        uploaded_attachment_text="",
        tutor_mode="tutor",
        resolved_provider="deepseek",
        cleaned_messages=[{"role": "user", "content": question}],
    )

    assert result["forced_response_message"] == ""
    assert result["rag_empty_after_retry"] is False


async def test_run_student_rag_falls_back_gracefully_when_no_course_materials_exist(monkeypatch):
    rag_orchestrator._enrollment_cache.clear()

    async def fake_get_user_course_profile(user: dict) -> dict:
        return {"courses": []}

    monkeypatch.setattr(
        "backend.services.student.enrollment_service.get_user_course_profile",
        fake_get_user_course_profile,
    )

    result = await rag_orchestrator.run_student_rag(
        user={"id": "user-1", "_id": "user-1", "role": "student"},
        effective_question="Please explain lecture 3 on Bayes theorem",
        uploaded_attachment_text="",
        tutor_mode="tutor",
        resolved_provider="deepseek",
        cleaned_messages=[{"role": "user", "content": "Please explain lecture 3 on Bayes theorem"}],
    )

    assert result["forced_response_message"] == ""
    assert result["rag_empty_after_retry"] is False
    assert result["fallback_reason"] == "no_course_materials"
    assert result["is_course_relevant"] is False


async def test_run_student_rag_marks_empty_retrieval_without_forcing_hard_refusal(monkeypatch):
    rag_orchestrator._enrollment_cache.clear()

    async def fake_get_user_course_profile(user: dict) -> dict:
        return {"courses": [{"courseId": "course-1"}]}

    async def fake_retrieve_for_student_detailed(**kwargs):
        return SimpleNamespace(
            results=[],
            retrieval_plan={},
            retrieval_trace=[],
            retrieval_confidence={},
            fallback_reason="",
            evidence_spans=[],
            latency_ms=3.2,
        )

    monkeypatch.setattr(
        "backend.services.student.enrollment_service.get_user_course_profile",
        fake_get_user_course_profile,
    )
    monkeypatch.setattr(
        course_rag_package,
        "course_rag_service",
        SimpleNamespace(
            get_indexed_courses_for_student=lambda user_id: ["course-1"],
            retrieve_for_student_detailed=fake_retrieve_for_student_detailed,
        ),
        raising=False,
    )

    result = await rag_orchestrator.run_student_rag(
        user={"id": "user-1", "_id": "user-1", "role": "student"},
        effective_question="Please explain lecture 3 on Bayes theorem",
        uploaded_attachment_text="",
        tutor_mode="tutor",
        resolved_provider="deepseek",
        cleaned_messages=[{"role": "user", "content": "Please explain lecture 3 on Bayes theorem"}],
    )

    assert result["forced_response_message"] == ""
    assert result["rag_empty_after_retry"] is True
    assert result["fallback_reason"] == "no_relevant_course_evidence"
    assert result["is_course_relevant"] is False


async def test_run_student_rag_preserves_course_grounding_when_retrieval_hits(monkeypatch):
    rag_orchestrator._enrollment_cache.clear()

    async def fake_get_user_course_profile(user: dict) -> dict:
        return {"courses": [{"courseId": "course-1"}]}

    async def fake_retrieve_for_student_detailed(**kwargs):
        return SimpleNamespace(
            results=[
                {
                    "course_id": "course-1",
                    "doc_name": "Lecture 3",
                    "score": 0.92,
                    "retrieval_score": 0.92,
                    "raw_vector_score": 0.92,
                    "text": "Bayes theorem updates prior belief with observed evidence.",
                }
            ],
            retrieval_plan={"query_class": "concept/explanation"},
            retrieval_trace=[{"stage": "dense", "count": 1}],
            retrieval_confidence={"label": "confident", "score": 0.91},
            fallback_reason="",
            evidence_spans=[{"doc_name": "Lecture 3", "source_type": "course"}],
            latency_ms=4.8,
        )

    monkeypatch.setattr(
        "backend.services.student.enrollment_service.get_user_course_profile",
        fake_get_user_course_profile,
    )
    monkeypatch.setattr(
        course_rag_package,
        "course_rag_service",
        SimpleNamespace(
            get_indexed_courses_for_student=lambda user_id: ["course-1"],
            retrieve_for_student_detailed=fake_retrieve_for_student_detailed,
        ),
        raising=False,
    )

    result = await rag_orchestrator.run_student_rag(
        user={"id": "user-1", "_id": "user-1", "role": "student"},
        effective_question="Explain Bayes theorem",
        uploaded_attachment_text="",
        tutor_mode="tutor",
        resolved_provider="deepseek",
        cleaned_messages=[{"role": "user", "content": "Explain Bayes theorem"}],
    )

    assert result["forced_response_message"] == ""
    assert result["rag_empty_after_retry"] is False
    assert result["fallback_reason"] == ""
    assert result["is_course_relevant"] is True
    assert result["rag_citations"]


async def test_get_ai_role_info_only_counts_indexed_courses_from_user_profile(monkeypatch):
    async def fake_get_user_course_profile(user: dict) -> dict:
        return {
            "courses": [
                {"courseId": "course-2"},
                {"courseId": "course-3"},
            ]
        }

    monkeypatch.setattr(
        course_rag_package,
        "course_rag_service",
        SimpleNamespace(get_indexed_courses_for_student=lambda user_id: ["course-1", "course-3"]),
        raising=False,
    )
    monkeypatch.setattr(
        "backend.services.student.enrollment_service.get_user_course_profile",
        fake_get_user_course_profile,
    )

    result = await get_ai_role_info(user={"id": "user-1", "_id": "user-1", "role": "student"})

    assert result["rag_active"] is True
    assert result["rag_courses"] == ["course-3"]

