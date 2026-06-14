import pytest

from backend.config import Config
from backend.core.config import Settings
from backend.services.llm_service.ai_session_service import sanitize_session_update_payload
from backend.schemas.ai import UpdateAiSessionSchema


def test_config_rejects_weak_keys_in_production(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("SECRET_KEY", "your-secret-key")
    monkeypatch.setenv("JWT_SECRET_KEY", "jwt-secret-key-change-this-in-prod")
    monkeypatch.setenv("JWT_COOKIE_SECURE", "true")
    monkeypatch.setenv("JWT_COOKIE_SAMESITE", "lax")

    cfg = Settings()
    with pytest.raises(SystemExit):
        cfg.validate_startup()


def test_session_update_rejects_oversized_attachment_metadata():
    huge_files = [{"file_name": "x" * 200, "mime_type": "application/pdf"} for _ in range(20)]
    payload = UpdateAiSessionSchema(
        title="Test",
        messages=[
            {"role": "user", "content": "hello", "files": huge_files},
            {"role": "assistant", "content": "world", "files": huge_files},
        ],
    )

    try:
        sanitize_session_update_payload(payload)
        assert False, "Expected ValueError for oversized metadata"
    except ValueError as exc:
        assert "Attachment metadata is too large" in str(exc)


def test_session_update_preserves_rich_message_fields():
    payload = UpdateAiSessionSchema(
        title="Test",
        messages=[
            {
                "role": "assistant",
                "content": "Answer",
                "reasoning": "Need to explain the intermediate steps.",
                "is_course_relevant": True,
                "citations": [
                    {
                        "index": 1,
                        "doc_name": "Lecture 3",
                        "score": 0.93,
                        "text": "Important evidence",
                        "source_type": "local",
                    }
                ],
                "ui_elements": [
                    {
                        "type": "file",
                        "url": "/download/ppt",
                        "file_name": "deck.pptx",
                        "preview_html_url": "/preview/ppt",
                    }
                ],
                "tool_progresses": [
                    {
                        "name": "RAG",
                        "status": "done",
                        "message": "Context ready",
                        "result": {"top_k": 4},
                    }
                ],
            }
        ],
    )

    sanitized = sanitize_session_update_payload(payload)
    message = sanitized["messages"][0]

    assert message["reasoning"] == "Need to explain the intermediate steps."
    assert message["is_course_relevant"] is True
    assert message["citations"][0]["doc_name"] == "Lecture 3"
    assert message["ui_elements"][0]["preview_html_url"] == "/preview/ppt"
    assert message["tool_progresses"][0]["result"]["top_k"] == 4
