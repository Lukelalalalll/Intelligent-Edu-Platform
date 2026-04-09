from backend.config import Config
from backend.services.ai_session_service import sanitize_session_update_payload
from backend.schemas.ai import UpdateAiSessionSchema


def test_config_rejects_weak_keys_in_production(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    old_secret = Config.SECRET_KEY
    old_jwt = Config.JWT_SECRET_KEY
    old_secure = Config.JWT_COOKIE_SECURE
    old_samesite = Config.JWT_COOKIE_SAMESITE

    Config.SECRET_KEY = "your-secret-key"
    Config.JWT_SECRET_KEY = "jwt-secret-key-change-this-in-prod"
    Config.JWT_COOKIE_SECURE = True
    Config.JWT_COOKIE_SAMESITE = "lax"

    try:
        try:
            Config.validate_startup()
            assert False, "Expected SystemExit for weak production keys"
        except SystemExit:
            pass
    finally:
        Config.SECRET_KEY = old_secret
        Config.JWT_SECRET_KEY = old_jwt
        Config.JWT_COOKIE_SECURE = old_secure
        Config.JWT_COOKIE_SAMESITE = old_samesite


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
