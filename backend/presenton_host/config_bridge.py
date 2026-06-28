from __future__ import annotations

from fastapi import Request

from backend.config import Config
from backend.core.ai_provider import resolve_provider_runtime
from backend.services.auth.user_profile_service import (
    load_deepseek_runtime_config,
    load_openai_runtime_config,
)

from .auth_bridge import resolve_request_public_origin
from .paths import CONFIGURED_SENTINEL

ALLOWED_PPT_GENERATOR_OVERRIDE_PROVIDERS = {"openai", "deepseek"}


def _resolve_ppt_generator_provider_override(
    request: Request,
    *,
    has_openai: bool,
    has_deepseek: bool,
) -> str:
    override = (
        str(request.headers.get("X-Ppt-Generator-LLM-Provider") or "").strip().lower()
        or str(request.query_params.get("ppt_generator_provider") or "").strip().lower()
    )
    if override not in ALLOWED_PPT_GENERATOR_OVERRIDE_PROVIDERS:
        return ""
    if override == "openai" and not has_openai:
        return ""
    if override == "deepseek" and not has_deepseek:
        return ""
    return override


def build_ppt_generator_user_config_summary(
    *,
    selected_llm: str,
    openai_runtime: dict,
    deepseek_runtime: dict,
) -> dict:
    has_openai = bool(str(openai_runtime.get("api_key") or "").strip())
    has_deepseek = bool(str(deepseek_runtime.get("api_key") or "").strip())
    return {
        "LLM": selected_llm if selected_llm in {"openai", "deepseek"} else "openai",
        "OPENAI_API_KEY": CONFIGURED_SENTINEL if has_openai else "",
        "OPENAI_MODEL": openai_runtime.get("model") or "gpt-5.5",
        "DEEPSEEK_API_KEY": CONFIGURED_SENTINEL if has_deepseek else "",
        "DEEPSEEK_MODEL": deepseek_runtime.get("model") or "deepseek-v4-pro",
        "DEEPSEEK_BASE_URL": deepseek_runtime.get("base_url") or "https://api.deepseek.com",
        "DISABLE_IMAGE_GENERATION": not has_openai,
        "IMAGE_PROVIDER": "gpt-image-1.5" if has_openai else None,
        "WEB_GROUNDING": False,
        "WEB_SEARCH_PROVIDER": "auto",
    }


async def load_ppt_generator_host_config(
    request: Request,
    current_user: dict,
) -> tuple[dict, dict]:
    openai_runtime = await load_openai_runtime_config(current_user)
    deepseek_runtime = await load_deepseek_runtime_config(current_user)
    public_origin = resolve_request_public_origin(request)

    has_openai = bool(str(openai_runtime.get("api_key") or "").strip())
    has_deepseek = bool(str(deepseek_runtime.get("api_key") or "").strip())
    supported_providers: list[str] = []
    if has_openai:
        supported_providers.append("openai")
    if has_deepseek:
        supported_providers.append("deepseek")

    preferred_provider = str(getattr(Config, "AI_DEFAULT_PROVIDER", "") or "").strip().lower()
    if preferred_provider not in {"openai", "deepseek"}:
        preferred_provider = ""
    override_provider = _resolve_ppt_generator_provider_override(
        request,
        has_openai=has_openai,
        has_deepseek=has_deepseek,
    )
    requested_provider = (
        override_provider
        if override_provider
        else
        preferred_provider
        if preferred_provider in supported_providers
        else supported_providers[0] if supported_providers
        else "openai"
    )
    resolved_runtime = (
        await resolve_provider_runtime(
            requested_provider,
            feature="ppt_generator.runtime",
            user=current_user,
            require_healthy=False,
        )
        if supported_providers
        else None
    )
    chosen_llm = resolved_runtime.provider_id if resolved_runtime else requested_provider

    summary = build_ppt_generator_user_config_summary(
        selected_llm=chosen_llm,
        openai_runtime=openai_runtime,
        deepseek_runtime=deepseek_runtime,
    )
    overrides = {
        "CAN_CHANGE_KEYS": "false",
        "LLM": chosen_llm,
        "OPENAI_API_KEY": (
            resolved_runtime.api_key
            if resolved_runtime and resolved_runtime.provider_id == "openai"
            else openai_runtime.get("api_key") or ""
        ),
        "OPENAI_MODEL": (
            resolved_runtime.model
            if resolved_runtime and resolved_runtime.provider_id == "openai"
            else openai_runtime.get("model") or "gpt-5.5"
        ),
        "OPENAI_BASE_URL": (
            resolved_runtime.base_url
            if resolved_runtime and resolved_runtime.provider_id == "openai"
            else openai_runtime.get("base_url") or "https://api.openai.com/v1"
        ),
        "DEEPSEEK_API_KEY": (
            resolved_runtime.api_key
            if resolved_runtime and resolved_runtime.provider_id == "deepseek"
            else deepseek_runtime.get("api_key") or ""
        ),
        "DEEPSEEK_MODEL": (
            resolved_runtime.model
            if resolved_runtime and resolved_runtime.provider_id == "deepseek"
            else deepseek_runtime.get("model") or "deepseek-v4-pro"
        ),
        "DEEPSEEK_BASE_URL": (
            resolved_runtime.base_url
            if resolved_runtime and resolved_runtime.provider_id == "deepseek"
            else deepseek_runtime.get("base_url") or "https://api.deepseek.com"
        ),
        "DISABLE_IMAGE_GENERATION": "false" if has_openai else "true",
        "IMAGE_PROVIDER": "gpt-image-1.5" if has_openai else "",
        "NEXT_PUBLIC_FAST_API": public_origin,
        "NEXT_PUBLIC_URL": public_origin,
        "PUBLIC_WEB_ORIGIN": public_origin,
    }
    return summary, overrides
