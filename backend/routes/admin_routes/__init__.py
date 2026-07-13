"""admin_routes package with explicit router aggregation."""

from .courses import router as courses_router
from .courses_v2 import router as courses_v2_router
from .db_console import router as db_console_router
from .file_assets import router as file_assets_router
from .file_center import router as file_center_router
from .rag_eval import router as rag_eval_router
from .router import admin_router  # noqa: F401
from .security import router as security_router
from .staff_codes import router as staff_codes_router
from .telemetry import router as telemetry_router
from .users import router as users_router

for router in (
    users_router,
    courses_router,
    db_console_router,
    telemetry_router,
    rag_eval_router,
    file_assets_router,
    file_center_router,
    courses_v2_router,
    staff_codes_router,
    security_router,
):
    admin_router.include_router(router)
