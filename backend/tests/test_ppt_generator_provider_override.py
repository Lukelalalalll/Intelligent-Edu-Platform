from __future__ import annotations

from types import SimpleNamespace

from fastapi import Request

from backend.application.architecture_facades.user_profile.ai_config import load_ai_config
from backend.presenton_host.config_bridge import load_ppt_generator_host_config


def _request_with_headers(
    *,
    provider_header: str | None = None,
    provider_query: str | None = None,
    extra_headers: list[tuple[bytes, bytes]] | None = None,
) -> Request:
    headers = []
    if provider_header:
        headers.append((b"x-ppt-generator-llm-provider", provider_header.encode("utf-8")))
    if extra_headers:
        headers.extend(extra_headers)
    query_string = ""
    if provider_query:
        query_string = f"ppt_generator_provider={provider_query}"
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/api/v1/ppt/outlines/stream/test",
        "headers": headers,
        "query_string": query_string.encode("utf-8"),
        "client": ("127.0.0.1", 1234),
        "server": ("testserver", 80),
        "scheme": "http",
    }
    return Request(scope)


async def _resolve_runtime(provider: str, **_kwargs):
    return SimpleNamespace(
        provider_id=provider,
        api_key=f"{provider}-key",
        model=f"{provider}-model",
        base_url=f"https://{provider}.example.com",
    )


async def _load_openai_config(_user):
    return {
        "api_key": "openai-key",
        "model": "gpt-5.5",
        "base_url": "https://api.openai.com/v1",
    }


async def _load_deepseek_config(_user):
    return {
        "api_key": "deepseek-key",
        "model": "deepseek-v4-pro",
        "base_url": "https://api.deepseek.com",
    }


async def _load_multimodal_openai_config(_user):
    return {
        "api_key": "multimodal-openai-key",
        "model": "gpt-4o",
        "base_url": "https://api.openai.com/v1",
    }


async def _load_bigmodel_config(_user):
    return {
        "api_key": "bigmodel-key",
        "model": "glm-4.5-flash",
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
    }


async def _load_multimodal_bigmodel_config(_user):
    return {
        "api_key": "multimodal-bigmodel-key",
        "model": "glm-5v-flash",
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
    }


async def _load_deepseek_unconfigured(_user):
    return {
        "api_key": "",
        "model": "deepseek-v4-pro",
        "base_url": "https://api.deepseek.com",
    }


async def test_ppt_generator_provider_override_prefers_valid_configured_header(monkeypatch):
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.load_openai_runtime_config",
        _load_openai_config,
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.load_deepseek_runtime_config",
        _load_deepseek_config,
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.load_multimodal_openai_runtime_config",
        _load_multimodal_openai_config,
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.load_bigmodel_runtime_config",
        _load_bigmodel_config,
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.load_multimodal_bigmodel_runtime_config",
        _load_multimodal_bigmodel_config,
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.resolve_request_public_origin",
        lambda _request: "http://localhost:5173",
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.resolve_provider_runtime",
        _resolve_runtime,
    )

    summary, overrides = await load_ppt_generator_host_config(
        _request_with_headers(provider_header="deepseek"),
        {"id": "user-1"},
    )

    assert summary["LLM"] == "deepseek"
    assert overrides["LLM"] == "deepseek"
    assert overrides["DEEPSEEK_MODEL"] == "deepseek-model"


async def test_ppt_generator_provider_override_ignores_unconfigured_provider(monkeypatch):
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.load_openai_runtime_config",
        _load_openai_config,
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.load_deepseek_runtime_config",
        _load_deepseek_unconfigured,
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.load_multimodal_openai_runtime_config",
        _load_multimodal_openai_config,
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.load_bigmodel_runtime_config",
        _load_bigmodel_config,
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.load_multimodal_bigmodel_runtime_config",
        _load_multimodal_bigmodel_config,
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.resolve_request_public_origin",
        lambda _request: "http://localhost:5173",
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.resolve_provider_runtime",
        _resolve_runtime,
    )

    summary, overrides = await load_ppt_generator_host_config(
        _request_with_headers(provider_header="deepseek"),
        {"id": "user-1"},
    )

    assert summary["LLM"] == "openai"
    assert overrides["LLM"] == "openai"


async def test_ppt_generator_provider_override_reads_query_param_for_sse(monkeypatch):
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.load_openai_runtime_config",
        _load_openai_config,
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.load_deepseek_runtime_config",
        _load_deepseek_config,
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.load_multimodal_openai_runtime_config",
        _load_multimodal_openai_config,
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.load_bigmodel_runtime_config",
        _load_bigmodel_config,
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.load_multimodal_bigmodel_runtime_config",
        _load_multimodal_bigmodel_config,
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.resolve_request_public_origin",
        lambda _request: "http://localhost:5173",
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.resolve_provider_runtime",
        _resolve_runtime,
    )

    summary, overrides = await load_ppt_generator_host_config(
        _request_with_headers(provider_query="openai"),
        {"id": "user-1"},
    )

    assert summary["LLM"] == "openai"
    assert overrides["LLM"] == "openai"


async def test_ppt_generator_multimodal_override_uses_multimodal_openai_runtime(monkeypatch):
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.load_openai_runtime_config",
        _load_openai_config,
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.load_deepseek_runtime_config",
        _load_deepseek_config,
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.load_multimodal_openai_runtime_config",
        _load_multimodal_openai_config,
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.load_bigmodel_runtime_config",
        _load_bigmodel_config,
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.load_multimodal_bigmodel_runtime_config",
        _load_multimodal_bigmodel_config,
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.resolve_request_public_origin",
        lambda _request: "http://localhost:5173",
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.resolve_provider_runtime",
        _resolve_runtime,
    )

    _summary, overrides = await load_ppt_generator_host_config(
        _request_with_headers(
            extra_headers=[
                (b"x-ppt-generator-capability", b"multimodal"),
                (b"x-ppt-generator-multimodal-provider", b"openai"),
            ]
        ),
        {"id": "user-1"},
    )

    assert overrides["LLM"] == "openai"
    assert overrides["OPENAI_MODEL"] == "gpt-4o"
    assert overrides["OPENAI_API_KEY"] == "multimodal-openai-key"


async def test_ppt_generator_provider_override_supports_bigmodel(monkeypatch):
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.load_openai_runtime_config",
        _load_openai_config,
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.load_deepseek_runtime_config",
        _load_deepseek_config,
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.load_bigmodel_runtime_config",
        _load_bigmodel_config,
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.load_multimodal_openai_runtime_config",
        _load_multimodal_openai_config,
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.load_multimodal_bigmodel_runtime_config",
        _load_multimodal_bigmodel_config,
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.resolve_request_public_origin",
        lambda _request: "http://localhost:5173",
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.resolve_provider_runtime",
        _resolve_runtime,
    )

    summary, overrides = await load_ppt_generator_host_config(
        _request_with_headers(provider_header="bigmodel"),
        {"id": "user-1"},
    )

    assert summary["LLM"] == "bigmodel"
    assert overrides["LLM"] == "bigmodel"
    assert overrides["BIGMODEL_MODEL"] == "bigmodel-model"
    assert overrides["BIGMODEL_API_KEY"] == "bigmodel-key"


async def test_ppt_generator_multimodal_override_supports_bigmodel(monkeypatch):
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.load_openai_runtime_config",
        _load_openai_config,
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.load_deepseek_runtime_config",
        _load_deepseek_config,
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.load_bigmodel_runtime_config",
        _load_bigmodel_config,
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.load_multimodal_openai_runtime_config",
        _load_multimodal_openai_config,
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.load_multimodal_bigmodel_runtime_config",
        _load_multimodal_bigmodel_config,
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.resolve_request_public_origin",
        lambda _request: "http://localhost:5173",
    )
    monkeypatch.setattr(
        "backend.presenton_host.config_bridge.resolve_provider_runtime",
        _resolve_runtime,
    )

    _summary, overrides = await load_ppt_generator_host_config(
        _request_with_headers(
            extra_headers=[
                (b"x-ppt-generator-capability", b"multimodal"),
                (b"x-ppt-generator-multimodal-provider", b"bigmodel"),
            ]
        ),
        {"id": "user-1"},
    )

    assert overrides["LLM"] == "bigmodel"
    assert overrides["OPENAI_MODEL"] == "glm-5v-flash"
    assert overrides["OPENAI_API_KEY"] == "multimodal-bigmodel-key"


async def test_load_ai_config_returns_text_aliases_and_multimodal_groups(monkeypatch):
    async def _find_one(_query, _projection):
        return {
            "ai_config": {
                "deepseek": {
                    "api_key": "legacy-deepseek-key",
                    "model": "deepseek-v4-pro",
                },
                "openai": {
                    "api_key": "legacy-openai-key",
                    "model": "gpt-5.5",
                },
                "multimodal": {
                    "openai": {
                        "api_key": "multimodal-openai-key",
                        "model": "gpt-4o",
                    }
                },
                "bigmodel": {
                    "api_key": "bigmodel-key",
                    "text_model": "glm-4.5-flash",
                    "image_model": "glm-5v-flash",
                }
            }
        }

    monkeypatch.setattr(
        "backend.application.architecture_facades.user_profile.ai_config.db",
        SimpleNamespace(users=SimpleNamespace(find_one=_find_one)),
    )
    monkeypatch.setattr(
        "backend.application.architecture_facades.user_profile.ai_config.decrypt_secret",
        lambda value: value,
    )

    result = await load_ai_config({"_id": "user-1"}, include_api_keys=True)

    assert result["deepseek"]["api_key"] == "legacy-deepseek-key"
    assert result["openai"]["api_key"] == "legacy-openai-key"
    assert result["text"]["deepseek"]["model"] == "deepseek-v4-pro"
    assert result["text"]["openai"]["model"] == "gpt-5.5"
    assert result["bigmodel"]["api_key"] == "bigmodel-key"
    assert result["text"]["bigmodel"]["model"] == "glm-4.5-flash"
    assert result["multimodal"]["openai"]["api_key"] == "multimodal-openai-key"
    assert result["multimodal"]["openai"]["model"] == "gpt-4o"
    assert result["multimodal"]["bigmodel"]["model"] == "glm-5v-flash"

