from __future__ import annotations

from typing import List

from pydantic import BaseModel


class FontInfo(BaseModel):
    name: str
    url: str | None = None
    original_name: str | None = None
    family_name: str | None = None
    variant: str | None = None
    variants: List[str] | None = None


class FontCheckResponse(BaseModel):
    available_fonts: List[FontInfo]
    unavailable_fonts: List[FontInfo]


class FontsUploadAndSlidesPreviewResponse(BaseModel):
    slide_image_urls: List[str]
    pptx_url: str
    modified_pptx_url: str
    fonts: dict


class FontReplacementSelection(BaseModel):
    original_name: str
    original_variant: str
    replacement_family_name: str
    replacement_variant: str
    replacement_label: str


class _PreviewLogger:
    def info(self, message: str):
        print(f"[fonts-preview] {message}")

    def warning(self, message: str):
        print(f"[fonts-preview] WARNING: {message}")

    def error(self, message: str):
        print(f"[fonts-preview] ERROR: {message}")
