from __future__ import annotations

from fastapi import UploadFile

from api.v1.ppt.endpoints.pptx_slides_support.pptx_archive_utils import (
    create_temp_dir,
    extract_slide_xmls,
    save_fonts,
    save_upload_to_temp,
    validate_pptx_upload,
)
from api.v1.ppt.endpoints.pptx_slides_support.pptx_font_analysis import (
    analyze_fonts_in_all_slides,
)
from api.v1.ppt.endpoints.pptx_slides_support.pptx_screenshot_store import (
    persist_slide_screenshots,
)
from api.v1.ppt.endpoints.pptx_slides_support.pptx_slide_models import (
    PptxFontsResponse,
    PptxSlidesResponse,
)
from templates.fonts_and_slides_preview import (
    _PreviewLogger,
    render_pptx_slides_to_images,
)


async def process_pptx_slides_request(
    pptx_file: UploadFile,
    fonts: list[UploadFile] | None = None,
) -> PptxSlidesResponse:
    validate_pptx_upload(pptx_file, enforce_size_limit=True)
    with create_temp_dir() as temp_dir:
        pptx_path = await save_upload_to_temp(pptx_file, temp_dir)
        font_paths = await save_fonts(fonts or [], temp_dir)
        slide_xmls = extract_slide_xmls(pptx_path, temp_dir)
        screenshot_paths = await render_pptx_slides_to_images(
            modified_pptx_path=pptx_path,
            font_paths_for_install=font_paths,
            max_slides=None,
            logger=_PreviewLogger(),
        )
        print(f"Screenshot paths: {screenshot_paths}")

        font_analysis = await analyze_fonts_in_all_slides(slide_xmls)
        print(
            "Font analysis completed: "
            f"{len(font_analysis.internally_supported_fonts)} supported, "
            f"{len(font_analysis.not_supported_fonts)} not supported"
        )

        slides_data = persist_slide_screenshots(slide_xmls, screenshot_paths)
        return PptxSlidesResponse(
            success=True,
            slides=slides_data,
            total_slides=len(slides_data),
            fonts=font_analysis,
        )


async def process_pptx_fonts_request(pptx_file: UploadFile) -> PptxFontsResponse:
    validate_pptx_upload(pptx_file, enforce_size_limit=False)
    with create_temp_dir() as temp_dir:
        pptx_path = await save_upload_to_temp(pptx_file, temp_dir)
        slide_xmls = extract_slide_xmls(pptx_path, temp_dir)
        font_analysis = await analyze_fonts_in_all_slides(slide_xmls)
        return PptxFontsResponse(success=True, fonts=font_analysis)
