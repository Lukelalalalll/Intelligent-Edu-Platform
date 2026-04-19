"""Tests for backend.services.diagram_service — SVG generation pipeline."""
import pytest
from unittest.mock import AsyncMock, MagicMock

from backend.services.diagram_service import generate_svg
from backend.utils.svg_utils import (
    build_fallback_svg,
    estimate_svg_quality,
    validate_svg_xml,
)


# ── Utility function tests ──────────────────────────────────────────

def test_estimate_svg_quality_empty():
    assert estimate_svg_quality("") == 0


def test_estimate_svg_quality_simple_svg():
    svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="100" height="100"/></svg>'
    score = estimate_svg_quality(svg)
    assert isinstance(score, (int, float))
    assert score >= 0


def test_validate_svg_xml_valid():
    svg = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>'
    is_valid, err = validate_svg_xml(svg)
    assert is_valid is True
    assert err is None or err == ""


def test_validate_svg_xml_invalid():
    svg = '<svg><unclosed'
    is_valid, err = validate_svg_xml(svg)
    assert is_valid is False
    assert err is not None


def test_build_fallback_svg_valid_xml():
    svg = build_fallback_svg("Test diagram")
    is_valid, _ = validate_svg_xml(svg)
    assert is_valid is True
    assert "Test diagram" in svg or "svg" in svg.lower()


# ── generate_svg integration (mocked AI) ────────────────────────────

@pytest.mark.asyncio
async def test_generate_svg_happy_path():
    """When AI returns valid SVG on first try, no fallback needed."""
    good_svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>Hello</text></svg>'
    ai_service = MagicMock()
    ai_service.chat_with_provider = AsyncMock(return_value=good_svg)

    result = await generate_svg("draw a box", "local_ollama", "u1", ai_service)
    assert result["fallback_used"] is False
    assert "svg" in result["svg"].lower()


@pytest.mark.asyncio
async def test_generate_svg_fallback_on_invalid_xml():
    """When all AI attempts produce invalid XML, deterministic fallback is used."""
    bad_svg = '<svg><broken'  # invalid XML
    ai_service = MagicMock()
    ai_service.chat_with_provider = AsyncMock(return_value=bad_svg)

    result = await generate_svg("draw a box", "local_ollama", "u1", ai_service)
    assert result["fallback_used"] is True
    is_valid, _ = validate_svg_xml(result["svg"])
    assert is_valid is True
