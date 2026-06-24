from __future__ import annotations

from datetime import datetime, timezone

from backend.core.database import db
from backend.services.secret_storage import decrypt_secret, encrypt_secret

_DEFAULT_DEEPSEEK_CONFIG = {
    "base_url": "https://api.deepseek.com",
    "model": "deepseek-v4-pro",
    "stream": False,
    "reasoning_effort": "high",
    "thinking_type": "enabled",
}

_DEFAULT_OPENAI_CONFIG = {
    "base_url": "https://api.openai.com/v1",
    "model": "gpt-5.5",
    "stream": False,
}


def build_deepseek_response(
    raw_config: dict | None,
    *,
    include_api_key: bool = False,
) -> dict:
    raw = raw_config or {}
    encrypted_key = raw.get("api_key_encrypted") or raw.get("api_key") or ""
    migrated_base_url = (
        raw.get("base_url")
        or raw.get("base_url_openai")
        or _DEFAULT_DEEPSEEK_CONFIG["base_url"]
    )
    return {
        **_DEFAULT_DEEPSEEK_CONFIG,
        **{
            key: raw.get(key)
            for key in _DEFAULT_DEEPSEEK_CONFIG
            if raw.get(key) is not None
        },
        "base_url": migrated_base_url,
        "api_key": decrypt_secret(encrypted_key) if include_api_key else "",
        "api_key_set": bool(decrypt_secret(encrypted_key)),
        "updated_at": raw.get("updated_at"),
    }


def build_openai_response(
    raw_config: dict | None,
    *,
    include_api_key: bool = False,
) -> dict:
    raw = raw_config or {}
    encrypted_key = raw.get("api_key_encrypted") or raw.get("api_key") or ""
    return {
        **_DEFAULT_OPENAI_CONFIG,
        **{
            key: raw.get(key)
            for key in _DEFAULT_OPENAI_CONFIG
            if raw.get(key) is not None
        },
        "api_key": decrypt_secret(encrypted_key) if include_api_key else "",
        "api_key_set": bool(decrypt_secret(encrypted_key)),
        "updated_at": raw.get("updated_at"),
    }


async def load_ai_config(current_user: dict, *, include_api_keys: bool = False) -> dict:
    user_doc = await db.users.find_one({"_id": current_user["_id"]}, {"ai_config": 1})
    ai_config = (user_doc or {}).get("ai_config") or {}
    return {
        "deepseek": build_deepseek_response(
            ai_config.get("deepseek"),
            include_api_key=include_api_keys,
        ),
        "openai": build_openai_response(
            ai_config.get("openai"),
            include_api_key=include_api_keys,
        ),
    }


async def load_deepseek_runtime_config(current_user: dict) -> dict:
    user_doc = await db.users.find_one(
        {"_id": current_user["_id"]},
        {"ai_config.deepseek": 1},
    )
    ai_config = (user_doc or {}).get("ai_config") or {}
    return build_deepseek_response(ai_config.get("deepseek"), include_api_key=True)


async def load_openai_runtime_config(current_user: dict) -> dict:
    user_doc = await db.users.find_one(
        {"_id": current_user["_id"]},
        {"ai_config.openai": 1},
    )
    ai_config = (user_doc or {}).get("ai_config") or {}
    return build_openai_response(ai_config.get("openai"), include_api_key=True)


async def save_deepseek_config(current_user: dict, payload) -> dict:
    existing_user = await db.users.find_one({"_id": current_user["_id"]}, {"ai_config": 1})
    existing = ((existing_user or {}).get("ai_config") or {}).get("deepseek") or {}
    update_doc = {
        **_DEFAULT_DEEPSEEK_CONFIG,
        **existing,
        "base_url": payload.base_url,
        "model": payload.model,
        "stream": payload.stream,
        "reasoning_effort": payload.reasoning_effort,
        "thinking_type": payload.thinking_type,
        "updated_at": datetime.now(timezone.utc),
    }
    if payload.clear_api_key:
        update_doc["api_key_encrypted"] = ""
    elif payload.api_key is not None and payload.api_key.strip():
        update_doc["api_key_encrypted"] = encrypt_secret(payload.api_key.strip())

    update_doc.pop("api_key", None)
    update_doc.pop("base_url_openai", None)
    update_doc.pop("base_url_anthropic", None)

    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"ai_config.deepseek": update_doc}},
    )
    return {
        "message": "DeepSeek config updated",
        "deepseek": build_deepseek_response(update_doc, include_api_key=True),
    }


async def save_openai_config(current_user: dict, payload) -> dict:
    existing_user = await db.users.find_one({"_id": current_user["_id"]}, {"ai_config": 1})
    existing = ((existing_user or {}).get("ai_config") or {}).get("openai") or {}
    update_doc = {
        **_DEFAULT_OPENAI_CONFIG,
        **existing,
        "base_url": payload.base_url,
        "model": payload.model,
        "stream": payload.stream,
        "updated_at": datetime.now(timezone.utc),
    }
    if payload.clear_api_key:
        update_doc["api_key_encrypted"] = ""
    elif payload.api_key is not None and payload.api_key.strip():
        update_doc["api_key_encrypted"] = encrypt_secret(payload.api_key.strip())

    update_doc.pop("api_key", None)

    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"ai_config.openai": update_doc}},
    )
    return {
        "message": "OpenAI config updated",
        "openai": build_openai_response(update_doc, include_api_key=True),
    }
