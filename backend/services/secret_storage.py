from __future__ import annotations

import base64
import hashlib
import os

from cryptography.fernet import Fernet, InvalidToken

from backend.core.config import Config

_SECRET_PREFIX = "fernet:v1:"


def _secret_material() -> str:
    configured = os.getenv("AI_CONFIG_SECRET_KEY") or os.getenv("SECRET_KEY") or os.getenv("JWT_SECRET_KEY")
    if configured:
        return configured
    if Config.ENV.lower() in ("production", "prod", "staging", "preprod"):
        return Config.SECRET_KEY
    return "intelligent-edu-platform-dev-ai-config-secret"


def _secret_cipher() -> Fernet:
    digest = hashlib.sha256(_secret_material().encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def has_saved_secret(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def encrypt_secret(value: str | None) -> str:
    if not value:
        return ""
    token = _secret_cipher().encrypt(value.encode("utf-8")).decode("utf-8")
    return f"{_SECRET_PREFIX}{token}"


def decrypt_secret(value: object) -> str:
    if not has_saved_secret(value):
        return ""
    raw = str(value)
    if not raw.startswith(_SECRET_PREFIX):
        return raw
    try:
        return _secret_cipher().decrypt(raw[len(_SECRET_PREFIX):].encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError):
        return ""
