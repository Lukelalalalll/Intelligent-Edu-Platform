"""auth_routes package — re-exports public symbols for backward compatibility."""

from .router import auth_router, limiter  # noqa: F401
from .profile import get_profile_courses  # noqa: F401

# Import sub-modules so @auth_router decorators register endpoints
from . import auth, profile, student_v2  # noqa: F401
