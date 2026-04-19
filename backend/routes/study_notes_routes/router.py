import logging
from fastapi import APIRouter

study_notes_router = APIRouter(prefix="/study-notes", tags=["Study Notes"])
logger = logging.getLogger(__name__)

# Import sub-modules to register their route handlers.
from backend.routes.study_notes_routes import notes, study_plan, history  # noqa: E402, F401
