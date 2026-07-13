"""Application configuration based on segmented pydantic settings."""
from __future__ import annotations

import os

from dotenv import load_dotenv

from backend.core.settings import SENSITIVE_ENVS, Settings
from backend.core.settings.shared import _BASE_DIR

load_dotenv()
load_dotenv(os.path.join(_BASE_DIR, ".env"))

Config = Settings()

__all__ = ["Config", "Settings", "SENSITIVE_ENVS"]
