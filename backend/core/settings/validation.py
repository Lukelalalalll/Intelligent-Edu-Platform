from __future__ import annotations

import json
import logging
import os
from urllib.parse import urlparse

from pydantic import field_validator, model_validator

from .paths import PathSettingsSegment
from .shared import _BASE_DIR, is_sensitive_env, key_strength_issues


def _origin_issues(origins: list[str]) -> list[str]:
    issues: list[str] = []
    if not origins:
        return ["ALLOWED_ORIGINS must not be empty in sensitive environments"]

    for origin in origins:
        raw = str(origin or "").strip()
        if not raw:
            continue
        if raw == "*":
            issues.append("ALLOWED_ORIGINS must not include '*' in sensitive environments")
            continue

        parsed = urlparse(raw)
        if not parsed.scheme or not parsed.netloc:
            issues.append(f"ALLOWED_ORIGINS contains an invalid origin: {raw}")
            continue

        host = str(parsed.hostname or "").lower()
        if host in {"localhost", "127.0.0.1"}:
            issues.append(f"ALLOWED_ORIGINS must not include local development hosts in sensitive environments: {raw}")
        if parsed.scheme.lower() != "https":
            issues.append(f"ALLOWED_ORIGINS must use https in sensitive environments: {raw}")
    return issues


class ValidationSettingsSegment(PathSettingsSegment):
    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_origins(cls, value) -> list[str]:
        default = ["http://localhost:5173", "http://127.0.0.1:5173"]
        if value is None:
            return default
        if isinstance(value, (list, tuple, set)):
            return [str(item).strip() for item in value if str(item).strip()]

        raw = str(value).strip()
        if not raw:
            return default

        if raw.startswith("["):
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                parsed = None
            if isinstance(parsed, list):
                return [str(item).strip() for item in parsed if str(item).strip()]

        return [item.strip() for item in raw.split(",") if item.strip()]

    @model_validator(mode="after")
    def set_defaults_and_env_flags(self):
        sensitive = is_sensitive_env(self.ENV)

        if not self.SECRET_KEY:
            generated = os.urandom(32).hex()
            object.__setattr__(self, "SECRET_KEY", generated)
            logging.getLogger("config").warning(
                "SECRET_KEY was not set - using auto-generated key for this session. "
                "Set SECRET_KEY in .env for persistent sessions across restarts."
            )
        if not self.JWT_SECRET_KEY:
            generated = os.urandom(32).hex()
            object.__setattr__(self, "JWT_SECRET_KEY", generated)
            logging.getLogger("config").warning(
                "JWT_SECRET_KEY was not set - using auto-generated key for this session. "
                "Set JWT_SECRET_KEY in .env for persistent sessions across restarts."
            )

        if os.getenv("JWT_COOKIE_CSRF_PROTECT") is None:
            object.__setattr__(self, "JWT_COOKIE_CSRF_PROTECT", sensitive)

        if os.getenv("JWT_COOKIE_SECURE") is None:
            object.__setattr__(self, "JWT_COOKIE_SECURE", sensitive)

        def default_path(field: str, fallback: str) -> None:
            if not getattr(self, field):
                object.__setattr__(self, field, fallback)

        default_path("RAG_VECTORSTORE_DIR", os.path.join(_BASE_DIR, "generated", "vectorstore"))
        default_path("UPLOAD_FOLDER", os.path.join(_BASE_DIR, "uploads"))
        default_path("MARKDOWN_FOLDER", os.path.join(_BASE_DIR, "md"))
        default_path("HIGHLIGHTS_FOLDER", os.path.join(_BASE_DIR, "highlights"))
        default_path("SUB1_UPLOAD_FOLDER", os.path.join(_BASE_DIR, "uploads", "sub1"))
        default_path("SUB1_MD_FOLDER", os.path.join(_BASE_DIR, "md", "sub1"))
        default_path("SUB1_HIGHLIGHTS_FOLDER", os.path.join(_BASE_DIR, "highlights", "sub1"))
        default_path("PPT_TEMPLATES_FOLDER", os.path.join(_BASE_DIR, "static", "ppt_templates"))
        default_path("PPT_RESULTS_FOLDER", os.path.join(_BASE_DIR, "static", "ppt_results", "sub1"))
        default_path("SCRIPT_RESULTS_FOLDER", os.path.join(_BASE_DIR, "static", "script_results", "sub1"))
        default_path("UPLOAD_FOLDER_SUB2", os.path.join(_BASE_DIR, "uploads", "sub2"))
        default_path("GENERATED_FOLDER_SUB2", os.path.join(_BASE_DIR, "generated", "sub2"))
        default_path(
            "SCREENSHOTS_FOLDER_SUB2",
            os.path.join(_BASE_DIR, "static", "sub2", "screenshots"),
        )
        default_path(
            "KNOWLEDGE_BASE_UPLOAD_DIR",
            os.path.join(_BASE_DIR, "uploads", "knowledge_base"),
        )
        return self

    def validate_startup(self) -> list[str]:
        logger = logging.getLogger("config.validation")
        warnings: list[str] = []

        sensitive_env = is_sensitive_env(self.ENV)
        secret_issues = key_strength_issues(self.SECRET_KEY, "SECRET_KEY")
        jwt_issues = key_strength_issues(self.JWT_SECRET_KEY, "JWT_SECRET_KEY")

        for message in [*secret_issues, *jwt_issues]:
            if sensitive_env:
                logger.critical("CRITICAL CONFIG: %s", message)
            else:
                logger.warning("DEV SECURITY WARNING: %s", message)
                warnings.append(message)

        if sensitive_env and (secret_issues or jwt_issues):
            raise SystemExit(
                "Refusing to start: SECRET_KEY/JWT_SECRET_KEY failed security checks. "
                "Use strong random values with >=32 chars and high entropy."
            )

        valid_samesite = {"lax", "strict", "none"}
        if self.JWT_COOKIE_SAMESITE not in valid_samesite:
            message = f"JWT_COOKIE_SAMESITE must be one of {sorted(valid_samesite)}"
            if sensitive_env:
                logger.critical(message)
                raise SystemExit(f"Refusing to start: {message}")
            logger.warning("DEV SECURITY WARNING: %s", message)
            warnings.append(message)

        if sensitive_env and not self.JWT_COOKIE_SECURE:
            message = "JWT_COOKIE_SECURE must be true in production/staging environments"
            logger.critical(message)
            raise SystemExit(f"Refusing to start: {message}")

        origin_issues = _origin_issues(self.ALLOWED_ORIGINS)
        for message in origin_issues:
            if sensitive_env:
                logger.critical(message)
            else:
                logger.warning("DEV SECURITY WARNING: %s", message)
                warnings.append(message)
        if sensitive_env and origin_issues:
            raise SystemExit(
                "Refusing to start: ALLOWED_ORIGINS must be explicit https origins for the deployed frontend."
            )

        optional_keys = {
            "DEEPSEEK_API_KEY": self.DEEPSEEK_API_KEY,
            "COZE_TOKEN": self.COZE_TOKEN,
        }
        for name, value in optional_keys.items():
            if not value:
                message = f"CONFIG: {name} is not set - related features will be degraded."
                warnings.append(message)
                logger.info(message)

        if self.RAG_OPENSEARCH_ENABLED and not self.RAG_OPENSEARCH_ENDPOINT:
            message = "RAG_OPENSEARCH_ENABLED is true but RAG_OPENSEARCH_ENDPOINT is empty"
            warnings.append(message)
            logger.warning(message)

        if self.RAG_OPENSEARCH_PASSWORD and not self.RAG_OPENSEARCH_USERNAME:
            message = "RAG_OPENSEARCH_PASSWORD is set but RAG_OPENSEARCH_USERNAME is empty"
            warnings.append(message)
            logger.warning(message)

        return warnings
