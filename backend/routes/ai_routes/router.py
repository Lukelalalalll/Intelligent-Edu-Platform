"""Shared APIRouter instance and constants for the AI routes package."""

from fastapi import APIRouter
from backend.routes.auth_routes.router import limiter as _limiter

ai_router = APIRouter(prefix="/ai", tags=["AI Chat"])

# Shared error messages / constants
_DEFAULT_TITLE = "New Conversation"
_ERR_INVALID_ID = "Invalid session id"
_ERR_NOT_FOUND = "Session not found"
_ERR_FORBIDDEN = "Not your session"
_SUPPORTED_PROVIDERS = {"coze", "local_ollama", "deepseek", "openai", "bigmodel"}
_PDF_EXTRACT_MAX_CHARS = 20000
