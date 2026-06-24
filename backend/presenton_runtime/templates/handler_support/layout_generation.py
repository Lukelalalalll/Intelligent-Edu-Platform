from __future__ import annotations

import os
import uuid

from fastapi import Body, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from models.sql.template_create_info import TemplateCreateInfoModel
from services.database import async_session_maker, get_async_session
from services.export_task_service import EXPORT_TASK_SERVICE
from templates.handler_support.code_normalization import (
    _normalize_asset_fields,
    _normalize_layout_code_for_create,
    _strip_code_fences,
)
from templates.handler_support.image_io import _read_image_bytes_and_media_type
from templates.handler_support.models import (
    CreateSlideLayoutRequest,
    CreateSlideLayoutResponse,
    CreateTemplateInitRequest,
    EditSlideLayoutRequest,
    EditSlideLayoutResponse,
    EditSlideLayoutSectionRequest,
    EditSlideLayoutSectionResponse,
)
from templates.preview import (
    FontsUploadAndSlidesPreviewResponse,
    upload_fonts_and_slides_preview_handler,
)
from templates.prompts import (
    SLIDE_LAYOUT_CREATION_SYSTEM_PROMPT,
    SLIDE_LAYOUT_EDIT_SECTION_SYSTEM_PROMPT,
    SLIDE_LAYOUT_EDIT_SYSTEM_PROMPT,
)
from templates.providers import edit_slide_layout_code, generate_slide_layout_code
from templates.slide_layout_jobs import (
    SlideLayoutJobStartResponse,
    SlideLayoutJobStatusResponse,
    get_slide_layout_job,
    start_slide_layout_job,
)
from utils.asset_directory_utils import resolve_app_path_to_filesystem


async def upload_fonts_and_slides_preview(
    pptx_file: UploadFile = File(..., description="PPTX file to preview"),
    font_files: list[UploadFile] | None = File(
        default=None,
        description="Font files to upload",
    ),
    original_font_names: list[str] | None = Form(default=None),
) -> FontsUploadAndSlidesPreviewResponse:
    return await upload_fonts_and_slides_preview_handler(
        pptx_file=pptx_file,
        font_files=font_files,
        original_font_names=original_font_names,
        max_slides=25,
    )


async def init_create_template(
    request: CreateTemplateInitRequest,
    sql_session: AsyncSession = Depends(get_async_session),
) -> uuid.UUID:
    if not request.slide_image_urls:
        raise HTTPException(status_code=400, detail="At least one slide image is required")

    pptx_path = resolve_app_path_to_filesystem(request.pptx_url)
    if not pptx_path or not os.path.isfile(pptx_path):
        raise HTTPException(status_code=400, detail="PPTX file not found")

    pptx_document = await EXPORT_TASK_SERVICE.convert_pptx_to_html(pptx_path, get_fonts=False)
    if not pptx_document.slides:
        raise HTTPException(status_code=500, detail="PPTX-to-HTML export returned no slides")

    if len(pptx_document.slides) < len(request.slide_image_urls):
        raise HTTPException(
            status_code=400,
            detail=(
                "PPTX-to-HTML export returned fewer slides than the preview images. "
                f"Expected at least {len(request.slide_image_urls)}, "
                f"got {len(pptx_document.slides)}."
            ),
        )

    template_create_info = TemplateCreateInfoModel(
        fonts=request.fonts or {},
        pptx_url=request.pptx_url,
        slide_image_urls=request.slide_image_urls,
        slide_htmls=pptx_document.slides[: len(request.slide_image_urls)],
    )
    sql_session.add(template_create_info)
    await sql_session.commit()
    await sql_session.refresh(template_create_info)
    return template_create_info.id


async def _create_slide_layout_impl(
    sql_session: AsyncSession,
    request: CreateSlideLayoutRequest,
) -> CreateSlideLayoutResponse:
    template_info = await sql_session.get(TemplateCreateInfoModel, request.id)
    if not template_info:
        raise HTTPException(status_code=400, detail="Template not found")

    total_slides = len(template_info.slide_htmls)
    if request.index < 0 or request.index >= total_slides:
        raise HTTPException(status_code=400, detail="Invalid slide index")

    slide_html = template_info.slide_htmls[request.index]
    slide_image_url = template_info.slide_image_urls[request.index]
    image_bytes, media_type = await _read_image_bytes_and_media_type(slide_image_url)

    fonts_text = ""
    if template_info.fonts:
        font_names = [font.replace(" ", "_") for font in template_info.fonts.keys()]
        fonts_text = "#PROVIDED FONTS\n- " + "\n- ".join(font_names)

    react_component = await generate_slide_layout_code(
        system_prompt=SLIDE_LAYOUT_CREATION_SYSTEM_PROMPT,
        user_text=f"{fonts_text}\n\n#SLIDE HTML REFERENCE\n{slide_html}",
        image_bytes=image_bytes,
        media_type=media_type,
    )
    return CreateSlideLayoutResponse(
        react_component=_normalize_layout_code_for_create(react_component)
    )


async def create_slide_layout(
    request: CreateSlideLayoutRequest = Body(...),
    sql_session: AsyncSession = Depends(get_async_session),
) -> CreateSlideLayoutResponse:
    return await _create_slide_layout_impl(sql_session, request)


async def create_slide_layout_job_start(
    request: CreateSlideLayoutRequest = Body(...),
) -> SlideLayoutJobStartResponse:
    req = request.model_copy()

    async def work() -> str:
        async with async_session_maker() as session:
            result = await _create_slide_layout_impl(session, req)
            return result.react_component

    job_id = await start_slide_layout_job(work)
    return SlideLayoutJobStartResponse(job_id=job_id)


async def create_slide_layout_job_status(
    job_id: uuid.UUID,
) -> SlideLayoutJobStatusResponse:
    rec = await get_slide_layout_job(str(job_id))
    if rec is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return SlideLayoutJobStatusResponse(
        status=rec.status,
        react_component=rec.react_component,
        error=rec.error,
    )


async def edit_slide_layout(
    request: EditSlideLayoutRequest,
) -> EditSlideLayoutResponse:
    react_component = await edit_slide_layout_code(
        system_prompt=SLIDE_LAYOUT_EDIT_SYSTEM_PROMPT,
        user_text=f"#Prompt\n{request.prompt}\n\n#TSX code\n{request.react_component}",
    )
    return EditSlideLayoutResponse(
        react_component=_normalize_asset_fields(_strip_code_fences(react_component))
    )


async def edit_slide_layout_section(
    request: EditSlideLayoutSectionRequest,
) -> EditSlideLayoutSectionResponse:
    react_component = await edit_slide_layout_code(
        system_prompt=SLIDE_LAYOUT_EDIT_SECTION_SYSTEM_PROMPT,
        user_text=(
            f"#Prompt\n{request.prompt}\n\n"
            f"#Section to make changes around\n{request.section}\n\n"
            f"#TSX code\n{request.react_component}"
        ),
    )
    return EditSlideLayoutSectionResponse(
        react_component=_normalize_asset_fields(_strip_code_fences(react_component))
    )
