"""Backward-compatibility shim.

The canonical config lives at backend.core.config.
All existing `from backend.config import Config` imports continue to work unchanged.
"""
from backend.core.config import Config, Settings, SENSITIVE_ENVS  # noqa: F401
