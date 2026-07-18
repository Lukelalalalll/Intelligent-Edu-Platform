from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal

from fastapi import HTTPException

from backend.config import Config

AIProvider = Literal["auto", "coze", "local_ollama", "deepseek", "openai", "bigmodel"]
ConcreteAIProvider = Literal["coze", "local_ollama", "deepseek", "openai", "bigmodel"]
ProviderConfigSource = Literal["user_ai_config", "env_default", "global_service", "auto_fallback"]
_SUPPORTED_PROVIDERS = {"auto", "coze", "local_ollama", "deepseek", "openai", "bigmodel"}
_CONCRETE_PROVIDERS = {"coze", "local_ollama", "deepseek", "openai", "bigmodel"}


@dataclass(slots=True)
class ResolvedProviderRuntime:
    provider_id: ConcreteAIProvider
    requested_provider: AIProvider
    config_source: ProviderConfigSource
    model: str
    base_url: str
    stream: bool = False
    capabilities: dict[str, bool] = field(default_factory=dict)
    health_status: dict[str, Any] = field(default_factory=dict)
    api_key: str = ""

    def public_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data.pop("api_key", None)
        return data


@dataclass(slots=True)
class ProviderStatus:
    id: AIProvider
    label: str
    available: bool
    configured: bool
    source: ProviderConfigSource | str
    model: str
    message: str
    is_recommended: bool = False

    def public_dict(self) -> dict[str, Any]:
        return asdict(self)


def resolve_provider(requested: str | None, feature: str = "ai", user: dict | None = None) -> AIProvider:
    raw_provider = str(requested or Config.AI_DEFAULT_PROVIDER or "local_ollama").strip().lower()
    provider = raw_provider
    if provider == "auto":
        provider = str(Config.AI_DEFAULT_PROVIDER or "local_ollama").strip().lower()
        if provider == "auto":
            provider = "local_ollama"
    if provider not in _SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported provider for {feature}: {provider}")

    if provider not in _CONCRETE_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported provider for {feature}: {provider}")

    if not Config.AI_ALLOW_PROVIDER_SWITCH and requested and raw_provider != "auto" and provider != Config.AI_DEFAULT_PROVIDER:
        raise HTTPException(status_code=400, detail="Provider switching is disabled")

    return provider  # type: ignore[return-value]


def _capabilities(provider: str) -> dict[str, bool]:
    return {
        "json": True,
        "reasoning": provider == "deepseek",
        "streaming": provider in {"local_ollama", "coze", "deepseek", "openai", "bigmodel"},
        "vision": provider in {"local_ollama", "bigmodel"},
    }


async def _runtime_for_provider(
    provider: ConcreteAIProvider,
    *,
    requested: AIProvider,
    user: dict | None,
    config_source: ProviderConfigSource | None = None,
) -> ResolvedProviderRuntime:
    if provider == "openai":
        config: dict[str, Any] = {}
        if user:
            from backend.services.auth.user_profile_service import load_openai_runtime_config
            config = await load_openai_runtime_config(user)
        user_key = str(config.get("api_key") or "").strip()
        env_key = str(getattr(Config, "OPENAI_API_KEY", "") or "").strip()
        if config_source == "user_ai_config":
            api_key = user_key
            source: ProviderConfigSource = "user_ai_config"
        elif config_source == "env_default":
            api_key = env_key
            source = "env_default"
            config = {}
        else:
            api_key = user_key or env_key
            source = "user_ai_config" if user_key else "env_default"
        return ResolvedProviderRuntime(
            provider_id="openai",
            requested_provider=requested,
            config_source=source,
            model=str(config.get("model") or getattr(Config, "OPENAI_MODEL", "gpt-5.5")),
            base_url=str(config.get("base_url") or getattr(Config, "OPENAI_BASE_URL", "https://api.openai.com/v1")).rstrip("/"),
            stream=bool(config.get("stream", False)),
            capabilities=_capabilities("openai"),
            health_status={"configured": bool(api_key)},
            api_key=api_key,
        )

    if provider == "bigmodel":
        config = {}
        if user:
            from backend.services.auth.user_profile_service import load_bigmodel_runtime_config
            config = await load_bigmodel_runtime_config(user)
        user_key = str(config.get("api_key") or "").strip()
        if config_source == "user_ai_config":
            api_key = user_key
            source: ProviderConfigSource = "user_ai_config"
        else:
            api_key = user_key
            source = "user_ai_config"
        return ResolvedProviderRuntime(
            provider_id="bigmodel",
            requested_provider=requested,
            config_source=source,
            model=str(config.get("model") or "glm-4.5-flash"),
            base_url=str(config.get("base_url") or "https://open.bigmodel.cn/api/paas/v4").rstrip("/"),
            stream=bool(config.get("stream", False)),
            capabilities=_capabilities("bigmodel"),
            health_status={"configured": bool(api_key)},
            api_key=api_key,
        )

    if provider == "deepseek":
        config = {}
        if user:
            from backend.services.auth.user_profile_service import load_deepseek_runtime_config
            config = await load_deepseek_runtime_config(user)
        user_key = str(config.get("api_key") or "").strip()
        env_key = str(Config.DEEPSEEK_API_KEY or "").strip()
        if config_source == "user_ai_config":
            api_key = user_key
            source = "user_ai_config"
        elif config_source == "env_default":
            api_key = env_key
            source = "env_default"
            config = {}
        else:
            api_key = user_key or env_key
            source = "user_ai_config" if user_key else "env_default"
        return ResolvedProviderRuntime(
            provider_id="deepseek",
            requested_provider=requested,
            config_source=source,
            model=str(config.get("model") or Config.DEEPSEEK_MODEL),
            base_url=str(config.get("base_url") or Config.DEEPSEEK_BASE_URL).rstrip("/"),
            stream=bool(config.get("stream", False)),
            capabilities=_capabilities("deepseek"),
            health_status={"configured": bool(api_key)},
            api_key=api_key,
        )

    if provider == "local_ollama":
        return ResolvedProviderRuntime(
            provider_id="local_ollama",
            requested_provider=requested,
            config_source=config_source or "global_service",
            model=Config.OLLAMA_MODEL,
            base_url=Config.OLLAMA_BASE_URL.rstrip("/"),
            stream=True,
            capabilities=_capabilities("local_ollama"),
            health_status={"configured": True},
        )

    return ResolvedProviderRuntime(
        provider_id="coze",
        requested_provider=requested,
        config_source=config_source or "global_service",
        model=(Config.COZE_BOT_ID or "coze-bot").strip(),
        base_url=Config.COZE_API_ROOT.rstrip("/"),
        stream=True,
        capabilities=_capabilities("coze"),
        health_status={"configured": bool(Config.COZE_TOKEN and Config.COZE_BOT_ID)},
        api_key=str(Config.COZE_TOKEN or ""),
    )


async def resolve_provider_runtime(
    requested: str | None,
    *,
    feature: str = "ai",
    user: dict | None = None,
    require_healthy: bool = False,
) -> ResolvedProviderRuntime:
    raw_provider = str(requested or "auto").strip().lower()
    if raw_provider not in _SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported provider for {feature}: {raw_provider}")

    provider = resolve_provider(raw_provider, feature=feature, user=user) if raw_provider != "auto" else "auto"
    if provider != "auto":
        config_source: ProviderConfigSource | None = None
        if provider in {"openai", "deepseek", "bigmodel"}:
            config_source = "user_ai_config" if user else "env_default"
        runtime = await _runtime_for_provider(provider, requested=provider, user=user, config_source=config_source)
        if require_healthy:
            await _assert_runtime_healthy(runtime, feature=feature)
        return runtime

    candidates: list[tuple[ConcreteAIProvider, dict | None, ProviderConfigSource]] = []
    if user:
        candidates.extend([
            ("openai", user, "user_ai_config"),
            ("bigmodel", user, "user_ai_config"),
            ("deepseek", user, "user_ai_config"),
        ])
    candidates.extend([
        ("local_ollama", None, "global_service"),
        ("deepseek", None, "env_default"),
        ("coze", None, "global_service"),
    ])

    for candidate, candidate_user, source in candidates:
        runtime = await _runtime_for_provider(
            candidate,
            requested="auto",
            user=candidate_user,
            config_source=source,
        )
        healthy, message = await check_runtime_health(runtime)
        runtime.health_status = {"healthy": healthy, "message": message, "configured": runtime.health_status.get("configured", False)}
        if healthy:
            return runtime

    raise HTTPException(status_code=503, detail=f"No healthy AI provider available for {feature}")


async def _assert_runtime_healthy(runtime: ResolvedProviderRuntime, *, feature: str) -> None:
    healthy, message = await check_runtime_health(runtime)
    runtime.health_status = {"healthy": healthy, "message": message, "configured": runtime.health_status.get("configured", False)}
    if not healthy:
        raise HTTPException(status_code=503, detail=f"Provider {runtime.provider_id} unavailable for {feature}: {message}")


async def check_runtime_health(runtime: ResolvedProviderRuntime) -> tuple[bool, str]:
    from backend.services.ai_gateway_service.provider_factory import get_ai_gateway_service

    return await get_ai_gateway_service().check_runtime_health(runtime)


async def list_provider_statuses(
    user: dict | None = None,
    *,
    feature: str = "ai.providers",
) -> list[ProviderStatus]:
    requested: list[ConcreteAIProvider] = ["openai", "bigmodel", "deepseek", "local_ollama", "coze"]
    statuses: list[ProviderStatus] = []
    for provider in requested:
        config_source: ProviderConfigSource | None = None
        if provider in {"openai", "deepseek", "bigmodel"}:
            config_source = "user_ai_config" if user else "env_default"
        runtime = await _runtime_for_provider(
            provider,
            requested=provider,
            user=user,
            config_source=config_source,
        )
        healthy, message = await check_runtime_health(runtime)
        configured = bool(runtime.health_status.get("configured"))
        statuses.append(
            ProviderStatus(
                id=provider,  # type: ignore[arg-type]
                label={
                    "openai": "OpenAI",
                    "bigmodel": "BigModel / GLM",
                    "deepseek": "DeepSeek",
                    "local_ollama": "Local Ollama",
                    "coze": "Coze",
                }[provider],
                available=healthy,
                configured=configured,
                source=runtime.config_source,
                model=runtime.model,
                message=message,
            )
        )

    recommended_runtime: ResolvedProviderRuntime | None = None
    try:
        recommended_runtime = await resolve_provider_runtime("auto", feature=feature, user=user)
        recommended_id: AIProvider = recommended_runtime.provider_id
    except HTTPException:
        recommended_id = "auto"
    return [
        ProviderStatus(
            id="auto",
            label="Auto",
            available=any(item.available for item in statuses),
            configured=True,
            source="auto",
            model=str(recommended_runtime.model if recommended_runtime else ""),
            message=(
                f"Will use {recommended_id} ({recommended_runtime.model})"
                if recommended_runtime and recommended_id != "auto"
                else "No provider available"
            ),
            is_recommended=True,
        ),
        *[
            ProviderStatus(**{**asdict(item), "is_recommended": item.id == recommended_id})
            for item in statuses
        ],
    ]
