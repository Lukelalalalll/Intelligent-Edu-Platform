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

_DEFAULT_MULTIMODAL_OPENAI_CONFIG = {
    "base_url": "https://api.openai.com/v1",
    "model": "gpt-4o",
    "stream": False,
}

_DEFAULT_BIGMODEL_CONFIG = {
    "base_url": "https://open.bigmodel.cn/api/paas/v4",
    "text_model": "glm-4.5-flash",
    "image_model": "glm-5v-flash",
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
    defaults: dict | None = None,
) -> dict:
    raw = raw_config or {}
    encrypted_key = raw.get("api_key_encrypted") or raw.get("api_key") or ""
    config_defaults = defaults or _DEFAULT_OPENAI_CONFIG
    return {
        **config_defaults,
        **{
            key: raw.get(key)
            for key in config_defaults
            if raw.get(key) is not None
        },
        "api_key": decrypt_secret(encrypted_key) if include_api_key else "",
        "api_key_set": bool(decrypt_secret(encrypted_key)),
        "updated_at": raw.get("updated_at"),
    }


def build_multimodal_openai_response(
    raw_config: dict | None,
    *,
    include_api_key: bool = False,
) -> dict:
    return build_openai_response(
        raw_config,
        include_api_key=include_api_key,
        defaults=_DEFAULT_MULTIMODAL_OPENAI_CONFIG,
    )


def build_bigmodel_response(
    raw_config: dict | None,
    *,
    include_api_key: bool = False,
) -> dict:
    raw = raw_config or {}
    encrypted_key = raw.get("api_key_encrypted") or raw.get("api_key") or ""
    return {
        **_DEFAULT_BIGMODEL_CONFIG,
        **{
            key: raw.get(key)
            for key in _DEFAULT_BIGMODEL_CONFIG
            if raw.get(key) is not None
        },
        "api_key": decrypt_secret(encrypted_key) if include_api_key else "",
        "api_key_set": bool(decrypt_secret(encrypted_key)),
        "updated_at": raw.get("updated_at"),
    }


def build_bigmodel_text_runtime_response(
    raw_config: dict | None,
    *,
    include_api_key: bool = False,
) -> dict:
    config = build_bigmodel_response(raw_config, include_api_key=include_api_key)
    return {
        "base_url": config["base_url"],
        "api_key": config["api_key"],
        "api_key_set": config["api_key_set"],
        "model": config["text_model"],
        "stream": config["stream"],
        "updated_at": config["updated_at"],
    }


def build_bigmodel_multimodal_runtime_response(
    raw_config: dict | None,
    *,
    include_api_key: bool = False,
) -> dict:
    config = build_bigmodel_response(raw_config, include_api_key=include_api_key)
    return {
        "base_url": config["base_url"],
        "api_key": config["api_key"],
        "api_key_set": config["api_key_set"],
        "model": config["image_model"],
        "stream": config["stream"],
        "updated_at": config["updated_at"],
    }


async def load_ai_config(current_user: dict, *, include_api_keys: bool = False) -> dict:
    user_doc = await db.users.find_one({"_id": current_user["_id"]}, {"ai_config": 1})
    ai_config = (user_doc or {}).get("ai_config") or {}
    text_config = ai_config.get("text") or {}
    multimodal_config = ai_config.get("multimodal") or {}
    deepseek_raw = text_config.get("deepseek") or ai_config.get("deepseek")
    openai_raw = text_config.get("openai") or ai_config.get("openai")
    bigmodel_raw = ai_config.get("bigmodel")
    multimodal_openai_raw = multimodal_config.get("openai")
    deepseek = build_deepseek_response(
        deepseek_raw,
        include_api_key=include_api_keys,
    )
    openai = build_openai_response(
        openai_raw,
        include_api_key=include_api_keys,
    )
    multimodal_openai = build_multimodal_openai_response(
        multimodal_openai_raw,
        include_api_key=include_api_keys,
    )
    bigmodel = build_bigmodel_response(
        bigmodel_raw,
        include_api_key=include_api_keys,
    )
    bigmodel_text = build_bigmodel_text_runtime_response(
        bigmodel_raw,
        include_api_key=include_api_keys,
    )
    bigmodel_multimodal = build_bigmodel_multimodal_runtime_response(
        bigmodel_raw,
        include_api_key=include_api_keys,
    )
    return {
        "deepseek": deepseek,
        "openai": openai,
        "bigmodel": bigmodel,
        "text": {
            "deepseek": deepseek,
            "openai": openai,
            "bigmodel": bigmodel_text,
        },
        "multimodal": {
            "openai": multimodal_openai,
            "bigmodel": bigmodel_multimodal,
        },
    }


async def load_deepseek_runtime_config(current_user: dict) -> dict:
    user_doc = await db.users.find_one(
        {"_id": current_user["_id"]},
        {"ai_config.deepseek": 1, "ai_config.text.deepseek": 1},
    )
    ai_config = (user_doc or {}).get("ai_config") or {}
    text_config = ai_config.get("text") or {}
    return build_deepseek_response(
        text_config.get("deepseek") or ai_config.get("deepseek"),
        include_api_key=True,
    )


async def load_openai_runtime_config(current_user: dict) -> dict:
    user_doc = await db.users.find_one(
        {"_id": current_user["_id"]},
        {"ai_config.openai": 1, "ai_config.text.openai": 1},
    )
    ai_config = (user_doc or {}).get("ai_config") or {}
    text_config = ai_config.get("text") or {}
    return build_openai_response(
        text_config.get("openai") or ai_config.get("openai"),
        include_api_key=True,
    )


async def load_multimodal_openai_runtime_config(current_user: dict) -> dict:
    user_doc = await db.users.find_one(
        {"_id": current_user["_id"]},
        {"ai_config.multimodal.openai": 1},
    )
    ai_config = (user_doc or {}).get("ai_config") or {}
    multimodal_config = ai_config.get("multimodal") or {}
    return build_multimodal_openai_response(
        multimodal_config.get("openai"),
        include_api_key=True,
    )


async def load_bigmodel_runtime_config(current_user: dict) -> dict:
    user_doc = await db.users.find_one(
        {"_id": current_user["_id"]},
        {"ai_config.bigmodel": 1},
    )
    ai_config = (user_doc or {}).get("ai_config") or {}
    return build_bigmodel_text_runtime_response(
        ai_config.get("bigmodel"),
        include_api_key=True,
    )


async def load_multimodal_bigmodel_runtime_config(current_user: dict) -> dict:
    user_doc = await db.users.find_one(
        {"_id": current_user["_id"]},
        {"ai_config.bigmodel": 1},
    )
    ai_config = (user_doc or {}).get("ai_config") or {}
    return build_bigmodel_multimodal_runtime_response(
        ai_config.get("bigmodel"),
        include_api_key=True,
    )


async def save_deepseek_config(current_user: dict, payload) -> dict:
    existing_user = await db.users.find_one({"_id": current_user["_id"]}, {"ai_config": 1})
    ai_config = (existing_user or {}).get("ai_config") or {}
    existing = ((ai_config.get("text") or {}).get("deepseek")) or ai_config.get("deepseek") or {}
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
        {"$set": {"ai_config.deepseek": update_doc, "ai_config.text.deepseek": update_doc}},
    )
    return {
        "message": "DeepSeek config updated",
        "deepseek": build_deepseek_response(update_doc, include_api_key=True),
    }


async def save_openai_config(current_user: dict, payload) -> dict:
    existing_user = await db.users.find_one({"_id": current_user["_id"]}, {"ai_config": 1})
    ai_config = (existing_user or {}).get("ai_config") or {}
    existing = ((ai_config.get("text") or {}).get("openai")) or ai_config.get("openai") or {}
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
        {"$set": {"ai_config.openai": update_doc, "ai_config.text.openai": update_doc}},
    )
    return {
        "message": "OpenAI config updated",
        "openai": build_openai_response(update_doc, include_api_key=True),
    }


async def save_multimodal_openai_config(current_user: dict, payload) -> dict:
    existing_user = await db.users.find_one({"_id": current_user["_id"]}, {"ai_config": 1})
    ai_config = (existing_user or {}).get("ai_config") or {}
    existing = ((ai_config.get("multimodal") or {}).get("openai")) or {}
    update_doc = {
        **_DEFAULT_MULTIMODAL_OPENAI_CONFIG,
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
        {"$set": {"ai_config.multimodal.openai": update_doc}},
    )
    return {
        "message": "Multimodal OpenAI config updated",
        "openai": build_multimodal_openai_response(update_doc, include_api_key=True),
    }


async def save_bigmodel_config(current_user: dict, payload) -> dict:
    existing_user = await db.users.find_one({"_id": current_user["_id"]}, {"ai_config": 1})
    ai_config = (existing_user or {}).get("ai_config") or {}
    existing = ai_config.get("bigmodel") or {}
    update_doc = {
        **_DEFAULT_BIGMODEL_CONFIG,
        **existing,
        "base_url": payload.base_url,
        "text_model": payload.text_model,
        "image_model": payload.image_model,
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
        {"$set": {"ai_config.bigmodel": update_doc}},
    )
    return {
        "message": "BigModel config updated",
        "bigmodel": build_bigmodel_response(update_doc, include_api_key=True),
    }
