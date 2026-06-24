from __future__ import annotations

import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from models.image_prompt import ImagePrompt
from models.sql.image_asset import ImageAsset
from models.sql.presentation import PresentationModel
from services.chat.memory_layer_support.chat_memory_queries import load_presentation
from services.icon_finder_service import ICON_FINDER_SERVICE
from services.image_generation_service import ImageGenerationService
from utils.asset_directory_utils import (
    filesystem_image_path_to_app_data_url,
    get_images_directory,
    normalize_slide_asset_url,
)
from utils.icon_weights import DEFAULT_ICON_WEIGHT

LOGGER = logging.getLogger(__name__)


async def get_presentation_icon_weight(
    sql_session: AsyncSession,
    presentation_id: uuid.UUID,
    presentation: PresentationModel | None = None,
) -> str:
    if presentation is None:
        presentation = await load_presentation(sql_session, presentation_id)
    if not presentation or not isinstance(presentation.layout, dict):
        return DEFAULT_ICON_WEIGHT
    try:
        return presentation.get_layout().icon_weight
    except Exception:
        LOGGER.exception(
            "Failed to parse presentation icon weight (presentation_id=%s)",
            presentation_id,
        )
        return DEFAULT_ICON_WEIGHT


async def generate_image(sql_session: AsyncSession, prompt: str) -> str:
    image_generation_service = ImageGenerationService(get_images_directory())
    image = await image_generation_service.generate_image(ImagePrompt(prompt=prompt))

    if isinstance(image, ImageAsset):
        sql_session.add(image)
        await sql_session.commit()
        return filesystem_image_path_to_app_data_url(image.path)

    return normalize_slide_asset_url(str(image))


async def generate_icon(
    sql_session: AsyncSession,
    presentation_id: uuid.UUID,
    query: str,
) -> str:
    icons = await ICON_FINDER_SERVICE.search_icons(
        query,
        k=1,
        weight=await get_presentation_icon_weight(sql_session, presentation_id),
    )
    if icons:
        return normalize_slide_asset_url(icons[0])
    return normalize_slide_asset_url("/static/icons/placeholder.svg")
