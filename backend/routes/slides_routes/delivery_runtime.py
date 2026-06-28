from __future__ import annotations

from fastapi import HTTPException


async def resolve_ppt_generator_runtime_impl(
    requested: str | None,
    *,
    feature: str,
    user: dict | None,
    require_healthy: bool,
    resolve_provider_runtime,
    check_runtime_health,
):
    raw_provider = str(requested or "auto").strip().lower()
    if raw_provider != "auto":
        return await resolve_provider_runtime(
            raw_provider,
            feature=feature,
            user=user,
            require_healthy=require_healthy,
        )

    if user:
        for candidate in ("openai", "deepseek"):
            try:
                runtime = await resolve_provider_runtime(
                    candidate,
                    feature=feature,
                    user=user,
                    require_healthy=False,
                )
            except HTTPException:
                continue
            configured = bool(runtime.health_status.get("configured"))
            if not configured:
                continue
            if require_healthy:
                healthy, message = await check_runtime_health(runtime)
                runtime.health_status = {
                    "healthy": healthy,
                    "message": message,
                    "configured": configured,
                }
                if healthy:
                    return runtime
                continue
            return runtime

    return await resolve_provider_runtime(
        "auto",
        feature=feature,
        user=user,
        require_healthy=require_healthy,
    )

