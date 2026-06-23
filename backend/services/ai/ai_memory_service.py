from __future__ import annotations

from cachetools import TTLCache

from backend.repositories import user_repo

_ai_memory_cache: TTLCache[str, str] = TTLCache(maxsize=1024, ttl=300)
_ai_memory_object_cache: TTLCache[str, dict] = TTLCache(maxsize=1024, ttl=180)
_MEMORY_FIELDS = ("name", "major", "year", "preferences")


def _cache_key(user_id: str) -> str:
    return str(user_id or "").strip()


async def get_ai_memory(user_id: str) -> dict:
    cache_id = _cache_key(user_id)
    cached = _ai_memory_object_cache.get(cache_id)
    if cached is not None:
        return dict(cached)
    memory = await user_repo.get_ai_memory(user_id)
    normalized = dict(memory or {})
    _ai_memory_object_cache[cache_id] = normalized
    return dict(normalized)


async def update_ai_memory(user_id: str, body: dict) -> dict[str, str]:
    allowed_keys = {"name", "major", "year", "preferences"}
    sanitized: dict[str, str] = {}
    for key in allowed_keys:
        sanitized[key] = str(body.get(key, "") or "").strip()[:200]

    await user_repo.set_ai_memory(user_id, sanitized)
    _ai_memory_cache.pop(_cache_key(user_id), None)
    _ai_memory_object_cache.pop(_cache_key(user_id), None)
    return sanitized


async def load_ai_memory_text(user: dict) -> str:
    cache_id = _cache_key(str(user.get("_id") or user.get("id") or ""))
    cached = _ai_memory_cache.get(cache_id)
    if cached is not None:
        return cached

    ai_memory = await get_ai_memory(str(user.get("_id") or user.get("id") or ""))
    if not ai_memory:
        _ai_memory_cache[cache_id] = ""
        return ""

    parts = [
        f"{field.capitalize()}: {ai_memory[field]}"
        for field in _MEMORY_FIELDS
        if ai_memory.get(field)
    ]
    if not parts:
        _ai_memory_cache[cache_id] = ""
        return ""

    result = "; ".join(parts) + ". Adapt your responses to this student's background."
    _ai_memory_cache[cache_id] = result
    return result
