from __future__ import annotations

from fastapi import Depends, Request

from backend.presenton_runtime_context import (
    reset_presenton_owner_user_id,
    resolve_presenton_owner_user_id,
    set_presenton_owner_user_id,
)

from .auth_bridge import get_presenton_current_user
from .bootstrap import ensure_presenton_ready, load_presenton_runtime
from .config_bridge import load_presenton_host_config


async def presenton_request_context(
    request: Request,
    current_user: dict = Depends(get_presenton_current_user),
):
    await ensure_presenton_ready()
    _, overrides = await load_presenton_host_config(request, current_user)
    owner_user_id = resolve_presenton_owner_user_id(current_user)
    request.state.presenton_owner_user_id = owner_user_id
    request.state.auth_username = str(
        current_user.get("username")
        or current_user.get("email")
        or current_user.get("id")
        or ""
    ).strip()
    runtime = load_presenton_runtime()
    token = runtime.set_request_env_overrides(overrides)
    owner_token = set_presenton_owner_user_id(owner_user_id)
    try:
        yield current_user
    finally:
        reset_presenton_owner_user_id(owner_token)
        runtime.reset_request_env_overrides(token)
