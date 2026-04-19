"""Domain exception hierarchy.

Services should raise these exceptions instead of FastAPI's HTTPException.
The exception handlers in exceptions/handlers.py map them to HTTP responses.

Usage example
-------------
from backend.exceptions.domain import ResourceNotFoundError

async def get_submission(submission_id: str, user_id: str):
    doc = await db.submissions.find_one(...)
    if not doc:
        raise ResourceNotFoundError(f"Submission {submission_id} not found")
"""


class AppError(Exception):
    """Base class for all application domain errors."""


class ResourceNotFoundError(AppError):
    """Raised when a requested resource does not exist or the caller has no access."""


class PermissionDeniedError(AppError):
    """Raised when a user attempts an action they are not authorised to perform."""


class ExternalServiceError(AppError):
    """Raised when an upstream API (Coze, Ollama, SerpAPI, etc.) returns an error."""


class ValidationError(AppError):
    """Raised for business-rule validation failures (distinct from Pydantic schema errors)."""
