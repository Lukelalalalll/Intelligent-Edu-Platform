"""chat_routes package with explicit router aggregation."""

from .ai_actions import router as ai_actions_router
from .contacts import router as contacts_router
from .messages import router as messages_router
from .rooms import router as rooms_router
from .router import chat_router  # noqa: F401
from .ws import router as ws_router

for router in (contacts_router, rooms_router, messages_router, ai_actions_router, ws_router):
    chat_router.include_router(router)
