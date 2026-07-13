from .history_center import router as history_center_router
from .router import file_center_router

file_center_router.include_router(history_center_router)

__all__ = ["file_center_router"]
