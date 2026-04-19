"""Shared APIRouter instance and constants for the AI routes package."""

from fastapi import APIRouter
from slowapi import Limiter
from slowapi.util import get_remote_address
from backend.services.ai_gateway_service import AIGatewayService

ai_router = APIRouter(prefix="/ai", tags=["AI Chat"])
ai_gateway_service = AIGatewayService()
_limiter = Limiter(key_func=get_remote_address)

# Shared error messages / constants
_DEFAULT_TITLE = "New Conversation"
_ERR_INVALID_ID = "Invalid session id"
_ERR_NOT_FOUND = "Session not found"
_ERR_FORBIDDEN = "Not your session"
_SUPPORTED_PROVIDERS = {"coze", "local_ollama"}
_PDF_EXTRACT_MAX_CHARS = 20000
