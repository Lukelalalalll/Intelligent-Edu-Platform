"""
Safe HTTP request wrappers that block SSRF attacks.

Resolves hostname DNS before making requests, rejecting private/loopback/link-local IPs.
"""

import ipaddress
import socket
from urllib.parse import urlparse

import requests as _requests
from fastapi import HTTPException


_BLOCKED_NETWORKS = [
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("100.64.0.0/10"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.0.0.0/24"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]

MAX_RESPONSE_BYTES = 50 * 1024 * 1024  # 50 MB


def _validate_url(url: str) -> str:
    """Parse and validate a URL, raising HTTPException on blocked targets."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Only http/https URLs are allowed")

    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(status_code=400, detail="Invalid URL: missing hostname")

    try:
        infos = socket.getaddrinfo(hostname, parsed.port or (443 if parsed.scheme == "https" else 80))
    except socket.gaierror:
        raise HTTPException(status_code=400, detail=f"Cannot resolve hostname: {hostname}")

    for _family, _type, _proto, _canonname, sockaddr in infos:
        ip = ipaddress.ip_address(sockaddr[0])
        for net in _BLOCKED_NETWORKS:
            if ip in net:
                raise HTTPException(
                    status_code=400,
                    detail="URL targets a private/reserved network address",
                )
    return url


_MAX_REDIRECTS = 5


def _follow_redirects_safely(
    method_fn, url: str, *, timeout: int = 15, max_redirects: int = _MAX_REDIRECTS, **kwargs
) -> _requests.Response:
    """Follow redirects manually, validating each hop against the blocklist.

    ``method_fn`` must be ``requests.get``, ``requests.post``, etc.
    """
    kwargs.setdefault("timeout", timeout)
    kwargs["allow_redirects"] = False

    current_url = url
    for _ in range(max_redirects + 1):
        _validate_url(current_url)
        resp = method_fn(current_url, **kwargs)
        if resp.is_redirect or resp.is_permanent_redirect:
            location = resp.headers.get("Location")
            if not location:
                break
            from urllib.parse import urljoin

            current_url = urljoin(current_url, location)
            continue
        if len(resp.content) > MAX_RESPONSE_BYTES:
            raise HTTPException(status_code=400, detail="Response too large")
        return resp

    raise HTTPException(status_code=400, detail="Too many redirects")


def safe_get(
    url: str, *, timeout: int = 15, max_redirects: int = _MAX_REDIRECTS, **kwargs
) -> _requests.Response:
    """requests.get() with SSRF protection.

    Redirects are followed manually so every hop is validated against
    the private-IP blocklist, preventing redirect-based SSRF bypass.
    """
    return _follow_redirects_safely(_requests.get, url, timeout=timeout, max_redirects=max_redirects, **kwargs)


def safe_post(
    url: str, *, timeout: int = 15, max_redirects: int = _MAX_REDIRECTS, **kwargs
) -> _requests.Response:
    """requests.post() with SSRF protection.

    Redirects are followed manually so every hop is validated against
    the private-IP blocklist, preventing redirect-based SSRF bypass.
    """
    return _follow_redirects_safely(_requests.post, url, timeout=timeout, max_redirects=max_redirects, **kwargs)
