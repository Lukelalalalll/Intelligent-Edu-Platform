from __future__ import annotations

from types import SimpleNamespace

from fastapi import Request

from backend.presenton_host.config_bridge import load_ppt_generator_host_config


def _request_with_headers(*, provider_header: str | None = None, provider_query: str | None = None) -> Request:
    headers = []
    if provider_header:
        headers.append((b"x-ppt-generator-llm-provider", provider_header.encode("utf-8")))
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

