from __future__ import annotations

from typing import Literal

from fastapi import HTTPException

from backend.config import Config

AIProvider = Literal["coze", "local_ollama", "deepseek"]
_SUPPORTED_PROVIDERS = {"coze", "local_ollama", "deepseek"}


def resolve_provider(requested: str | None, feature: str = "ai") -> AIProvider:
    provider = str(requested or Config.AI_DEFAULT_PROVIDER or "local_ollama").strip().lower()
    if provider not in _SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported provider for {feature}: {provider}")

    if not Config.AI_ALLOW_PROVIDER_SWITCH and requested and provider != Config.AI_DEFAULT_PROVIDER:
        raise HTTPException(status_code=400, detail="Provider switching is disabled")

    return provider  # type: ignore[return-value]
