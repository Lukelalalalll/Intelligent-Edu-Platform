from __future__ import annotations

import logging
import os
from concurrent.futures import ProcessPoolExecutor
from functools import lru_cache

import httpx
from fastapi import Depends, HTTPException, Request

from backend.config import Config
from backend.core.security import get_current_user
from backend.services.ai_gateway_service import AIGatewayService
from backend.services.ai_gateway_service.provider_factory import get_ai_gateway_service as _get_ai_gateway_service

logger = logging.getLogger(__name__)


async def require_teacher_or_admin(user: dict = Depends(get_current_user)) -> dict:
    """FastAPI dependency that allows only teachers and admins."""
    if user.get("role", "student") not in ("teacher", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return user


@lru_cache(maxsize=1)
def get_ai_gateway_service() -> AIGatewayService:
    return _get_ai_gateway_service()


@lru_cache(maxsize=1)
def get_local_rag_service():
    try:
        from backend.services.rag_service.tfidf_rag_service import LocalRagService

        return LocalRagService()
    except Exception:
        logger.warning(
            "LocalRagService could not be loaded; tfidf_rag_service may be missing.",
            exc_info=True,
        )
        return None


@lru_cache(maxsize=1)
def get_langchain_rag_service():
    try:
        from backend.services.rag_service.vector_rag_service import LangChainRagService

        return LangChainRagService(
            persist_root=Config.RAG_VECTORSTORE_DIR,
            embedding_model_name=Config.RAG_EMBEDDING_MODEL,
        )
    except Exception:
        logger.warning(
            "LangChainRagService could not be loaded; falling back to local RAG.",
            exc_info=True,
        )
        return None


@lru_cache(maxsize=1)
def get_process_pool() -> ProcessPoolExecutor:
    max_workers = max(1, min(4, os.cpu_count() or 1))
    return ProcessPoolExecutor(max_workers=max_workers)


def get_http_client(request: Request) -> httpx.AsyncClient:
    return request.app.state.http_client
