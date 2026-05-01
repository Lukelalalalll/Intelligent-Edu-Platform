"""ai_routes package — drop-in replacement for the old ai_routes.py single file.

External code only needs:
    from backend.routes.ai_routes import ai_router
"""

from .router import ai_router  # noqa: F401  — the shared router instance

# Import sub-modules so their @ai_router decorators register the endpoints.
from . import session  # noqa: F401
from . import chat  # noqa: F401
from . import memory  # noqa: F401
from . import study_coach  # noqa: F401
from . import study_stream  # noqa: F401
from . import index_course  # noqa: F401
