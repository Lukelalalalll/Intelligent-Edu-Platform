import logging
from fastapi import APIRouter
from slowapi import Limiter
from slowapi.util import get_remote_address

image_extractor_router = APIRouter(prefix="/image-extractor", tags=["Image Extractor"])
limiter = Limiter(key_func=get_remote_address)
logger = logging.getLogger(__name__)

# Import sub-modules to register their route handlers.
from backend.routes.image_extractor_routes import extraction, search_generate, export, history  # noqa: E402, F401
