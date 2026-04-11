"""ai_gateway_routes package — re-exports ai_gateway_router for backward compatibility."""

from .router import ai_gateway_router  # noqa: F401

# Import sub-modules so @ai_gateway_router decorators register endpoints
from . import feedback, grading  # noqa: F401
