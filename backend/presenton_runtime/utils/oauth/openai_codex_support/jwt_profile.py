from __future__ import annotations

import base64
import json
from typing import Optional

from .constants import JWT_CLAIM_PATH
from .models import CodexAccountProfile


def decode_jwt_payload(token: str) -> Optional[dict]:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        payload_b64 = parts[1]
        padding = 4 - len(payload_b64) % 4
        if padding != 4:
            payload_b64 += "=" * padding
        decoded = base64.urlsafe_b64decode(payload_b64)
        return json.loads(decoded)
    except Exception:
        return None


def get_account_id(access_token: str) -> Optional[str]:
    payload = decode_jwt_payload(access_token)
    if not payload:
        return None
    auth_claims = payload.get(JWT_CLAIM_PATH)
    if not isinstance(auth_claims, dict):
        return None
    account_id = auth_claims.get("chatgpt_account_id")
    if isinstance(account_id, str) and account_id:
        return account_id
    return None


def _as_non_empty_str(value) -> Optional[str]:
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return None


def get_account_profile(access_token: str, id_token: Optional[str] = None) -> CodexAccountProfile:
    access_payload = decode_jwt_payload(access_token) or {}
    access_auth = access_payload.get(JWT_CLAIM_PATH)
    access_auth = access_auth if isinstance(access_auth, dict) else {}

    access_profile = access_payload.get("https://api.openai.com/profile")
    access_profile = access_profile if isinstance(access_profile, dict) else {}

    id_payload = decode_jwt_payload(id_token) if id_token else None
    id_payload = id_payload if isinstance(id_payload, dict) else {}
    id_auth = id_payload.get(JWT_CLAIM_PATH)
    id_auth = id_auth if isinstance(id_auth, dict) else {}

    account_id = _as_non_empty_str(access_auth.get("chatgpt_account_id")) or _as_non_empty_str(
        id_auth.get("chatgpt_account_id")
    )
    username = _as_non_empty_str(id_payload.get("name"))
    email = _as_non_empty_str(access_profile.get("email")) or _as_non_empty_str(id_payload.get("email"))

    plan_type = _as_non_empty_str(access_auth.get("chatgpt_plan_type")) or _as_non_empty_str(
        id_auth.get("chatgpt_plan_type")
    )
    if plan_type:
        is_pro = plan_type.strip().lower() != "free"
    else:
        is_pro = None

    return CodexAccountProfile(
        account_id=account_id,
        username=username,
        email=email,
        is_pro=is_pro,
    )


__all__ = ["decode_jwt_payload", "get_account_id", "get_account_profile"]
