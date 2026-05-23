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
