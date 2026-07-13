"""Compatibility facade for extracted auth account workflows."""
from __future__ import annotations

from importlib import import_module as _import_module

_impl = _import_module("backend.application.architecture_facades.auth_account_service_impl")

for _name in dir(_impl):
    if not (_name.startswith("__") and _name.endswith("__")):
        globals()[_name] = getattr(_impl, _name)

_PATCHABLE = (
    "authenticate_user",
    "request_password_reset",
    "record_login_failure",
    "record_login_success",
    "assert_login_allowed",
)


def _sync_patchable_helpers() -> None:
    for _name in _PATCHABLE:
        if _name in globals():
            setattr(_impl, _name, globals()[_name])


async def authenticate_user_with_guards(*args, **kwargs):
    _sync_patchable_helpers()
    return await _impl.authenticate_user_with_guards(*args, **kwargs)


async def request_password_reset_with_guards(*args, **kwargs):
    _sync_patchable_helpers()
    return await _impl.request_password_reset_with_guards(*args, **kwargs)

__all__ = [
    _name for _name in globals()
    if not (_name.startswith("__") and _name.endswith("__"))
    and _name not in {"_import_module", "_impl"}
]
