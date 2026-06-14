from __future__ import annotations

from fastapi import Depends

from backend.core.security import get_current_user
from backend.schemas import DeepSeekConfigSchema, OpenAIConfigSchema
from backend.services.user_profile_service import (
    load_ai_config,
    save_deepseek_config,
    save_openai_config,
)

from .router import auth_router


@auth_router.get("/profile/ai-config")
async def get_ai_config(current_user: dict = Depends(get_current_user)):
    return await load_ai_config(current_user)


@auth_router.post("/profile/ai-config/deepseek")
async def update_deepseek_config(
    payload: DeepSeekConfigSchema,
    current_user: dict = Depends(get_current_user),
):
    return await save_deepseek_config(current_user, payload)


@auth_router.post("/profile/ai-config/openai")
async def update_openai_config(
    payload: OpenAIConfigSchema,
    current_user: dict = Depends(get_current_user),
):
    return await save_openai_config(current_user, payload)
