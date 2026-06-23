"""auth_routes package with explicit router aggregation."""

from .auth_google import router as auth_google_router
from .auth_login import router as auth_login_router
from .auth_password import router as auth_password_router
from .auth_sessions import router as auth_sessions_router
from .profile import get_profile_courses  # noqa: F401
from .profile_ai_config import router as profile_ai_config_router
from .profile_connections import router as profile_connections_router
from .profile_courses import router as profile_courses_router
from .profile_history import router as profile_history_router
from .profile_preferences import router as profile_preferences_router
from .profile_security import router as profile_security_router
from .router import auth_router, limiter  # noqa: F401
from .student_v2 import router as student_v2_router

for router in (
    auth_login_router,
    auth_google_router,
    auth_password_router,
    auth_sessions_router,
    profile_ai_config_router,
    profile_connections_router,
    profile_courses_router,
    profile_history_router,
    profile_preferences_router,
    profile_security_router,
    student_v2_router,
):
    auth_router.include_router(router)
