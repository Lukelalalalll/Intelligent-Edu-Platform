from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass
class TokenSuccess:
    access: str
    refresh: str
    expires: int
    id_token: Optional[str] = None


@dataclass
class TokenFailure:
    reason: str


TokenResult = TokenSuccess | TokenFailure


@dataclass
class AuthorizationFlow:
    verifier: str
    state: str
    url: str


@dataclass
class CodexAccountProfile:
    account_id: Optional[str] = None
    username: Optional[str] = None
    email: Optional[str] = None
    is_pro: Optional[bool] = None


__all__ = [
    "AuthorizationFlow",
    "CodexAccountProfile",
    "TokenFailure",
    "TokenResult",
    "TokenSuccess",
]
