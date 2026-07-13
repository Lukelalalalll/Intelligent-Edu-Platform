import pytest
from pathlib import Path

from backend.apps.manifests import (
    CORE_APP_MANIFEST,
    HIGHLIGHTER_APP_MANIFEST,
    QUESTIONS_APP_MANIFEST,
    SLIDES_APP_MANIFEST,
    STUDY_NOTES_APP_MANIFEST,
    VIDEO_APP_MANIFEST,
    VISUAL_APP_MANIFEST,
)
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


def test_config_rejects_localhost_origins_in_production(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("SECRET_KEY", "A_Strong_Random_Secret_Value_1234567890!")
    monkeypatch.setenv("JWT_SECRET_KEY", "Another_Strong_Random_Secret_Value_0987654321!")
    monkeypatch.setenv("JWT_COOKIE_SECURE", "true")
    monkeypatch.setenv("JWT_COOKIE_SAMESITE", "none")
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:5173")

    cfg = Settings()
    with pytest.raises(SystemExit):
        cfg.validate_startup()


def test_repo_production_env_templates_are_sanitized():
    repo_root = Path(__file__).resolve().parents[2]
    backend_env = (repo_root / "backend" / ".env.production").read_text(encoding="utf-8")
    frontend_env = (repo_root / "frontend" / ".env.production").read_text(encoding="utf-8")

    assert "CHANGE_ME_TO_A_RANDOM_64_CHAR_STRING" in backend_env
    assert "CHANGE_ME_TO_A_DIFFERENT_RANDOM_64_CHAR_STRING" in backend_env
    assert "CHANGE_ME_TO_A_THIRD_RANDOM_64_CHAR_STRING" in backend_env
    assert "mongodb://USERNAME:PASSWORD@YOUR-MONGO-HOST:27017/intelligent_edu" in backend_env
    assert "https://your-vercel-app.vercel.app" in backend_env
    assert "https://your-backend.example.com" in frontend_env


def test_app_manifests_do_not_expose_uploads_or_data_mounts():
    manifests = (
        CORE_APP_MANIFEST,
        SLIDES_APP_MANIFEST,
        QUESTIONS_APP_MANIFEST,
        VISUAL_APP_MANIFEST,
        VIDEO_APP_MANIFEST,
        STUDY_NOTES_APP_MANIFEST,
        HIGHLIGHTER_APP_MANIFEST,
    )

    for manifest in manifests:
        mounted_prefixes = {prefix for prefix, _, _ in manifest.static_mounts}
        assert "/data" not in mounted_prefixes
        assert all(not prefix.startswith("/uploads/") for prefix in mounted_prefixes)


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
