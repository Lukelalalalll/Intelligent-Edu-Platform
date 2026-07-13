from __future__ import annotations

from typing import List, Literal

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
    render_mode: Literal["pptx_to_html", "libreoffice_png", "degraded"]
    preview_warning: str | None = None


class FontReplacementSelection(BaseModel):
    original_name: str
    original_variant: str
    replacement_family_name: str
    replacement_variant: str
    replacement_label: str


class _PreviewLogger:
    @staticmethod
    def _format(message: str, *args) -> str:
        if args:
            try:
                return message % args
            except Exception:
                return " ".join([message, *[str(arg) for arg in args]])
        return message

    def info(self, message: str, *args):
        print(f"[fonts-preview] {self._format(message, *args)}")

    def warning(self, message: str, *args):
        print(f"[fonts-preview] WARNING: {self._format(message, *args)}")

    def error(self, message: str, *args):
        print(f"[fonts-preview] ERROR: {self._format(message, *args)}")
