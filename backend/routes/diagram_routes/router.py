from fastapi import APIRouter

diagram_router = APIRouter(prefix="/diagram", tags=["Diagram"])

# Import sub-modules to register their route handlers.
from backend.routes.diagram_routes import extraction, generation, history, search_download  # noqa: E402, F401
