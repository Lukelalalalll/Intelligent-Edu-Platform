from __future__ import annotations

from urllib.parse import urlsplit, urlunsplit

_OPENAI_ENDPOINT_SUFFIXES = (
    "/audio/transcriptions",
    "/images/generations",
    "/chat/completions",
    "/completions",
    "/embeddings",
    "/moderations",
    "/responses",
    "/models",
    "/images",
)


def normalize_openai_base_url(url: str) -> str:
    """Normalize OpenAI-compatible URLs to the /v1 API root."""
    cleaned = str(url or "").strip()
    if not cleaned:
        return ""

    parts = urlsplit(cleaned)
    if parts.scheme not in {"http", "https"} or not parts.netloc:
        return cleaned.rstrip("/")

    path = parts.path.rstrip("/")
    for suffix in _OPENAI_ENDPOINT_SUFFIXES:
        if path.endswith(suffix):
            path = path[: -len(suffix)].rstrip("/")
            break

    if not path:
        normalized_path = "/v1"
    else:
        version_index = path.find("/v1")
        if version_index >= 0:
            normalized_path = path[: version_index + 3]
        else:
            normalized_path = f"{path}/v1"

    return urlunsplit((parts.scheme, parts.netloc, normalized_path, "", ""))
