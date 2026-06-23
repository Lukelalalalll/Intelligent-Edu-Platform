from __future__ import annotations

from pydantic import BaseModel, model_validator

from utils.icon_weights import DEFAULT_ICON_WEIGHT, extract_icon_weight_from_settings


class PptxToHtmlDocument(BaseModel):
    slides: list[str]
    font_css: str = ""
    width: float
    height: float
    images_dir: str
    fonts_dir: str


class PresentationExportTaskResult(BaseModel):
    path: str


class HtmlToImageTaskResult(BaseModel):
    path: str


class HtmlToImagesTaskResult(BaseModel):
    paths: list[str]


class ExtractSchemaSlide(BaseModel):
    id: str
    name: str | None = None
    description: str | None = None
    json_schema: dict


class ExtractSchemaDocument(BaseModel):
    name: str
    ordered: bool = False
    icon_weight: str = DEFAULT_ICON_WEIGHT
    slides: list[ExtractSchemaSlide]

    @model_validator(mode="before")
    @classmethod
    def normalize_icon_weight(cls, data):
        if isinstance(data, dict):
            normalized = dict(data)
            normalized["icon_weight"] = extract_icon_weight_from_settings(normalized)
            return normalized
        return data
