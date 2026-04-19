from .router import file_center_router
from . import history_center  # registers all @file_center_router routes  # noqa: F401

__all__ = ["file_center_router"]
