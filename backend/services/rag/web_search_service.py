"""SearXNG-backed web search service.

SearXNG is completely self-hosted — no API key or paid account required.
It aggregates results from Google, Bing, DuckDuckGo, Wikipedia, etc.

Usage:
    results = await search_web("Python async generators", engine="google")
    # → [{"title": ..., "url": ..., "content": ...}, ...]

Configuration (backend/.env):
    SEARXNG_ENABLED=true
    SEARXNG_BASE_URL=http://searxng:8080   # Docker service name
    SEARXNG_MAX_RESULTS=5
    SEARXNG_TIMEOUT_SECONDS=6.0
    SEARXNG_FETCH_CONTENT=false            # set true to scrape page bodies
"""
from __future__ import annotations

import asyncio
import logging
from typing import Literal

import httpx

from backend.config import Config
from backend.core.safe_requests import safe_get

logger = logging.getLogger(__name__)

# ── Supported engine names (passed directly to SearXNG) ──────────
SUPPORTED_ENGINES: dict[str, str] = {
    "auto":        "",                      # let SearXNG pick defaults
    "google":      "google",
    "bing":        "bing",
    "duckduckgo":  "duckduckgo",
    "wikipedia":   "wikipedia",
    "arxiv":       "arxiv",
    "google_scholar": "google scholar",
}

WebEngine = Literal["auto", "google", "bing", "duckduckgo", "wikipedia", "arxiv", "google_scholar"]


async def search_web(
    query: str,
    *,
    engine: WebEngine = "auto",
    language: str = "auto",
) -> list[dict]:
    """Query SearXNG and return cleaned result dicts.

    Each item:
        {
            "title":   str,
            "url":     str,
            "content": str,  # snippet or scraped body
        }

    Returns an empty list on any error so the caller can degrade gracefully.
    """
    query = str(query or "").strip()
    if not query:
        return []

    params: dict = {
        "q":        query,
        "format":   "json",
        "language": language,
    }
    engine_str = SUPPORTED_ENGINES.get(engine, "")
    if engine_str:
        params["engines"] = engine_str

    try:
        async with httpx.AsyncClient(timeout=Config.SEARXNG_TIMEOUT_SECONDS) as client:
            resp = await client.get(
                f"{Config.SEARXNG_BASE_URL}/search",
                params=params,
            )
            resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.warning("SearXNG request failed: %s", str(exc)[:200])
        return []

    raw_results: list[dict] = data.get("results", [])
    items: list[dict] = []

    for r in raw_results[: Config.SEARXNG_MAX_RESULTS]:
        url = str(r.get("url", "")).strip()
        title = str(r.get("title", "")).strip()
        # SearXNG puts the snippet in the "content" field
        snippet = str(r.get("content", "")).strip()

        if Config.SEARXNG_FETCH_CONTENT and url:
            body = await _fetch_page_content(url)
            content = body or snippet
        else:
            content = snippet

        items.append({"title": title, "url": url, "content": content})

    return items


async def _fetch_page_content(url: str) -> str:
    """Fetch a URL and extract clean prose text via trafilatura.

    Falls back to empty string on any error — scraping is best-effort.
    """
    try:
        import trafilatura  # optional dependency

        resp = await asyncio.to_thread(
            safe_get,
            url,
            timeout=8,
            headers={"User-Agent": "Mozilla/5.0 (compatible; EduBot/1.0)"},
            allowed_content_types=("text/html", "text/plain", "application/xhtml+xml"),
            max_response_bytes=2 * 1024 * 1024,
        )
        text: str = trafilatura.extract(resp.text) or ""
        return text[: Config.SEARXNG_CONTENT_MAX_CHARS]
    except Exception as exc:
        logger.debug("Page content fetch failed for %s: %s", url, str(exc)[:120])
        return ""
