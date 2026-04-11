"""Shared router instance and constants for AI Gateway routes."""
from __future__ import annotations

from fastapi import APIRouter

ai_gateway_router = APIRouter(prefix="/api/ai/gateway", tags=["AI Gateway"])

DEFAULT_RAG_TOP_K = 4
STREAM_TEXT_CHUNK_SIZE = 24
STREAM_CHUNK_DELAY_SECONDS = 0.01
STREAM_MAX_WAIT_SECONDS = 25
DEEPSEEK_STREAM_URL = "https://api.deepseek.com/chat/completions"
