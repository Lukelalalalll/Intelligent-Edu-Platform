from __future__ import annotations

import copy
import uuid
from typing import Any

from jsonschema import Draft202012Validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from backend.services.presenton.presenton_projection_service import (
    PRESENTON_MONGO_PROJECTION_SERVICE,
)
from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel
from services.chat.memory_layer_support.chat_memory_assets import (
    get_presentation_icon_weight,
)
from services.chat.memory_layer_support.chat_memory_queries import get_layout_by_id
from services.image_generation_service import ImageGenerationService
from services.mem0_presentation_memory_service import MEM0_PRESENTATION_MEMORY_SERVICE
from utils.asset_directory_utils import get_images_directory
from utils.process_slides import (
    process_old_and_new_slides_and_fetch_assets,
    process_slide_and_fetch_assets,
)

MAX_SCHEMA_ERRORS = 10
RUNTIME_CONTENT_FIELDS = {"__speaker_note__"}


async def save_slide(
    sql_session: AsyncSession,
    presentation_id: uuid.UUID,
    *,
    content: dict[str, Any],
    layout_id: str,
    index: int,
    replace_old_slide_at_index: bool,
) -> dict[str, Any]:
    presentation = await sql_session.get(PresentationModel, presentation_id)
    if not presentation:
        return {
            "saved": False,
            "message": "Presentation not found.",
            "validation_errors": [],
        }

    layout = await get_layout_by_id(
        sql_session,
        presentation_id,
        layout_id,
        presentation=presentation,
    )
    if not layout:
        return {
            "saved": False,
            "message": f"Layout '{layout_id}' was not found in this presentation.",
            "validation_errors": [f"Unknown layout_id '{layout_id}'."],
        }

    validation_errors = validate_slide_content(content=content, schema=layout.json_schema)
    if validation_errors:
        return {
            "saved": False,
            "message": "Slide content failed schema validation.",
            "validation_errors": validation_errors,
        }

    target_index = max(0, index)
    icon_weight = await get_presentation_icon_weight(
        sql_session,
        presentation_id,
        presentation=presentation,
    )
    image_generation_service = ImageGenerationService(get_images_directory())

    if replace_old_slide_at_index:
        existing_slide = await sql_session.scalar(
            select(SlideModel).where(
                SlideModel.presentation == presentation_id,
                SlideModel.index == target_index,
            )
        )
        if not existing_slide:
            return {
                "saved": False,
                "message": f"No existing slide found at index {target_index} to replace.",
                "validation_errors": [],
            }

        updated_content = copy.deepcopy(content)
        new_assets = await process_old_and_new_slides_and_fetch_assets(
            image_generation_service=image_generation_service,
            old_slide_content=existing_slide.content or {},
            new_slide_content=updated_content,
            icon_weight=icon_weight,
        )

        existing_slide.id = uuid.uuid4()
        existing_slide.layout = layout_id
        existing_slide.layout_group = resolve_layout_group(
            presentation=presentation,
            fallback=existing_slide.layout_group,
        )
        existing_slide.content = updated_content
        existing_slide.speaker_note = extract_speaker_note(updated_content)
        sql_session.add(existing_slide)
        sql_session.add_all(new_assets)
        await sql_session.commit()

        await MEM0_PRESENTATION_MEMORY_SERVICE.store_slide_edit(
            presentation_id=presentation_id,
            slide_index=target_index,
            edit_prompt=f"[chat_tool_save_slide_replace] layout_id={layout_id}",
            edited_slide_content=updated_content,
        )
        await PRESENTON_MONGO_PROJECTION_SERVICE.safe_sync_presentation_bundle(
            sql_session,
            presentation_id=presentation_id,
            reason="chat_save_slide_replace",
        )
        return {
            "saved": True,
            "action": "replaced",
            "message": f"Slide at index {target_index} was replaced successfully.",
            "slide_id": str(existing_slide.id),
            "index": target_index,
        }

    slides_result = await sql_session.scalars(
        select(SlideModel)
        .where(SlideModel.presentation == presentation_id)
        .order_by(SlideModel.index)
    )
    slides = list(slides_result)
    if slides:
        max_index = max(slide.index for slide in slides)
        insert_index = min(target_index, max_index + 1)
        slides_to_shift = [slide for slide in slides if slide.index >= insert_index]
    else:
        insert_index = 0
        slides_to_shift = []

    for slide in sorted(slides_to_shift, key=lambda each: each.index, reverse=True):
        slide.index += 1
        sql_session.add(slide)

    new_slide_content = copy.deepcopy(content)
    new_slide = SlideModel(
        presentation=presentation_id,
        layout_group=resolve_layout_group(presentation=presentation),
        layout=layout_id,
        index=insert_index,
        content=new_slide_content,
        speaker_note=extract_speaker_note(new_slide_content),
    )
    new_assets = await process_slide_and_fetch_assets(
        image_generation_service=image_generation_service,
        slide=new_slide,
        icon_weight=icon_weight,
    )

    sql_session.add(new_slide)
    sql_session.add_all(new_assets)
    await sql_session.commit()
    await sql_session.refresh(new_slide)

    await MEM0_PRESENTATION_MEMORY_SERVICE.store_slide_edit(
        presentation_id=presentation_id,
        slide_index=insert_index,
        edit_prompt=f"[chat_tool_save_slide_new] layout_id={layout_id}",
        edited_slide_content=new_slide.content,
    )
    await PRESENTON_MONGO_PROJECTION_SERVICE.safe_sync_presentation_bundle(
        sql_session,
        presentation_id=presentation_id,
        reason="chat_save_slide_create",
    )
    return {
        "saved": True,
        "action": "created",
        "message": f"New slide saved at index {insert_index}.",
        "slide_id": str(new_slide.id),
        "index": insert_index,
        "shifted_slide_count": len(slides_to_shift),
    }


async def delete_slide(
    sql_session: AsyncSession,
    presentation_id: uuid.UUID,
    *,
    index: int,
) -> dict[str, Any]:
    target_index = max(0, index)
    slide = await sql_session.scalar(
        select(SlideModel).where(
            SlideModel.presentation == presentation_id,
            SlideModel.index == target_index,
        )
    )
    if not slide:
        return {
            "deleted": False,
            "message": f"No slide found at index {target_index}.",
            "index": target_index,
        }

    await sql_session.delete(slide)

    slides_result = await sql_session.scalars(
        select(SlideModel).where(SlideModel.presentation == presentation_id)
    )
    slides = sorted(list(slides_result), key=lambda each: each.index)
    shifted_count = 0
    for each_slide in slides:
        if each_slide.index <= target_index:
            continue
        each_slide.index -= 1
        sql_session.add(each_slide)
        shifted_count += 1

    await sql_session.commit()
    await PRESENTON_MONGO_PROJECTION_SERVICE.safe_sync_presentation_bundle(
        sql_session,
        presentation_id=presentation_id,
        reason="chat_delete_slide",
    )
    return {
        "deleted": True,
        "message": f"Slide at index {target_index} was deleted successfully.",
        "deleted_slide_id": str(slide.id),
        "index": target_index,
        "shifted_slide_count": shifted_count,
    }


def validate_slide_content(*, content: dict[str, Any], schema: dict[str, Any]) -> list[str]:
    validation_content = strip_runtime_fields(content)
    validator = Draft202012Validator(schema)
    errors = sorted(validator.iter_errors(validation_content), key=lambda err: err.path)
    if not errors:
        return []

    formatted_errors: list[str] = []
    for err in errors[:MAX_SCHEMA_ERRORS]:
        location = ".".join([str(part) for part in err.path]) or "$"
        formatted_errors.append(f"{location}: {err.message}")
    return formatted_errors


def strip_runtime_fields(value: Any) -> Any:
    if isinstance(value, dict):
        sanitized: dict[str, Any] = {}
        for key, nested_value in value.items():
            if key in RUNTIME_CONTENT_FIELDS:
                continue
            sanitized[key] = strip_runtime_fields(nested_value)
        return sanitized
    if isinstance(value, list):
        return [strip_runtime_fields(item) for item in value]
    return value


def extract_speaker_note(content: dict[str, Any]) -> str:
    value = content.get("__speaker_note__")
    return value if isinstance(value, str) else ""


def resolve_layout_group(
    *,
    presentation: PresentationModel,
    fallback: str = "presentation",
) -> str:
    if isinstance(presentation.layout, dict):
        name = str(presentation.layout.get("name") or "").strip()
        if name:
            return name
    return fallback
