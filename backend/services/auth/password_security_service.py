from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
from datetime import datetime, timezone
from typing import Final

from fastapi import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

_HAS_ARGON2 = False
try:
    from argon2 import PasswordHasher
    from argon2.exceptions import VerifyMismatchError

    _HAS_ARGON2 = True
except Exception:  # pragma: no cover - optional dependency fallback
    PasswordHasher = None  # type: ignore[assignment]
    VerifyMismatchError = Exception  # type: ignore[assignment]


_PASSWORD_BLOCKLIST: Final[set[str]] = {
    "12345678",
    "123456789",
    "1234567890",
    "password",
    "password1",
    "password123",
    "qwerty123",
    "11111111",
    "aaaaaaaa",
    "letmein123",
}

_PASSWORD_MIN_LENGTH: Final[int] = 12
_TOKEN_HASH_SALT: Final[str] = os.getenv("PASSWORD_RESET_TOKEN_HASH_SALT", "password-reset-token-v1")
_PASSWORD_HASHER = PasswordHasher() if _HAS_ARGON2 and PasswordHasher is not None else None


def normalize_username(username: str) -> str:
    return username.strip().casefold()


def normalize_email(email: str) -> str:
    return email.strip().casefold()


def ensure_password_strength(password: str, *, user_identifiers: list[str] | None = None) -> None:
    candidate = str(password or "")
    if len(candidate) < _PASSWORD_MIN_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {_PASSWORD_MIN_LENGTH} characters",
        )

    lowered = candidate.casefold()
    if lowered in _PASSWORD_BLOCKLIST:
        raise HTTPException(status_code=400, detail="Password is too common")

    if not re.search(r"[A-Za-z]", candidate):
        raise HTTPException(status_code=400, detail="Password must contain at least one letter")

    if user_identifiers:
        for identifier in user_identifiers:
            clean = str(identifier or "").strip().casefold()
            if clean and len(clean) >= 3 and clean in lowered:
                raise HTTPException(status_code=400, detail="Password must not contain account identifiers")


def hash_password(password: str) -> tuple[str, str]:
    if _PASSWORD_HASHER is not None:
        return _PASSWORD_HASHER.hash(password), "argon2id"
    return generate_password_hash(password), "pbkdf2:sha256"


def verify_password(password: str, password_hash: str) -> bool:
    if not password_hash:
        return False

    if password_hash.startswith("$argon2"):
        if _PASSWORD_HASHER is None:
            return False
        try:
            return _PASSWORD_HASHER.verify(password_hash, password)
        except VerifyMismatchError:
            return False
    return check_password_hash(password_hash, password)


def password_needs_rehash(password_hash: str) -> bool:
    if not password_hash:
        return True
    if password_hash.startswith("$argon2"):
        if _PASSWORD_HASHER is None:
            return True
        try:
            return bool(_PASSWORD_HASHER.check_needs_rehash(password_hash))
        except Exception:
            return True
    return True


def issue_password_reset_token() -> tuple[str, str]:
    raw = secrets.token_urlsafe(32)
    return raw, hash_password_reset_token(raw)


def hash_password_reset_token(token: str) -> str:
    digest = hashlib.sha256(f"{_TOKEN_HASH_SALT}:{token}".encode("utf-8")).hexdigest()
    return digest


def constant_time_equal(left: str, right: str) -> bool:
    return hmac.compare_digest(str(left or ""), str(right or ""))


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
