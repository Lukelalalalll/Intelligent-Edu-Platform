from __future__ import annotations

import hashlib
import hmac
from typing import Any

from fastapi import Request


def hash_value(value: str) -> str:
    return hashlib.sha256(str(value or "").encode("utf-8")).hexdigest()


def user_agent_hash(request: Request) -> str:
    return hash_value(request.headers.get("user-agent", "")[:512])


def ip_hash(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    candidate = forwarded.split(",")[0].strip() if forwarded else ""
    if not candidate:
        candidate = getattr(request.client, "host", "") or ""
    return hash_value(candidate)


def masked_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    candidate = forwarded.split(",")[0].strip() if forwarded else ""
    if not candidate:
        candidate = getattr(request.client, "host", "") or ""
    if "." in candidate:
        parts = candidate.split(".")
        if len(parts) == 4:
            return ".".join(parts[:3] + ["*"])
    if ":" in candidate:
        parts = candidate.split(":")
        return ":".join(parts[:4] + ["*"])
    return candidate[:16]


def detect_browser(user_agent: str) -> str:
    ua = user_agent.lower()
    if "edg/" in ua:
        return "Edge"
    if "chrome/" in ua and "edg/" not in ua:
        return "Chrome"
    if "firefox/" in ua:
        return "Firefox"
    if "safari/" in ua and "chrome/" not in ua:
        return "Safari"
    return "Unknown browser"


def detect_os(user_agent: str) -> str:
    ua = user_agent.lower()
    if "windows" in ua:
        return "Windows"
    if "iphone" in ua or "ipad" in ua or "ios" in ua:
        return "iOS"
    if "android" in ua:
        return "Android"
    if "mac os x" in ua or "macintosh" in ua:
        return "macOS"
    if "linux" in ua:
        return "Linux"
    return "Unknown OS"


def detect_device_type(user_agent: str) -> str:
    ua = user_agent.lower()
    if "ipad" in ua or "tablet" in ua:
        return "tablet"
    if "iphone" in ua or "android" in ua or "mobile" in ua:
        return "mobile"
    return "desktop"


def device_snapshot(request: Request) -> dict[str, str]:
    user_agent = request.headers.get("user-agent", "")[:512]
    browser = detect_browser(user_agent)
    os_name = detect_os(user_agent)
    device_type = detect_device_type(user_agent)
    return {
        "user_agent": user_agent,
        "browser": browser,
        "os": os_name,
        "device_type": device_type,
        "device_label": f"{browser} on {os_name}",
        "ip_label": masked_ip(request),
    }


def same_fingerprint(left: dict[str, Any], *, request: Request) -> bool:
    return hmac.compare_digest(str(left.get("ua_hash") or ""), user_agent_hash(request)) and hmac.compare_digest(
        str(left.get("ip_hash") or ""), ip_hash(request)
    )
