from __future__ import annotations

from functools import lru_cache

from backend.services.ai_gateway_service import AIGatewayService


@lru_cache(maxsize=1)
def get_ai_gateway_service() -> AIGatewayService:
    return AIGatewayService()


def get_default_service() -> AIGatewayService:
    return get_ai_gateway_service()
