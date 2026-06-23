"""Compatibility facade for the extracted implementation module."""
from __future__ import annotations

from importlib import import_module as _import_module

_impl = _import_module("backend.application.architecture_facades.auth_session_service_impl")

for _name in dir(_impl):
    if not (_name.startswith("__") and _name.endswith("__")):
        globals()[_name] = getattr(_impl, _name)

__all__ = [
    _name for _name in globals()
    if not (_name.startswith("__") and _name.endswith("__"))
    and _name not in {"_import_module", "_impl"}
]
