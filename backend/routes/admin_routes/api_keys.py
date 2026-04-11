"""API key management + admin password verification."""
from __future__ import annotations

import os
import re as _re

from fastapi import Depends, HTTPException

from backend.config import Config
from backend.core.security import get_admin_user
from .router import admin_router

# Allowed env var names for API key updates (whitelist)
_EDITABLE_KEY_ALIASES = {"COZE_TOKEN", "DEEPSEEK_API_KEY", "ZHIPU_API_KEY", "SERP_API_KEY"}


@admin_router.post("/verify-password")
async def verify_admin_password(
    req: dict,
    admin: dict = Depends(get_admin_user),
):
    """Verify admin password before showing sensitive data (API keys)."""
    from werkzeug.security import check_password_hash
    password = req.get("password", "")
    if not password:
        raise HTTPException(status_code=400, detail="Password required")
    if not check_password_hash(admin.get("password_hash", ""), password):
        raise HTTPException(status_code=403, detail="Invalid password")
    return {"verified": True}


@admin_router.get("/api-keys")
async def get_api_keys(admin: dict = Depends(get_admin_user)):
    """Return configured API key metadata (masked). Never returns raw keys."""
    keys = [
        {"alias": "COZE_TOKEN",      "provider": "coze",     "value": _mask_key(Config.COZE_TOKEN)},
        {"alias": "DEEPSEEK_API_KEY", "provider": "deepseek", "value": _mask_key(Config.DEEPSEEK_API_KEY)},
        {"alias": "ZHIPU_API_KEY",   "provider": "zhipu",    "value": _mask_key(Config.ZHIPU_API_KEY)},
        {"alias": "SERP_API_KEY",    "provider": "serp",     "value": _mask_key(Config.SERP_API_KEY)},
    ]
    return {"keys": keys}


@admin_router.put("/api-keys")
async def update_api_key(
    req: dict,
    admin: dict = Depends(get_admin_user),
):
    """Update an API key value after password verification."""
    from werkzeug.security import check_password_hash

    password = (req.get("password") or "").strip()
    alias = (req.get("alias") or "").strip()
    new_value = (req.get("value") or "").strip()

    if not password:
        raise HTTPException(status_code=400, detail="Password required")
    if not check_password_hash(admin.get("password_hash", ""), password):
        raise HTTPException(status_code=403, detail="Invalid password")
    if alias not in _EDITABLE_KEY_ALIASES:
        raise HTTPException(status_code=400, detail="Invalid key alias")
    if not new_value:
        raise HTTPException(status_code=400, detail="Key value cannot be empty")

    # ── Update .env file ──
    env_path = os.path.join(Config.BASE_DIR, ".env")
    _update_env_file(env_path, alias, new_value)

    # ── Update runtime Config + os.environ ──
    os.environ[alias] = new_value
    setattr(Config, alias, new_value)

    return {"message": f"{alias} updated successfully", "value": _mask_key(new_value)}


def _update_env_file(env_path: str, key: str, value: str) -> None:
    """Safely update a single key in a .env file (or append if missing)."""
    if not os.path.isfile(env_path):
        with open(env_path, "w", encoding="utf-8") as f:
            f.write(f"{key}={value}\n")
        return

    with open(env_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    pattern = _re.compile(rf"^\s*{_re.escape(key)}\s*=")
    found = False
    new_lines = []
    for line in lines:
        if pattern.match(line):
            new_lines.append(f"{key}={value}\n")
            found = True
        else:
            new_lines.append(line)

    if not found:
        new_lines.append(f"{key}={value}\n")

    with open(env_path, "w", encoding="utf-8") as f:
        f.writelines(new_lines)


def _mask_key(value: str | None) -> str:
    """Mask an API key showing only first 4 and last 4 chars."""
    if not value:
        return "(not set)"
    if len(value) <= 10:
        return value[:2] + "***" + value[-2:]
    return value[:4] + "***" + value[-4:]
