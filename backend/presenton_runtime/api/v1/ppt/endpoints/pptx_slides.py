from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, File, UploadFile

from api.v1.ppt.endpoints.pptx_slides_support.pptx_slide_models import (
    PptxFontsResponse,
    PptxSlidesResponse,
)
from api.v1.ppt.endpoints.pptx_slides_support.pptx_slide_orchestration import (
    process_pptx_fonts_request,
    process_pptx_slides_request,
)

PPTX_SLIDES_ROUTER = APIRouter(prefix="/pptx-slides", tags=["PPTX Slides"])
PPTX_FONTS_ROUTER = APIRouter(prefix="/pptx-fonts", tags=["PPTX Fonts"])


@PPTX_SLIDES_ROUTER.post("/process", response_model=PptxSlidesResponse)
async def process_pptx_slides(
    pptx_file: UploadFile = File(..., description="PPTX file to process"),
    fonts: Optional[list[UploadFile]] = File(None, description="Optional font files"),
):
    return await process_pptx_slides_request(pptx_file, fonts)


@PPTX_FONTS_ROUTER.post("/process", response_model=PptxFontsResponse)
async def process_pptx_fonts(
    pptx_file: UploadFile = File(..., description="PPTX file to analyze fonts from"),
):
    return await process_pptx_fonts_request(pptx_file)
