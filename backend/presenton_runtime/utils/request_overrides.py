from __future__ import annotations

from contextvars import ContextVar, Token
from typing import Mapping

OVERRIDE_MISSING = object()

_REQUEST_ENV_OVERRIDES: ContextVar[dict[str, str]] = ContextVar(
    "presenton_request_env_overrides",
    default={},
)


def get_request_env_override(key: str):
    overrides = _REQUEST_ENV_OVERRIDES.get()
    return overrides.get(key, OVERRIDE_MISSING)


def set_request_env_overrides(values: Mapping[str, object | None]) -> Token:
    normalized: dict[str, str] = {}
    for key, value in values.items():
        if value is None:
            continue
        normalized[str(key)] = str(value)
    return _REQUEST_ENV_OVERRIDES.set(normalized)


def reset_request_env_overrides(token: Token) -> None:
    _REQUEST_ENV_OVERRIDES.reset(token)
