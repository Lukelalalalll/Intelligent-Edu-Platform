from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel


class SlideData(BaseModel):
    slide_number: int
    screenshot_url: str
    xml_content: str
    normalized_fonts: List[str]


class FontAnalysisResult(BaseModel):
    internally_supported_fonts: List[Dict[str, str]]
    not_supported_fonts: List[str]


class PptxSlidesResponse(BaseModel):
    success: bool
    slides: List[SlideData]
    total_slides: int
    fonts: Optional[FontAnalysisResult] = None


class PptxFontsResponse(BaseModel):
    success: bool
    fonts: FontAnalysisResult
