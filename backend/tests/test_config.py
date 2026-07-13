"""Tests for backend.core.config — Settings class and validate_startup()."""
import pytest

from backend.core.config import Settings, SENSITIVE_ENVS


def _make_settings(**overrides):
    """Create a fresh Settings instance with env-var overrides."""
    import os
    env = os.environ.copy()
    for k, v in overrides.items():
        env[k] = str(v)
    with pytest.MonkeyPatch.context() as mp:
        for k, v in overrides.items():
            mp.setenv(k, str(v))
        return Settings()


# ── ENV override ────────────────────────────────────────────────────

def test_env_defaults_to_development():
    cfg = _make_settings()
    assert cfg.ENV == "development"


def test_env_reads_from_envvar(monkeypatch):
    monkeypatch.setenv("ENV", "staging")
    cfg = Settings()
    assert cfg.ENV == "staging"


# ── JWT_COOKIE_SECURE auto-set in sensitive env ─────────────────────

def test_cookie_secure_true_in_production(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.delenv("JWT_COOKIE_SECURE", raising=False)
    cfg = Settings()
    assert cfg.JWT_COOKIE_SECURE is True


def test_cookie_secure_false_in_development(monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.delenv("JWT_COOKIE_SECURE", raising=False)
    cfg = Settings()
    assert cfg.JWT_COOKIE_SECURE is False


# ── validate_startup() ─────────────────────────────────────────────

def test_validate_startup_exits_on_weak_keys_in_production(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("SECRET_KEY", "your-secret-key")
    monkeypatch.setenv("JWT_SECRET_KEY", "jwt-secret-key-change-this-in-prod")
    monkeypatch.setenv("JWT_COOKIE_SECURE", "true")
    cfg = Settings()
    with pytest.raises(SystemExit):
        cfg.validate_startup()


def test_validate_startup_warns_in_dev(monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("SECRET_KEY", "your-secret-key")
    monkeypatch.setenv("JWT_SECRET_KEY", "weak")
    cfg = Settings()
    warnings = cfg.validate_startup()
    assert len(warnings) > 0


def test_validate_startup_clean_with_strong_keys(monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("SECRET_KEY", "k7Qm!xW2pR9z@Lf4hN5vB3jT8yC0sD6aE1gU")
    monkeypatch.setenv("JWT_SECRET_KEY", "mP4rX!8wK2nZ@7bQ9fL0vH5jA3sD6yT1cU8e")
    cfg = Settings()
    warnings = cfg.validate_startup()
    # Only optional-key warnings expected (DEEPSEEK_API_KEY etc.)
    assert all("is not set" in w for w in warnings)


# ── Sensitive env detection ─────────────────────────────────────────

def test_sensitive_envs_constant():
    assert "production" in SENSITIVE_ENVS
    assert "staging" in SENSITIVE_ENVS
    assert "development" not in SENSITIVE_ENVS


# ── Auto-generated keys ──────────────────────────────────────────────

def test_auto_generates_secret_key_when_empty(monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("SECRET_KEY", "")
    monkeypatch.setenv("JWT_SECRET_KEY", "strong-enough-key-for-test-12345")
    cfg = Settings()
    assert cfg.SECRET_KEY != ""
    assert len(cfg.SECRET_KEY) >= 32


def test_auto_generates_jwt_secret_key_when_empty(monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("SECRET_KEY", "strong-enough-key-for-test-12345")
    monkeypatch.setenv("JWT_SECRET_KEY", "")
    cfg = Settings()
    assert cfg.JWT_SECRET_KEY != ""
    assert len(cfg.JWT_SECRET_KEY) >= 32


def test_preserves_explicitly_set_keys(monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("SECRET_KEY", "explicit-secret-key-abc-123")
    monkeypatch.setenv("JWT_SECRET_KEY", "explicit-jwt-key-xyz-789")
    cfg = Settings()
    assert cfg.SECRET_KEY == "explicit-secret-key-abc-123"
    assert cfg.JWT_SECRET_KEY == "explicit-jwt-key-xyz-789"


# ── Coze OCR gating ──────────────────────────────────────────────────

def test_coze_ocr_disabled_by_default(monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("SECRET_KEY", "strong-enough-key-for-test-12345")
    monkeypatch.setenv("JWT_SECRET_KEY", "strong-enough-key-for-test-12345")
    monkeypatch.delenv("COZE_OCR_ENABLED", raising=False)
    cfg = Settings()
    assert cfg.COZE_OCR_ENABLED is False


def test_coze_ocr_enabled_when_set(monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("SECRET_KEY", "strong-enough-key-for-test-12345")
    monkeypatch.setenv("JWT_SECRET_KEY", "strong-enough-key-for-test-12345")
    monkeypatch.setenv("COZE_OCR_ENABLED", "true")
    cfg = Settings()
    assert cfg.COZE_OCR_ENABLED is True


# ── Coze timeout bounds ──────────────────────────────────────────────

def test_coze_timeout_min_clamp(monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("SECRET_KEY", "strong-enough-key-for-test-12345")
    monkeypatch.setenv("JWT_SECRET_KEY", "strong-enough-key-for-test-12345")
    monkeypatch.setenv("COZE_REQUEST_TIMEOUT_SECONDS", "1")
    cfg = Settings()
    assert cfg.COZE_REQUEST_TIMEOUT_SECONDS == 5.0  # clamped to min


def test_coze_timeout_max_clamp(monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("SECRET_KEY", "strong-enough-key-for-test-12345")
    monkeypatch.setenv("JWT_SECRET_KEY", "strong-enough-key-for-test-12345")
    monkeypatch.setenv("COZE_REQUEST_TIMEOUT_SECONDS", "999")
    cfg = Settings()
    assert cfg.COZE_REQUEST_TIMEOUT_SECONDS == 300.0  # clamped to max


def test_coze_poll_interval_min_clamp(monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("SECRET_KEY", "strong-enough-key-for-test-12345")
    monkeypatch.setenv("JWT_SECRET_KEY", "strong-enough-key-for-test-12345")
    monkeypatch.setenv("COZE_POLL_INTERVAL_SECONDS", "0.1")
    cfg = Settings()
    assert cfg.COZE_POLL_INTERVAL_SECONDS == 0.5  # clamped to min


# ── RAG query language config ────────────────────────────────────────

def test_rag_query_language_defaults_to_auto(monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("SECRET_KEY", "strong-enough-key-for-test-12345")
    monkeypatch.setenv("JWT_SECRET_KEY", "strong-enough-key-for-test-12345")
    monkeypatch.delenv("RAG_QUERY_LANGUAGE", raising=False)
    cfg = Settings()
    assert cfg.RAG_QUERY_LANGUAGE == "auto"


def test_rag_query_language_explicit(monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("SECRET_KEY", "strong-enough-key-for-test-12345")
    monkeypatch.setenv("JWT_SECRET_KEY", "strong-enough-key-for-test-12345")
    monkeypatch.setenv("RAG_QUERY_LANGUAGE", "en")
    cfg = Settings()
    assert cfg.RAG_QUERY_LANGUAGE == "en"
