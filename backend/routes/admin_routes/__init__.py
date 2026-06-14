"""admin_routes package — re-exports admin_router for backward compatibility."""

from .router import admin_router  # noqa: F401

# Import sub-modules so @admin_router decorators register endpoints
from . import (  # noqa: F401
    users,
    courses,
    db_console,
    telemetry,
    rag_eval,
    api_keys,
    file_assets,
    file_center,
    courses_v2,
    staff_codes,
    security,
)
