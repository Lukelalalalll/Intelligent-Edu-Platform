from __future__ import annotations

import logging
import re
from functools import lru_cache
from typing import Any
from urllib.parse import urlparse

from backend.core.config import Config, Settings

logger = logging.getLogger(__name__)

try:
    from opensearchpy import OpenSearch
except Exception as exc:  # pragma: no cover - exercised indirectly via health
    OpenSearch = None  # type: ignore[assignment]
    _OPENSEARCH_IMPORT_ERROR: Exception | None = exc
else:
    _OPENSEARCH_IMPORT_ERROR = None

_INDEX_COMPONENT_RE = re.compile(r"[^a-z0-9_-]+")


def opensearch_enabled(settings: Settings | None = None) -> bool:
    cfg = settings or Config
    return bool(cfg.RAG_OPENSEARCH_ENABLED and str(cfg.RAG_OPENSEARCH_ENDPOINT or "").strip())


def parse_opensearch_hosts(endpoint_value: str) -> list[dict[str, Any]]:
    hosts: list[dict[str, Any]] = []
    for raw_item in str(endpoint_value or "").split(","):
        endpoint = raw_item.strip().rstrip("/")
        if not endpoint:
            continue

        candidate = endpoint if "://" in endpoint else f"http://{endpoint}"
        parsed = urlparse(candidate)
        if not parsed.hostname:
            raise ValueError(f"Invalid OpenSearch endpoint: {endpoint}")

        scheme = parsed.scheme or "http"
        if scheme not in {"http", "https"}:
            raise ValueError(f"Unsupported OpenSearch scheme: {scheme}")

        hosts.append(
            {
                "host": parsed.hostname,
                "port": parsed.port or (443 if scheme == "https" else 9200),
                "scheme": scheme,
            }
        )

    if not hosts:
        raise ValueError("No valid OpenSearch hosts configured")
    return hosts


def normalize_index_component(value: str, *, fallback: str = "default") -> str:
    raw = str(value or "").strip().lower()
    normalized = _INDEX_COMPONENT_RE.sub("-", raw).strip("-_")
    while "--" in normalized:
        normalized = normalized.replace("--", "-")
    return normalized or fallback


def build_course_index_name(
    course_id: str,
    *,
    suffix: str = "chunks",
    settings: Settings | None = None,
) -> str:
    cfg = settings or Config
    prefix = normalize_index_component(cfg.RAG_OPENSEARCH_INDEX_PREFIX, fallback="course-rag")
    course = normalize_index_component(course_id, fallback="course")
    index_suffix = normalize_index_component(suffix, fallback="chunks")
    return f"{prefix}-{course}-{index_suffix}"[:255]


@lru_cache(maxsize=1)
def get_opensearch_client() -> Any | None:
    return create_opensearch_client()


def create_opensearch_client(settings: Settings | None = None) -> Any | None:
    cfg = settings or Config

    if not opensearch_enabled(cfg):
        return None

    if OpenSearch is None:
        raise RuntimeError(
            "OpenSearch support requires the 'opensearch-py' package. "
            "Run 'pip install -r backend/requirements.txt'."
        ) from _OPENSEARCH_IMPORT_ERROR

    hosts = parse_opensearch_hosts(cfg.RAG_OPENSEARCH_ENDPOINT)
    client_kwargs: dict[str, Any] = {
        "hosts": hosts,
        "timeout": cfg.RAG_OPENSEARCH_TIMEOUT_SECONDS,
        "verify_certs": cfg.RAG_OPENSEARCH_VERIFY_CERTS,
    }

    if cfg.RAG_OPENSEARCH_USERNAME:
        client_kwargs["http_auth"] = (
            cfg.RAG_OPENSEARCH_USERNAME,
            cfg.RAG_OPENSEARCH_PASSWORD,
        )

    if cfg.RAG_OPENSEARCH_CA_CERTS:
        client_kwargs["ca_certs"] = cfg.RAG_OPENSEARCH_CA_CERTS

    return OpenSearch(**client_kwargs)


def reset_opensearch_client() -> None:
    get_opensearch_client.cache_clear()


def check_opensearch_health(
    *,
    settings: Settings | None = None,
    client: Any | None = None,
) -> dict[str, Any]:
    cfg = settings or Config

    if not opensearch_enabled(cfg):
        return {
            "status": "disabled",
            "enabled": False,
            "endpoint": str(cfg.RAG_OPENSEARCH_ENDPOINT or "").strip(),
            "index_prefix": cfg.RAG_OPENSEARCH_INDEX_PREFIX,
        }

    try:
        if client is not None:
            resolved_client = client
        elif settings is None or settings is Config:
            resolved_client = get_opensearch_client()
        else:
            resolved_client = create_opensearch_client(cfg)

        if resolved_client is None:
            return {
                "status": "disabled",
                "enabled": False,
                "endpoint": cfg.RAG_OPENSEARCH_ENDPOINT,
                "index_prefix": cfg.RAG_OPENSEARCH_INDEX_PREFIX,
            }

        reachable = bool(resolved_client.ping())
        if not reachable:
            return {
                "status": "degraded",
                "enabled": True,
                "endpoint": cfg.RAG_OPENSEARCH_ENDPOINT,
                "index_prefix": cfg.RAG_OPENSEARCH_INDEX_PREFIX,
                "error": "OpenSearch ping returned false",
            }

        info = resolved_client.info()
        version = info.get("version", {}) if isinstance(info, dict) else {}
        return {
            "status": "ok",
            "enabled": True,
            "endpoint": cfg.RAG_OPENSEARCH_ENDPOINT,
            "index_prefix": cfg.RAG_OPENSEARCH_INDEX_PREFIX,
            "cluster_name": info.get("cluster_name"),
            "version": version.get("number"),
            "distribution": version.get("distribution"),
        }
    except Exception as exc:
        logger.warning("OpenSearch health check failed: %s", str(exc)[:200])
        return {
            "status": "error",
            "enabled": True,
            "endpoint": cfg.RAG_OPENSEARCH_ENDPOINT,
            "index_prefix": cfg.RAG_OPENSEARCH_INDEX_PREFIX,
            "error": str(exc)[:200],
        }
