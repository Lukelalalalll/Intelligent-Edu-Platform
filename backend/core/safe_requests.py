"""Safe HTTP request wrappers that block SSRF attacks."""

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
    ipaddress.ip_network("192.0.2.0/24"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("198.18.0.0/15"),
    ipaddress.ip_network("198.51.100.0/24"),
    ipaddress.ip_network("203.0.113.0/24"),
    ipaddress.ip_network("224.0.0.0/4"),
    ipaddress.ip_network("240.0.0.0/4"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("::/128"),
    ipaddress.ip_network("64:ff9b:1::/48"),
    ipaddress.ip_network("100::/64"),
    ipaddress.ip_network("2001:db8::/32"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
    ipaddress.ip_network("ff00::/8"),
]

MAX_RESPONSE_BYTES = 50 * 1024 * 1024  # 50 MB
_CHUNK_SIZE = 64 * 1024


def _is_blocked_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
        or any(ip in net for net in _BLOCKED_NETWORKS)
    )


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
        if _is_blocked_ip(ip):
            raise HTTPException(
                status_code=400,
                detail="URL targets a private/reserved network address",
            )
    return url


_MAX_REDIRECTS = 5


def _content_type_allowed(content_type: str, allowed_content_types: tuple[str, ...] | None) -> bool:
    if not allowed_content_types:
        return True
    normalized = (content_type or "").split(";", 1)[0].strip().lower()
    if not normalized:
        return False
    return any(
        normalized.startswith(allowed.rstrip("*").lower())
        if allowed.endswith("*")
        else normalized == allowed.lower() or normalized.startswith(allowed.lower())
        for allowed in allowed_content_types
    )


def _read_bounded_content(resp: _requests.Response, *, max_response_bytes: int) -> None:
    """Materialize streamed content while enforcing a hard size limit."""
    if not isinstance(resp, _requests.Response):
        raw_content = getattr(resp, "content", None)
        if isinstance(raw_content, (bytes, bytearray)):
            if len(raw_content) > max_response_bytes:
                raise HTTPException(status_code=400, detail="Response too large")
            return

    chunks: list[bytes] = []
    total = 0
    try:
        iterator = resp.iter_content(chunk_size=_CHUNK_SIZE)
    except Exception:
        return

    for chunk in iterator:
        if not chunk:
            continue
        total += len(chunk)
        if total > max_response_bytes:
            resp.close()
            raise HTTPException(status_code=400, detail="Response too large")
        chunks.append(chunk)

    resp._content = b"".join(chunks)
    resp._content_consumed = True


def _follow_redirects_safely(
    method_fn,
    url: str,
    *,
    timeout: int = 15,
    max_redirects: int = _MAX_REDIRECTS,
    max_response_bytes: int = MAX_RESPONSE_BYTES,
    allowed_content_types: tuple[str, ...] | None = None,
    **kwargs,
) -> _requests.Response:
    """Follow redirects manually, validating each hop against the blocklist.

    ``method_fn`` must be ``requests.get``, ``requests.post``, etc.
    """
    kwargs.setdefault("timeout", timeout)
    kwargs["allow_redirects"] = False
    kwargs["stream"] = True

    current_url = url
    for _ in range(max_redirects + 1):
        _validate_url(current_url)
        resp = method_fn(current_url, **kwargs)
        response_url = getattr(resp, "url", "") or current_url
        _validate_url(response_url if isinstance(response_url, str) else current_url)
        if resp.is_redirect or resp.is_permanent_redirect:
            location = resp.headers.get("Location")
            if not location:
                break
            from urllib.parse import urljoin

            current_url = urljoin(current_url, location)
            resp.close()
            continue

        if not _content_type_allowed(resp.headers.get("Content-Type", ""), allowed_content_types):
            resp.close()
            raise HTTPException(status_code=400, detail="Unexpected content type")

        _read_bounded_content(resp, max_response_bytes=max_response_bytes)
        return resp

    raise HTTPException(status_code=400, detail="Too many redirects")


def safe_get(
    url: str,
    *,
    timeout: int = 15,
    max_redirects: int = _MAX_REDIRECTS,
    max_response_bytes: int = MAX_RESPONSE_BYTES,
    allowed_content_types: tuple[str, ...] | None = None,
    **kwargs,
) -> _requests.Response:
    """requests.get() with SSRF protection.

    Redirects are followed manually so every hop is validated against
    the private-IP blocklist, preventing redirect-based SSRF bypass.
    """
    return _follow_redirects_safely(
        _requests.get,
        url,
        timeout=timeout,
        max_redirects=max_redirects,
        max_response_bytes=max_response_bytes,
        allowed_content_types=allowed_content_types,
        **kwargs,
    )


def safe_post(
    url: str,
    *,
    timeout: int = 15,
    max_redirects: int = _MAX_REDIRECTS,
    max_response_bytes: int = MAX_RESPONSE_BYTES,
    allowed_content_types: tuple[str, ...] | None = None,
    **kwargs,
) -> _requests.Response:
    """requests.post() with SSRF protection.

    Redirects are followed manually so every hop is validated against
    the private-IP blocklist, preventing redirect-based SSRF bypass.
    """
    return _follow_redirects_safely(
        _requests.post,
        url,
        timeout=timeout,
        max_redirects=max_redirects,
        max_response_bytes=max_response_bytes,
        allowed_content_types=allowed_content_types,
        **kwargs,
    )
