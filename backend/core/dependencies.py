from __future__ import annotations

from concurrent.futures import ProcessPoolExecutor
from functools import lru_cache

import httpx
from fastapi import Request

from backend.config import Config
from backend.services.ai_gateway_service import AIGatewayService
from backend.services.tfidf_rag_service import LocalRagService


@lru_cache(maxsize=1)
def get_ai_gateway_service() -> AIGatewayService:
    return AIGatewayService()


def get_coze_service() -> AIGatewayService:
    return get_ai_gateway_service()


@lru_cache(maxsize=1)
def get_local_rag_service() -> LocalRagService:
    return LocalRagService()


@lru_cache(maxsize=1)
def get_langchain_rag_service():
    try:
        from backend.services.vector_rag_service import LangChainRagService

        return LangChainRagService(
            persist_root=Config.RAG_VECTORSTORE_DIR,
            embedding_model_name=Config.RAG_EMBEDDING_MODEL,
        )
    except Exception:
        return None


def get_http_client(request: Request) -> httpx.AsyncClient:
    return request.app.state.http_client


def get_process_pool(request: Request) -> ProcessPoolExecutor:
    return request.app.state.process_pool
