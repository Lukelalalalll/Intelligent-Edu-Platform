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
