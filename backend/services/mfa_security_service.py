from __future__ import annotations

import base64
import copy
import hashlib
import hmac
import os
import secrets
import struct
import urllib.parse
from datetime import timedelta

from fastapi import HTTPException

from backend.config import Config
from backend.services.password_security_service import utcnow
from backend.services.secret_storage import decrypt_secret, encrypt_secret

_MFA_SECRET_PREFIX = "mfa:v1:"
_BACKUP_CODE_COUNT = 8
_BACKUP_CODE_LENGTH = 10
_TOTP_PERIOD_SECONDS = 30
_TOTP_DIGITS = 6
_TOTP_ALGORITHM = "SHA1"
_STEP_UP_TTL = timedelta(minutes=10)


def _base32_secret(byte_length: int = 20) -> str:
    return base64.b32encode(secrets.token_bytes(byte_length)).decode("ascii").rstrip("=")


def _normalize_base32(secret: str) -> bytes:
    raw = str(secret or "").strip().replace(" ", "").upper()
    padded = raw + ("=" * ((8 - len(raw) % 8) % 8))
    return base64.b32decode(padded, casefold=True)


def _totp_code(secret: str, counter: int) -> str:
    key = _normalize_base32(secret)
    message = struct.pack(">Q", counter)
    digest = hmac.new(key, message, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    binary = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return str(binary % (10 ** _TOTP_DIGITS)).zfill(_TOTP_DIGITS)


def verify_totp_code(secret: str, code: str, *, at_ts: int | None = None, window: int = 1) -> bool:
    normalized = str(code or "").strip().replace(" ", "")
    if not normalized.isdigit() or len(normalized) != _TOTP_DIGITS:
        return False
    timestamp = int(at_ts or utcnow().timestamp())
    counter = timestamp // _TOTP_PERIOD_SECONDS
    for delta in range(-window, window + 1):
        candidate = _totp_code(secret, counter + delta)
        if hmac.compare_digest(candidate, normalized):
            return True
    return False


def build_totp_uri(*, secret: str, username: str, issuer: str = "IntelligentEdu") -> str:
    label = urllib.parse.quote(f"{issuer}:{username}")
    issuer_q = urllib.parse.quote(issuer)
    return (
        f"otpauth://totp/{label}"
        f"?secret={secret}&issuer={issuer_q}&algorithm={_TOTP_ALGORITHM}&digits={_TOTP_DIGITS}&period={_TOTP_PERIOD_SECONDS}"
    )


def generate_backup_codes() -> list[str]:
    codes: list[str] = []
    while len(codes) < _BACKUP_CODE_COUNT:
        raw = secrets.token_hex(5).upper()
        code = f"{raw[:5]}-{raw[5:10]}"
        if code not in codes:
            codes.append(code)
    return codes


def _hash_backup_code(code: str) -> str:
    normalized = str(code or "").strip().replace("-", "").upper()
    digest = hashlib.sha256(f"backup-code:{normalized}".encode("utf-8")).hexdigest()
    return digest


def build_backup_code_records(codes: list[str]) -> list[dict]:
    now = utcnow()
    return [{"code_hash": _hash_backup_code(code), "used_at": None, "created_at": now} for code in codes]


def consume_backup_code(records: list[dict] | None, code: str) -> tuple[bool, list[dict]]:
    candidate_hash = _hash_backup_code(code)
    updated = copy.deepcopy(list(records or []))
    for item in updated:
        if item.get("used_at") is None and hmac.compare_digest(str(item.get("code_hash") or ""), candidate_hash):
            item["used_at"] = utcnow()
            return True, updated
    return False, updated


def backup_codes_remaining(records: list[dict] | None) -> int:
    return sum(1 for item in list(records or []) if item.get("used_at") is None)


def encrypt_mfa_secret(secret: str) -> str:
    encrypted = encrypt_secret(secret)
    if not encrypted:
        return ""
    return f"{_MFA_SECRET_PREFIX}{encrypted}"


def decrypt_mfa_secret(secret: object) -> str:
    raw = str(secret or "")
    if not raw:
        return ""
    if raw.startswith(_MFA_SECRET_PREFIX):
        raw = raw[len(_MFA_SECRET_PREFIX):]
    return decrypt_secret(raw)


def generate_mfa_enrollment(username: str) -> dict:
    secret = _base32_secret()
    return {
        "secret": secret,
        "otpauth_uri": build_totp_uri(secret=secret, username=username),
    }


def step_up_expires_at():
    return utcnow() + _STEP_UP_TTL


def assert_step_up_recent(session_doc: dict, *, reason: str = "Step-up authentication required") -> None:
    expires_at = session_doc.get("step_up_expires_at")
    if not expires_at or expires_at <= utcnow():
        raise HTTPException(status_code=403, detail=reason)


def normalize_mfa_code(code: str) -> str:
    return str(code or "").strip().replace(" ", "")


def get_mfa_policy_snapshot(user_doc: dict) -> dict:
    mfa = dict(user_doc.get("mfa") or {})
    return {
        "enabled": bool(mfa.get("enabled")),
        "totpConfigured": bool(mfa.get("totp_secret_encrypted")),
        "backupCodesRemaining": backup_codes_remaining(mfa.get("backup_codes")),
        "preferredMethod": mfa.get("preferred_method") or "totp",
        "enrolledAt": mfa.get("enrolled_at").isoformat() if mfa.get("enrolled_at") else None,
    }
