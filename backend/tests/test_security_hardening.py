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
from backend.routes.questions_routes import questions_router


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
    monkeypatch.setenv("INTERNAL_GATEWAY_TOKEN", "Gateway_Token_Value_7F2k9Qm4Lp8Vz3Nx6Rb5Ty1C")
    monkeypatch.setenv("JWT_COOKIE_SECURE", "true")
    monkeypatch.setenv("JWT_COOKIE_SAMESITE", "none")
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:5173")

    cfg = Settings()
    with pytest.raises(SystemExit):
        cfg.validate_startup()


def test_config_defaults_db_console_off_in_production(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("SECRET_KEY", "Primary_Key_Value_7F2k9Qm4Lp8Vz3Nx6Rb5Ty1C")
    monkeypatch.setenv("JWT_SECRET_KEY", "Jwt_Key_Value_8G3l0Rn5Mq9Wa4Oy7Sc6Uz2D")
    monkeypatch.setenv("INTERNAL_GATEWAY_TOKEN", "Gateway_Token_Value_9H4m1So6Nr0Xb5Pz8Td7Va3E")
    monkeypatch.setenv("JWT_COOKIE_SECURE", "true")
    monkeypatch.setenv("JWT_COOKIE_SAMESITE", "none")
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://edu.example.com")
    monkeypatch.delenv("ADMIN_DB_CONSOLE_ENABLED", raising=False)

    cfg = Settings()

    assert cfg.ADMIN_DB_CONSOLE_ENABLED is False
    cfg.validate_startup()


def test_config_rejects_internal_gateway_token_missing_in_production(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("SECRET_KEY", "Primary_Key_Value_7F2k9Qm4Lp8Vz3Nx6Rb5Ty1C")
    monkeypatch.setenv("JWT_SECRET_KEY", "Jwt_Key_Value_8G3l0Rn5Mq9Wa4Oy7Sc6Uz2D")
    monkeypatch.delenv("INTERNAL_GATEWAY_TOKEN", raising=False)
    monkeypatch.setenv("JWT_COOKIE_SECURE", "true")
    monkeypatch.setenv("JWT_COOKIE_SAMESITE", "none")
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://edu.example.com")

    cfg = Settings()
    with pytest.raises(SystemExit):
        cfg.validate_startup()


def test_config_rejects_production_auth_bypass_and_content_fetch(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("SECRET_KEY", "Primary_Key_Value_7F2k9Qm4Lp8Vz3Nx6Rb5Ty1C")
    monkeypatch.setenv("JWT_SECRET_KEY", "Jwt_Key_Value_8G3l0Rn5Mq9Wa4Oy7Sc6Uz2D")
    monkeypatch.setenv("INTERNAL_GATEWAY_TOKEN", "Gateway_Token_Value_9H4m1So6Nr0Xb5Pz8Td7Va3E")
    monkeypatch.setenv("JWT_COOKIE_SECURE", "true")
    monkeypatch.setenv("JWT_COOKIE_SAMESITE", "none")
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://edu.example.com")
    monkeypatch.setenv("VITE_DISABLE_AUTH", "true")
    monkeypatch.setenv("SEARXNG_FETCH_CONTENT", "true")

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


def test_known_hardcoded_provider_tokens_removed():
    repo_root = Path(__file__).resolve().parents[2]
    checked_files = [
        repo_root / "backend" / "services" / "slides" / "generation" / "image_generator.py",
        repo_root / "frontend" / "src" / "utils" / "mixpanel.ts",
    ]
    combined = "\n".join(path.read_text(encoding="utf-8") for path in checked_files)
    leaked_serpapi = "".join([
        "044337361b95",
        "bae23c4338e4",
        "5310aa83698d",
        "577782d660d6",
        "d6b278e7e291512f",
    ])
    leaked_hdgsb = "".join([
        "sk-NqKNfPfPj8",
        "yQX6uRtJTVw",
        "LP7pX9BaKa",
        "PaMqhPHRKL",
        "HuuzRc1",
    ])
    leaked_mixpanel = "".join([
        "d726e8be",
        "a8ec147f",
        "4c772006",
        "0cb2e6d1",
    ])

    assert leaked_serpapi not in combined
    assert leaked_hdgsb not in combined
    assert leaked_mixpanel not in combined


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


def test_core_app_manifest_includes_question_routes():
    assert questions_router in CORE_APP_MANIFEST.versioned_routers


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
