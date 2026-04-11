"""Backward-compat shim. Use mailbox_routes instead."""
from backend.routes.mailbox_routes import mailbox_router as teacher_router  # noqa: F401

__all__ = ["teacher_router"]
