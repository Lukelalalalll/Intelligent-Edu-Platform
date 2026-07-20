from __future__ import annotations

from fastapi import Request

from backend.config import Config
from backend.core.ai_provider import resolve_provider_runtime
from backend.services.auth.user_profile_service import (
    load_bigmodel_runtime_config,
    load_claude_runtime_config,
    load_deepseek_runtime_config,
    load_minimax_image_runtime_config,
    load_minimax_runtime_config,
    load_multimodal_bigmodel_runtime_config,
    load_multimodal_minimax_runtime_config,
    load_multimodal_openai_runtime_config,
    load_openai_runtime_config,
)

from .auth_bridge import resolve_request_public_origin
from .paths import CONFIGURED_SENTINEL

ALLOWED_PPT_GENERATOR_OVERRIDE_PROVIDERS = {"openai", "claude", "deepseek", "bigmodel", "minimax"}
ALLOWED_PPT_GENERATOR_MULTIMODAL_PROVIDERS = {"openai", "bigmodel", "minimax"}


def _resolve_ppt_generator_provider_override(
    request: Request,
    *,
    has_openai: bool,
    has_claude: bool,
    has_deepseek: bool,
    has_bigmodel: bool,
    has_minimax: bool,
) -> str:
    override = (
        str(request.headers.get("X-Ppt-Generator-LLM-Provider") or "").strip().lower()
        or str(request.query_params.get("ppt_generator_provider") or "").strip().lower()
    )
    if override not in ALLOWED_PPT_GENERATOR_OVERRIDE_PROVIDERS:
        return ""
    if override == "openai" and not has_openai:
        return ""
    if override == "claude" and not has_claude:
        return ""
    if override == "deepseek" and not has_deepseek:
        return ""
    if override == "bigmodel" and not has_bigmodel:
        return ""
    if override == "minimax" and not has_minimax:
        return ""
    return override


def _resolve_ppt_generator_capability(request: Request) -> str:
    return (
        str(request.headers.get("X-Ppt-Generator-Capability") or "").strip().lower()
        or str(request.query_params.get("ppt_generator_capability") or "").strip().lower()
    )


def _resolve_ppt_generator_multimodal_override(
    request: Request,
    *,
    has_multimodal_openai: bool,
    has_multimodal_bigmodel: bool,
    has_multimodal_minimax: bool,
) -> str:
    override = (
        str(request.headers.get("X-Ppt-Generator-Multimodal-Provider") or "").strip().lower()
        or str(request.query_params.get("ppt_generator_multimodal_provider") or "").strip().lower()
    )
    if override not in ALLOWED_PPT_GENERATOR_MULTIMODAL_PROVIDERS:
        return ""
    if override == "openai" and not has_multimodal_openai:
        return ""
    if override == "bigmodel" and not has_multimodal_bigmodel:
        return ""
    if override == "minimax" and not has_multimodal_minimax:
        return ""
    return override


def build_ppt_generator_user_config_summary(
    *,
    selected_llm: str,
    openai_runtime: dict,
    claude_runtime: dict,
    deepseek_runtime: dict,
    bigmodel_runtime: dict,
    minimax_runtime: dict,
    minimax_image_runtime: dict | None = None,
) -> dict:
    has_openai = bool(str(openai_runtime.get("api_key") or "").strip())
    has_claude = bool(str(claude_runtime.get("api_key") or "").strip())
    has_deepseek = bool(str(deepseek_runtime.get("api_key") or "").strip())
    has_bigmodel = bool(str(bigmodel_runtime.get("api_key") or "").strip())
    has_minimax = bool(str(minimax_runtime.get("api_key") or "").strip())
    minimax_image_runtime = minimax_image_runtime or {}
    summary_llm = "anthropic" if selected_llm == "claude" else selected_llm
    return {
        "LLM": summary_llm if summary_llm in {"openai", "anthropic", "deepseek", "bigmodel", "minimax"} else "openai",
        "OPENAI_API_KEY": CONFIGURED_SENTINEL if has_openai else "",
        "OPENAI_MODEL": openai_runtime.get("model") or "gpt-5.6",
        "ANTHROPIC_API_KEY": CONFIGURED_SENTINEL if has_claude else "",
        "ANTHROPIC_MODEL": claude_runtime.get("model") or "claude-sonnet-5",
        "DEEPSEEK_API_KEY": CONFIGURED_SENTINEL if has_deepseek else "",
        "DEEPSEEK_MODEL": deepseek_runtime.get("model") or "deepseek-v4-pro",
        "DEEPSEEK_BASE_URL": deepseek_runtime.get("base_url") or "https://api.deepseek.com",
        "BIGMODEL_API_KEY": CONFIGURED_SENTINEL if has_bigmodel else "",
        "BIGMODEL_MODEL": bigmodel_runtime.get("model") or "glm-4.5-flash",
        "BIGMODEL_BASE_URL": bigmodel_runtime.get("base_url") or "https://open.bigmodel.cn/api/paas/v4",
        "MINIMAX_API_KEY": CONFIGURED_SENTINEL if has_minimax else "",
        "MINIMAX_MODEL": minimax_runtime.get("model") or "MiniMax-M2.7",
        "MINIMAX_BASE_URL": minimax_runtime.get("base_url") or "https://api.minimaxi.com/v1",
        "MINIMAX_IMAGE_MODEL": minimax_image_runtime.get("model") or "image-01",
        "MINIMAX_IMAGE_BASE_URL": minimax_image_runtime.get("base_url") or "https://api.minimaxi.com/v1",
        "DISABLE_IMAGE_GENERATION": not (has_openai or has_bigmodel),
        "IMAGE_PROVIDER": "gpt-image-1.5" if has_openai else ("glm-5v-flash" if has_bigmodel else None),
        "WEB_GROUNDING": False,
        "WEB_SEARCH_PROVIDER": "auto",
    }


async def load_ppt_generator_host_config(
    request: Request,
    current_user: dict,
) -> tuple[dict, dict]:
    openai_runtime = await load_openai_runtime_config(current_user)
    claude_runtime = await load_claude_runtime_config(current_user)
    deepseek_runtime = await load_deepseek_runtime_config(current_user)
    bigmodel_runtime = await load_bigmodel_runtime_config(current_user)
    minimax_runtime = await load_minimax_runtime_config(current_user)
    minimax_image_runtime = await load_minimax_image_runtime_config(current_user)
    multimodal_openai_runtime = await load_multimodal_openai_runtime_config(current_user)
    multimodal_bigmodel_runtime = await load_multimodal_bigmodel_runtime_config(current_user)
    multimodal_minimax_runtime = await load_multimodal_minimax_runtime_config(current_user)
    public_origin = resolve_request_public_origin(request)

    has_openai = bool(str(openai_runtime.get("api_key") or "").strip())
    has_claude = bool(str(claude_runtime.get("api_key") or "").strip())
    has_deepseek = bool(str(deepseek_runtime.get("api_key") or "").strip())
    has_bigmodel = bool(str(bigmodel_runtime.get("api_key") or "").strip())
    has_minimax = bool(str(minimax_runtime.get("api_key") or "").strip())
    has_multimodal_openai = bool(
        str(multimodal_openai_runtime.get("api_key") or "").strip()
    )
    has_multimodal_bigmodel = bool(
        str(multimodal_bigmodel_runtime.get("api_key") or "").strip()
    )
    has_multimodal_minimax = bool(
        str(multimodal_minimax_runtime.get("api_key") or "").strip()
    )
    supported_providers: list[str] = []
    if has_openai:
        supported_providers.append("openai")
    if has_claude:
        supported_providers.append("claude")
    if has_bigmodel:
        supported_providers.append("bigmodel")
    if has_deepseek:
        supported_providers.append("deepseek")
    if has_minimax:
        supported_providers.append("minimax")

    preferred_provider = str(getattr(Config, "AI_DEFAULT_PROVIDER", "") or "").strip().lower()
    if preferred_provider not in {"openai", "claude", "deepseek", "bigmodel", "minimax"}:
        preferred_provider = ""
    override_provider = _resolve_ppt_generator_provider_override(
        request,
        has_openai=has_openai,
        has_claude=has_claude,
        has_deepseek=has_deepseek,
        has_bigmodel=has_bigmodel,
        has_minimax=has_minimax,
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
        claude_runtime=claude_runtime,
        deepseek_runtime=deepseek_runtime,
        bigmodel_runtime=bigmodel_runtime,
        minimax_runtime=minimax_runtime,
        minimax_image_runtime=minimax_image_runtime,
    )
    overrides = {
        "CAN_CHANGE_KEYS": "false",
        "LLM": "anthropic" if chosen_llm == "claude" else chosen_llm,
        "OPENAI_API_KEY": (
            resolved_runtime.api_key
            if resolved_runtime and resolved_runtime.provider_id == "openai"
            else openai_runtime.get("api_key") or ""
        ),
        "OPENAI_MODEL": (
            resolved_runtime.model
            if resolved_runtime and resolved_runtime.provider_id == "openai"
            else openai_runtime.get("model") or "gpt-5.6"
        ),
        "OPENAI_BASE_URL": (
            resolved_runtime.base_url
            if resolved_runtime and resolved_runtime.provider_id == "openai"
            else openai_runtime.get("base_url") or "https://api.openai.com/v1"
        ),
        "ANTHROPIC_API_KEY": (
            resolved_runtime.api_key
            if resolved_runtime and resolved_runtime.provider_id == "claude"
            else claude_runtime.get("api_key") or ""
        ),
        "ANTHROPIC_MODEL": (
            resolved_runtime.model
            if resolved_runtime and resolved_runtime.provider_id == "claude"
            else claude_runtime.get("model") or "claude-sonnet-5"
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
        "BIGMODEL_API_KEY": (
            resolved_runtime.api_key
            if resolved_runtime and resolved_runtime.provider_id == "bigmodel"
            else bigmodel_runtime.get("api_key") or ""
        ),
        "BIGMODEL_MODEL": (
            resolved_runtime.model
            if resolved_runtime and resolved_runtime.provider_id == "bigmodel"
            else bigmodel_runtime.get("model") or "glm-4.5-flash"
        ),
        "BIGMODEL_BASE_URL": (
            resolved_runtime.base_url
            if resolved_runtime and resolved_runtime.provider_id == "bigmodel"
            else bigmodel_runtime.get("base_url") or "https://open.bigmodel.cn/api/paas/v4"
        ),
        "MINIMAX_API_KEY": (
            resolved_runtime.api_key
            if resolved_runtime and resolved_runtime.provider_id == "minimax"
            else minimax_runtime.get("api_key") or ""
        ),
        "MINIMAX_MODEL": (
            resolved_runtime.model
            if resolved_runtime and resolved_runtime.provider_id == "minimax"
            else minimax_runtime.get("model") or "MiniMax-M2.7"
        ),
        "MINIMAX_BASE_URL": (
            resolved_runtime.base_url
            if resolved_runtime and resolved_runtime.provider_id == "minimax"
            else minimax_runtime.get("base_url") or "https://api.minimaxi.com/v1"
        ),
        "MINIMAX_IMAGE_API_KEY": minimax_image_runtime.get("api_key") or "",
        "MINIMAX_IMAGE_MODEL": minimax_image_runtime.get("model") or "image-01",
        "MINIMAX_IMAGE_BASE_URL": minimax_image_runtime.get("base_url") or "https://api.minimaxi.com/v1",
        "DISABLE_IMAGE_GENERATION": "false" if (has_openai or has_bigmodel) else "true",
        "IMAGE_PROVIDER": "gpt-image-1.5" if has_openai else ("glm-5v-flash" if has_bigmodel else ""),
        "NEXT_PUBLIC_FAST_API": public_origin,
        "NEXT_PUBLIC_URL": public_origin,
        "PUBLIC_WEB_ORIGIN": public_origin,
    }

    if _resolve_ppt_generator_capability(request) == "multimodal":
        multimodal_provider = _resolve_ppt_generator_multimodal_override(
            request,
            has_multimodal_openai=has_multimodal_openai,
            has_multimodal_bigmodel=has_multimodal_bigmodel,
            has_multimodal_minimax=has_multimodal_minimax,
        )
        if multimodal_provider == "openai":
            overrides.update(
                {
                    "LLM": "openai",
                    "OPENAI_API_KEY": multimodal_openai_runtime.get("api_key") or "",
                    "OPENAI_MODEL": multimodal_openai_runtime.get("model") or "gpt-5.6",
                    "OPENAI_BASE_URL": multimodal_openai_runtime.get("base_url")
                    or "https://api.openai.com/v1",
                }
            )
        if multimodal_provider == "bigmodel":
            overrides.update(
                {
                    "LLM": "bigmodel",
                    "OPENAI_API_KEY": multimodal_bigmodel_runtime.get("api_key") or "",
                    "OPENAI_MODEL": multimodal_bigmodel_runtime.get("model") or "glm-5v-flash",
                    "OPENAI_BASE_URL": multimodal_bigmodel_runtime.get("base_url")
                    or "https://open.bigmodel.cn/api/paas/v4",
                }
            )
        if multimodal_provider == "minimax":
            overrides.update(
                {
                    "LLM": "minimax",
                    "OPENAI_API_KEY": multimodal_minimax_runtime.get("api_key") or "",
                    "OPENAI_MODEL": multimodal_minimax_runtime.get("model") or "MiniMax-M3",
                    "OPENAI_BASE_URL": multimodal_minimax_runtime.get("base_url")
                    or "https://api.minimaxi.com/v1",
                    "MINIMAX_API_KEY": multimodal_minimax_runtime.get("api_key") or "",
                    "MINIMAX_MODEL": multimodal_minimax_runtime.get("model") or "MiniMax-M3",
                    "MINIMAX_BASE_URL": multimodal_minimax_runtime.get("base_url")
                    or "https://api.minimaxi.com/v1",
                }
            )
    return summary, overrides
