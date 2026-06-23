from __future__ import annotations

from cachetools import TTLCache

_provider_health_cache: TTLCache[str, dict] = TTLCache(maxsize=128, ttl=45)
_role_info_cache: TTLCache[str, dict] = TTLCache(maxsize=1024, ttl=180)


def _user_key(user: dict) -> str:
    return str(user.get("_id") or user.get("id") or "").strip()


def get_provider_health_cache(user: dict, provider: str) -> dict | None:
    return _provider_health_cache.get(f"{_user_key(user)}:{provider}")


def set_provider_health_cache(user: dict, provider: str, value: dict) -> None:
    _provider_health_cache[f"{_user_key(user)}:{provider}"] = value


def invalidate_provider_health_cache(user: dict | None = None, provider: str | None = None) -> None:
    if user is None and provider is None:
        _provider_health_cache.clear()
        return
    prefix = _user_key(user or {})
    for key in list(_provider_health_cache.keys()):
        if prefix and not key.startswith(f"{prefix}:"):
            continue
        if provider and not key.endswith(f":{provider}"):
            continue
        _provider_health_cache.pop(key, None)


def get_role_info_cache(user: dict) -> dict | None:
    return _role_info_cache.get(_user_key(user))


def set_role_info_cache(user: dict, value: dict) -> None:
    _role_info_cache[_user_key(user)] = value


def invalidate_role_info_cache(user: dict | None = None) -> None:
    if user is None:
        _role_info_cache.clear()
        return
    _role_info_cache.pop(_user_key(user), None)
