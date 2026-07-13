from __future__ import annotations

from .shared import SENSITIVE_ENVS
from .validation import ValidationSettingsSegment


class Settings(ValidationSettingsSegment):
    """Central application settings backed by environment variables."""


__all__ = ["SENSITIVE_ENVS", "Settings"]
