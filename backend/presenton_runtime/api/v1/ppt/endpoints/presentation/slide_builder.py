from __future__ import annotations

import asyncio
import logging
import random
from typing import List

from models.presentation_outline_model import PresentationOutlineModel
from models.presentation_structure_model import PresentationStructureModel
from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel
from services.image_generation_service import ImageGenerationService
from utils.asset_directory_utils import get_images_directory
from utils.get_layout_by_name import get_layout_by_name
from utils.llm_calls.generate_presentation_structure import generate_presentation_structure
from utils.llm_calls.generate_slide_content import get_slide_content_from_type_and_outline
from utils.outline_utils import (
    get_images_for_slides_from_outline,
    get_no_of_toc_required_for_n_outlines,
    get_presentation_outline_model_with_toc,
    get_presentation_title_from_presentation_outline,
)
from utils.ppt_utils import select_toc_or_list_slide_layout_index
from utils.process_slides import process_slide_and_fetch_assets

from .helpers import insert_toc_layouts

logger = logging.getLogger(__name__)


async def build_presentation_assets(
    *,
    request,
    presentation_id,
    presentation_outlines: PresentationOutlineModel,
    total_outlines: int,
    using_slides_markdown: bool,
    language_to_use: str | None,
):
    logger.info("[presentation.generate] loading layout template=%r presentation_id=%s", request.template, presentation_id)
    layout_model = await get_layout_by_name(request.template)
    logger.info(
        "[presentation.generate] layout ready template=%r slides=%d ordered=%s icon_weight=%s",
        request.template,
        len(layout_model.slides),
        layout_model.ordered,
        layout_model.icon_weight,
    )
    presentation_structure, presentation_outlines = await _build_structure(
        request=request,
        layout_model=layout_model,
        presentation_outlines=presentation_outlines,
        total_outlines=total_outlines,
        using_slides_markdown=using_slides_markdown,
    )
    presentation = PresentationModel(
        id=presentation_id,
        content=request.content,
        n_slides=request.n_slides if request.n_slides is not None else len(presentation_outlines.slides),
        language=language_to_use or "",
        title=get_presentation_title_from_presentation_outline(presentation_outlines),
        outlines=presentation_outlines.model_dump(),
        layout=layout_model.model_dump(),
        structure=presentation_structure.model_dump(),
        tone=request.tone.value,
        verbosity=request.verbosity.value,
        instructions=request.instructions,
    )
    slides, generated_assets = await _generate_slides(
        presentation_id=presentation_id,
        presentation_outlines=presentation_outlines,
        presentation_structure=presentation_structure,
        layout_model=layout_model,
        language_to_use=language_to_use,
        request=request,
        using_slides_markdown=using_slides_markdown,
    )
    return presentation, slides, generated_assets


async def _build_structure(
    *,
    request,
    layout_model,
    presentation_outlines: PresentationOutlineModel,
    total_outlines: int,
    using_slides_markdown: bool,
) -> tuple[PresentationStructureModel, PresentationOutlineModel]:
    total_slide_layouts = len(layout_model.slides)
    if layout_model.ordered:
        presentation_structure = layout_model.to_presentation_structure()
    else:
        presentation_structure = await generate_presentation_structure(
            presentation_outlines,
            layout_model,
            request.instructions,
            using_slides_markdown,
        )
    presentation_structure.slides = presentation_structure.slides[:total_outlines]
    for index in range(total_outlines):
        random_slide_index = random.randint(0, total_slide_layouts - 1)
        if index >= total_outlines:
            presentation_structure.slides.append(random_slide_index)
        elif presentation_structure.slides[index] >= total_slide_layouts:
            presentation_structure.slides[index] = random_slide_index

    if request.include_table_of_contents and not using_slides_markdown:
        n_toc_slides = get_no_of_toc_required_for_n_outlines(
            n_outlines=total_outlines,
            title_slide=request.include_title_slide,
            target_total_slides=request.n_slides,
        )
        toc_slide_layout_index = select_toc_or_list_slide_layout_index(layout_model)
        insert_toc_layouts(presentation_structure, n_toc_slides, request.include_title_slide, toc_slide_layout_index)
        if toc_slide_layout_index != -1 and n_toc_slides > 0:
            presentation_outlines = get_presentation_outline_model_with_toc(
                outline=presentation_outlines,
                n_toc_slides=n_toc_slides,
                title_slide=request.include_title_slide,
            )
    return presentation_structure, presentation_outlines


async def _generate_slides(
    *,
    presentation_id,
    presentation_outlines: PresentationOutlineModel,
    presentation_structure: PresentationStructureModel,
    layout_model,
    language_to_use: str | None,
    request,
    using_slides_markdown: bool,
) -> tuple[list[SlideModel], list]:
    image_generation_service = ImageGenerationService(get_images_directory())
    async_assets_generation_tasks = []
    slides: List[SlideModel] = []
    slide_layouts = [layout_model.slides[idx] for idx in presentation_structure.slides]
    batch_size = 10
    print("-" * 40)
    print(f"Generated {len(presentation_outlines.slides)} outlines for the presentation")

    for start in range(0, len(slide_layouts), batch_size):
        end = min(start + batch_size, len(slide_layouts))
        print(f"Generating slides from {start} to {end}")
        batch_contents: List[dict] = await asyncio.gather(
            *[
                get_slide_content_from_type_and_outline(
                    slide_layouts[i],
                    presentation_outlines.slides[i],
                    language_to_use,
                    request.tone.value,
                    request.verbosity.value,
                    request.instructions,
                )
                for i in range(start, end)
            ]
        )
        batch_slides: List[SlideModel] = []
        for offset, slide_content in enumerate(batch_contents):
            i = start + offset
            slide_layout = slide_layouts[i]
            slide = SlideModel(
                presentation=presentation_id,
                layout_group=layout_model.name,
                layout=slide_layout.id,
                index=i,
                speaker_note=slide_content.get("__speaker_note__"),
                content=slide_content,
            )
            slides.append(slide)
            batch_slides.append(slide)

        image_urls_for_batch = (
            get_images_for_slides_from_outline(presentation_outlines.slides[start:end])
            if using_slides_markdown
            else [[] for _ in batch_slides]
        )
        async_assets_generation_tasks.extend(
            [
                asyncio.create_task(
                    process_slide_and_fetch_assets(
                        image_generation_service,
                        slide,
                        outline_image_urls=image_urls_for_batch[offset],
                        icon_weight=layout_model.icon_weight,
                    )
                )
                for offset, slide in enumerate(batch_slides)
            ]
        )

    generated_assets = [asset for assets_list in await asyncio.gather(*async_assets_generation_tasks) for asset in assets_list]
    return slides, generated_assets
