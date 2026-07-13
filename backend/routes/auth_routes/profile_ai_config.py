from __future__ import annotations

from fastapi import Depends

from backend.core.security import get_current_user
from backend.schemas import (
    BigModelConfigSchema,
    DeepSeekConfigSchema,
    MultimodalOpenAIConfigSchema,
    OpenAIConfigSchema,
)
from backend.services.ai.ai_interact_runtime_cache import invalidate_provider_health_cache
from backend.services.auth.user_profile_service import (
    load_ai_config,
    save_bigmodel_config,
    save_deepseek_config,
    save_multimodal_openai_config,
    save_openai_config,
)

from fastapi import APIRouter
router = APIRouter()


@router.get("/profile/ai-config")
async def get_ai_config(current_user: dict = Depends(get_current_user)):
    return await load_ai_config(current_user, include_api_keys=True)


@router.post("/profile/ai-config/deepseek")
async def update_deepseek_config(
    payload: DeepSeekConfigSchema,
    current_user: dict = Depends(get_current_user),
):
    result = await save_deepseek_config(current_user, payload)
    invalidate_provider_health_cache(current_user, "deepseek")
    return result


@router.post("/profile/ai-config/openai")
async def update_openai_config(
    payload: OpenAIConfigSchema,
    current_user: dict = Depends(get_current_user),
):
    result = await save_openai_config(current_user, payload)
    invalidate_provider_health_cache(current_user, "openai")
    return result


@router.post("/profile/ai-config/bigmodel")
async def update_bigmodel_config(
    payload: BigModelConfigSchema,
    current_user: dict = Depends(get_current_user),
):
    result = await save_bigmodel_config(current_user, payload)
    invalidate_provider_health_cache(current_user, "bigmodel")
    return result


@router.post("/profile/ai-config/multimodal/openai")
async def update_multimodal_openai_config(
    payload: MultimodalOpenAIConfigSchema,
    current_user: dict = Depends(get_current_user),
):
    result = await save_multimodal_openai_config(current_user, payload)
    invalidate_provider_health_cache(current_user, "openai")
    return result

