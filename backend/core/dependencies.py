from __future__ import annotations

from functools import lru_cache

import httpx
from fastapi import Depends, HTTPException, Request

from backend.config import Config
from backend.core.security import get_current_user
from backend.services.ai_gateway_service import AIGatewayService


async def require_teacher_or_admin(user: dict = Depends(get_current_user)) -> dict:
    """FastAPI dependency — allows only teachers and admins."""
    if user.get("role", "student") not in ("teacher", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return user


@lru_cache(maxsize=1)
def get_ai_gateway_service() -> AIGatewayService:
    return AIGatewayService()


@lru_cache(maxsize=1)
def get_local_rag_service():
    try:
        from backend.services.rag_service.tfidf_rag_service import LocalRagService
        return LocalRagService()
    except Exception:
        import logging
        logging.getLogger("dependencies").warning(
            "LocalRagService could not be loaded — tfidf_rag_service may be missing."
        )
        return None


def get_http_client(request: Request) -> httpx.AsyncClient:
    return request.app.state.http_client
