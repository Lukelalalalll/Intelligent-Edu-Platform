from __future__ import annotations


async def call_ai(prompt: str, provider: str = "local_ollama") -> str:
    """Call AI via the project's AIGatewayService."""
    from backend.services.ai_gateway_service.provider_factory import (
        get_ai_gateway_service,
    )

    svc = get_ai_gateway_service()
    return await svc.chat_with_provider(
        message=prompt,
        context={"system_override": "You are a helpful teaching video script writer."},
        provider=provider,
    )
