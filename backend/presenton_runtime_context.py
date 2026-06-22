from __future__ import annotations

from contextvars import ContextVar, Token
from typing import Any


_PRESENTON_OWNER_USER_ID: ContextVar[str] = ContextVar(
    "presenton_owner_user_id",
    default="",
)


def resolve_presenton_owner_user_id(user: dict[str, Any] | None) -> str:
    if not isinstance(user, dict):
        return ""
    return str(user.get("id") or user.get("_id") or "").strip()


def set_presenton_owner_user_id(owner_user_id: str) -> Token[str]:
    return _PRESENTON_OWNER_USER_ID.set(str(owner_user_id or "").strip())


def reset_presenton_owner_user_id(token: Token[str]) -> None:
    _PRESENTON_OWNER_USER_ID.reset(token)


def get_presenton_owner_user_id() -> str:
    return str(_PRESENTON_OWNER_USER_ID.get() or "").strip()
