"""Compatibility re-export for split profile route modules."""

from .profile_courses import get_profile_courses  # noqa: F401
from .profile_preferences import get_preferences, update_preferences  # noqa: F401
from .profile_history import get_history_settings, update_history_settings  # noqa: F401
from .profile_ai_config import get_ai_config, update_deepseek_config, update_openai_config  # noqa: F401
