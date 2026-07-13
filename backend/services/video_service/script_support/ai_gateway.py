from __future__ import annotations


async def call_ai(
    prompt: str,
    provider: str = "local_ollama",
    *,
    user: dict | None = None,
    system_override: str = "You are a helpful teaching video script writer.",
) -> str:
    """Call AI via the project's AIGatewayService."""
    from backend.core.ai_provider import resolve_provider_runtime
    from backend.services.ai_gateway_service.provider_factory import (
        get_ai_gateway_service,
    )

    svc = get_ai_gateway_service()
    context = {"system_override": system_override}
    if user:
        runtime = await resolve_provider_runtime(
            provider,
            feature="video_generation",
            user=user,
            require_healthy=False,
        )
        return await svc.chat_with_runtime(
            message=prompt,
            context=context,
            runtime=runtime,
            allow_fallback=True,
        )
    return await svc.chat_with_provider(
        message=prompt,
        context=context,
        provider=provider,
    )
