from __future__ import annotations

from backend.application.architecture_facades.user_profile.ai_config import (
    build_multimodal_openai_response,
    build_openai_response,
)
from backend.core.openai_base_url import normalize_openai_base_url
from backend.schemas.auth import MultimodalOpenAIConfigSchema, OpenAIConfigSchema


def test_normalize_openai_base_url_promotes_root_and_trims_endpoint() -> None:
    assert normalize_openai_base_url("https://api.openai.com") == "https://api.openai.com/v1"
    assert normalize_openai_base_url("https://api.openai.com/v1/") == "https://api.openai.com/v1"
    assert (
        normalize_openai_base_url("https://api.openai.com/v1/chat/completions")
        == "https://api.openai.com/v1"
    )


def test_normalize_openai_base_url_preserves_proxy_prefix() -> None:
    assert (
        normalize_openai_base_url("https://proxy.example.com/openai/chat/completions")
        == "https://proxy.example.com/openai/v1"
    )
    assert (
        normalize_openai_base_url("https://proxy.example.com/openai/v1/responses")
        == "https://proxy.example.com/openai/v1"
    )


def test_openai_config_schema_normalizes_base_url_and_defaults() -> None:
    payload = OpenAIConfigSchema(base_url="https://api.openai.com", api_key="test-key")

    assert payload.base_url == "https://api.openai.com/v1"
    assert payload.model == "gpt-5.6"


def test_multimodal_openai_config_schema_normalizes_endpoint_url() -> None:
    payload = MultimodalOpenAIConfigSchema(
        base_url="https://proxy.example.com/openai/v1/chat/completions",
        api_key="test-key",
    )

    assert payload.base_url == "https://proxy.example.com/openai/v1"
    assert payload.model == "gpt-5.6"


def test_openai_response_normalizes_legacy_base_url() -> None:
    result = build_openai_response(
        {
            "base_url": "https://api.openai.com/v1/chat/completions",
            "model": "gpt-5.5",
        },
        include_api_key=False,
    )

    assert result["base_url"] == "https://api.openai.com/v1"
    assert result["model"] == "gpt-5.5"


def test_multimodal_openai_response_uses_new_default_model() -> None:
    result = build_multimodal_openai_response({}, include_api_key=False)

    assert result["base_url"] == "https://api.openai.com/v1"
    assert result["model"] == "gpt-5.6"
