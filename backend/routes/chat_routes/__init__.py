"""chat_routes package — drop-in replacement for the old chat_routes.py single file.

External code only needs:
    from backend.routes.chat_routes import chat_router
"""

from .router import chat_router  # noqa: F401

# Import sub-modules so their @chat_router decorators register the endpoints.
from . import contacts  # noqa: F401
from . import rooms  # noqa: F401
from . import messages  # noqa: F401
from . import ai_actions  # noqa: F401
from . import ws  # noqa: F401
