from __future__ import annotations

import logging
import random
import uuid
from typing import Annotated, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from backend.services.presenton.presenton_projection_service import PRESENTON_MONGO_PROJECTION_SERVICE
from constants.presentation import MAX_NUMBER_OF_SLIDES
from enums.tone import Tone
from enums.verbosity import Verbosity
from models.presentation_layout import PresentationLayoutModel
from models.presentation_outline_model import PresentationOutlineModel, SlideOutlineModel
from models.presentation_structure_model import PresentationStructureModel
from models.presentation_with_slides import PresentationWithSlides
from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel
from services.database import get_async_session
from services.mem0_presentation_memory_service import MEM0_PRESENTATION_MEMORY_SERVICE
from services.temp_file_service import TEMP_FILE_SERVICE
from utils.llm_calls.generate_presentation_structure import generate_presentation_structure
from utils.outline_utils import (
    get_no_of_toc_required_for_n_outlines,
    get_presentation_outline_model_with_toc,
)
from utils.ppt_utils import select_toc_or_list_slide_layout_index
from utils.web_search import get_selected_web_search_provider, get_web_search_route

from .helpers import build_owner_user_id, insert_toc_layouts, resolve_presentation_fonts

logger = logging.getLogger(__name__)
crud_router = APIRouter()


@crud_router.get("/all", response_model=List[PresentationWithSlides])
async def get_all_presentations(sql_session: AsyncSession = Depends(get_async_session)):
    query = (
        select(PresentationModel, SlideModel)
        .join(SlideModel, (SlideModel.presentation == PresentationModel.id) & (SlideModel.index == 0))
        .order_by(PresentationModel.created_at.desc())
    )
    results = await sql_session.execute(query)
    presentations_with_slides = []
    for presentation, first_slide in results.all():
        slides = [first_slide]
        presentations_with_slides.append(
            PresentationWithSlides(
                **presentation.model_dump(),
                slides=slides,
                fonts=await resolve_presentation_fonts(presentation, slides, sql_session),
            )
        )
    return presentations_with_slides


@crud_router.get("/{id}", response_model=PresentationWithSlides)
async def get_presentation(id: uuid.UUID, sql_session: AsyncSession = Depends(get_async_session)):
    presentation = await sql_session.get(PresentationModel, id)
    if not presentation:
        raise HTTPException(404, "Presentation not found")
    slides = list(
        await sql_session.scalars(select(SlideModel).where(SlideModel.presentation == id).order_by(SlideModel.index))
    )
    return PresentationWithSlides(
        **presentation.model_dump(),
        slides=slides,
        fonts=await resolve_presentation_fonts(presentation, slides, sql_session),
    )


@crud_router.delete("/{id}", status_code=204)
async def delete_presentation(
    id: uuid.UUID,
    request_http: Request,
    sql_session: AsyncSession = Depends(get_async_session),
):
    presentation = await sql_session.get(PresentationModel, id)
    if not presentation:
        raise HTTPException(404, "Presentation not found")
    await sql_session.delete(presentation)
    await sql_session.commit()
    await PRESENTON_MONGO_PROJECTION_SERVICE.safe_delete_projection(
        presentation_id=id,
        owner_user_id=build_owner_user_id(request_http),
        reason="delete_presentation",
    )


@crud_router.post("/create", response_model=PresentationModel)
async def create_presentation(
    request_http: Request,
    content: Annotated[str, Body()],
    n_slides: Annotated[Optional[int], Body()] = None,
    language: Annotated[Optional[str], Body()] = None,
    file_paths: Annotated[Optional[List[str]], Body()] = None,
    tone: Annotated[Tone, Body()] = Tone.DEFAULT,
    verbosity: Annotated[Verbosity, Body()] = Verbosity.STANDARD,
    instructions: Annotated[Optional[str], Body()] = None,
    include_table_of_contents: Annotated[bool, Body()] = False,
    include_title_slide: Annotated[bool, Body()] = True,
    web_search: Annotated[bool, Body()] = False,
    sql_session: AsyncSession = Depends(get_async_session),
):
    if n_slides is not None and n_slides < 1:
        raise HTTPException(status_code=400, detail="Number of slides must be greater than 0")
    if n_slides is not None and n_slides > MAX_NUMBER_OF_SLIDES:
        raise HTTPException(
            status_code=400,
            detail=f"Number of slides cannot be greater than {MAX_NUMBER_OF_SLIDES}",
        )
    if include_table_of_contents and n_slides is not None and n_slides < 3:
        raise HTTPException(
            status_code=400,
            detail="Number of slides cannot be less than 3 if table of contents is included",
        )

    presentation = PresentationModel(
        id=uuid.uuid4(),
        content=content,
        n_slides=n_slides if n_slides is not None else 0,
        language=(language or "").strip(),
        file_paths=TEMP_FILE_SERVICE.resolve_existing_temp_paths(file_paths) if file_paths else None,
        tone=tone.value,
        verbosity=verbosity.value,
        instructions=instructions,
        include_table_of_contents=include_table_of_contents,
        include_title_slide=include_title_slide,
        web_search=web_search,
    )
    sql_session.add(presentation)
    await sql_session.commit()
    await PRESENTON_MONGO_PROJECTION_SERVICE.safe_sync_presentation_bundle(
        sql_session,
        presentation_id=presentation.id,
        owner_user_id=build_owner_user_id(request_http),
        reason="create_presentation",
    )

    search_route, actual_search_provider = get_web_search_route()
    logger.info(
        "Created presentation: id=%s web_search_enabled=%s selected_web_search_provider=%s web_search_route=%s actual_web_search_provider=%s",
        presentation.id,
        web_search,
        get_selected_web_search_provider().value,
        search_route,
        actual_search_provider.value if actual_search_provider else ("model-native" if search_route == "native" else "none"),
    )
    return presentation


@crud_router.post("/prepare", response_model=PresentationModel)
async def prepare_presentation(
    presentation_id: Annotated[uuid.UUID, Body()],
    outlines: Annotated[List[SlideOutlineModel], Body()],
    layout: Annotated[PresentationLayoutModel, Body()],
    title: Annotated[Optional[str], Body()] = None,
    sql_session: AsyncSession = Depends(get_async_session),
):
    if not outlines:
        raise HTTPException(status_code=400, detail="Outlines are required")
    presentation = await sql_session.get(PresentationModel, presentation_id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")

    presentation_outline_model = PresentationOutlineModel(slides=outlines)
    total_slide_layouts = len(layout.slides)
    total_outlines = len(outlines)
    if layout.ordered:
        presentation_structure = layout.to_presentation_structure()
    else:
        presentation_structure = await generate_presentation_structure(
            presentation_outline=presentation_outline_model,
            presentation_layout=layout,
            instructions=presentation.instructions,
        )

    presentation_structure.slides = presentation_structure.slides[: len(outlines)]
    for index in range(total_outlines):
        random_slide_index = random.randint(0, total_slide_layouts - 1)
        if index >= total_outlines:
            presentation_structure.slides.append(random_slide_index)
            continue
        if presentation_structure.slides[index] >= total_slide_layouts:
            presentation_structure.slides[index] = random_slide_index

    if presentation.include_table_of_contents:
        n_toc_slides = get_no_of_toc_required_for_n_outlines(
            n_outlines=total_outlines,
            title_slide=presentation.include_title_slide,
            target_total_slides=(presentation.n_slides if presentation.n_slides > 0 else None),
        )
        toc_slide_layout_index = select_toc_or_list_slide_layout_index(layout)
        insert_toc_layouts(
            presentation_structure,
            n_toc_slides,
            presentation.include_title_slide,
            toc_slide_layout_index,
        )
        if toc_slide_layout_index != -1 and n_toc_slides > 0:
            presentation_outline_model = get_presentation_outline_model_with_toc(
                outline=presentation_outline_model,
                n_toc_slides=n_toc_slides,
                title_slide=presentation.include_title_slide,
            )

    sql_session.add(presentation)
    presentation.outlines = presentation_outline_model.model_dump(mode="json")
    presentation.title = title or presentation.title
    presentation.set_layout(layout)
    presentation.set_structure(presentation_structure)
    await sql_session.commit()
    await MEM0_PRESENTATION_MEMORY_SERVICE.store_generated_outlines(presentation.id, presentation.outlines)
    return presentation


@crud_router.patch("/update", response_model=PresentationWithSlides)
async def update_presentation(
    request_http: Request,
    id: Annotated[uuid.UUID, Body()],
    n_slides: Annotated[Optional[int], Body()] = None,
    title: Annotated[Optional[str], Body()] = None,
    theme: Annotated[Optional[dict], Body()] = None,
    slides: Annotated[Optional[List[SlideModel]], Body()] = None,
    sql_session: AsyncSession = Depends(get_async_session),
):
    presentation = await sql_session.get(PresentationModel, id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")

    presentation_update_dict = {}
    if n_slides is not None:
        presentation_update_dict["n_slides"] = n_slides
    if title:
        presentation_update_dict["title"] = title
    if theme or theme is None:
        presentation_update_dict["theme"] = theme
    if presentation_update_dict:
        presentation.sqlmodel_update(presentation_update_dict)
    if slides:
        for slide in slides:
            slide.presentation = uuid.UUID(slide.presentation)
            slide.id = uuid.UUID(slide.id)
        from sqlalchemy import delete

        await sql_session.execute(delete(SlideModel).where(SlideModel.presentation == presentation.id))
        sql_session.add_all(slides)

    await sql_session.commit()
    await PRESENTON_MONGO_PROJECTION_SERVICE.safe_sync_presentation_bundle(
        sql_session,
        presentation_id=presentation.id,
        owner_user_id=build_owner_user_id(request_http),
        reason="update_presentation",
    )
    response_slides = slides or []
    return PresentationWithSlides(
        **presentation.model_dump(),
        slides=response_slides,
        fonts=await resolve_presentation_fonts(presentation, response_slides, sql_session),
    )
