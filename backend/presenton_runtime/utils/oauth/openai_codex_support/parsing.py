from __future__ import annotations

from urllib.parse import parse_qs, urlparse


def parse_authorization_input(raw: str) -> dict:
    value = raw.strip()
    if not value:
        return {}

    try:
        parsed = urlparse(value)
        if parsed.scheme in ("http", "https"):
            query = parse_qs(parsed.query)
            return {key: query[key][0] for key in ("code", "state") if key in query}
    except Exception:
        pass

    if "#" in value:
        parts = value.split("#", 1)
        return {"code": parts[0], "state": parts[1]}

    if "code=" in value:
        query = parse_qs(value)
        return {key: query[key][0] for key in ("code", "state") if key in query}

    return {"code": value}


__all__ = ["parse_authorization_input"]
