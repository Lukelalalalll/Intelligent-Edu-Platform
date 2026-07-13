from __future__ import annotations

import os

from fastapi import APIRouter, Body, Depends, HTTPException, Request

from backend.services.auth.user_profile_service import load_ai_config

from .auth_bridge import get_ppt_generator_current_user, resolve_ppt_generator_public_origin
from .bootstrap import ensure_ppt_generator_ready
from .config_bridge import load_ppt_generator_host_config

bootstrap_router = APIRouter()


@bootstrap_router.get("/api/v1/app/bootstrap")
async def ppt_generator_bootstrap(
    request: Request,
    current_user: dict = Depends(get_ppt_generator_current_user),
):
    await ensure_ppt_generator_ready()
    summary, _ = await load_ppt_generator_host_config(request, current_user)
    ai_config = await load_ai_config(current_user)
    has_required_key = bool(
        ai_config.get("openai", {}).get("api_key_set")
        or ai_config.get("deepseek", {}).get("api_key_set")
    )
    return {
        "canChangeKeys": False,
        "hasRequiredKey": has_required_key,
        "telemetryEnabled": str(os.environ.get("DISABLE_ANONYMOUS_TRACKING") or "").strip().lower() != "true",
        "auth": {
            "configured": True,
            "authenticated": True,
            "username": current_user.get("username") or current_user.get("email"),
        },
        "capabilities": {
            "mode": "web",
            "browserDownload": True,
            "mcpProxy": True,
            "arbitraryLocalRead": False,
        },
        "origins": {"publicWebOrigin": resolve_ppt_generator_public_origin(request)},
        "userConfig": summary,
    }


@bootstrap_router.get("/api/v1/app/user-config")
async def ppt_generator_user_config(
    request: Request,
    current_user: dict = Depends(get_ppt_generator_current_user),
):
    await ensure_ppt_generator_ready()
    summary, _ = await load_ppt_generator_host_config(request, current_user)
    return summary


@bootstrap_router.put("/api/v1/app/user-config")
async def ppt_generator_user_config_update(
    _body: dict = Body(...),
    _current_user: dict = Depends(get_ppt_generator_current_user),
):
    raise HTTPException(
        status_code=403,
        detail="PPT Generator AI settings are managed from your profile AI config.",
    )


presenton_bootstrap = ppt_generator_bootstrap
presenton_user_config = ppt_generator_user_config
presenton_user_config_update = ppt_generator_user_config_update
