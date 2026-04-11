"""questions_routes package — re-exports questions_router for backward compatibility."""

from .router import questions_router  # noqa: F401

# Import sub-modules so @questions_router decorators register endpoints
from . import generate, tools, history, question_ops  # noqa: F401
