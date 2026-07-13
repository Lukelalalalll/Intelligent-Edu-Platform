from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class TemplateDetail(BaseModel):
    id: str
    name: str
    total_layouts: int | None = None


class TemplateLayoutData(BaseModel):
    template: uuid.UUID
    layout_id: str
    layout_name: str
    layout_code: str
    fonts: Any | None = None


class TemplateData(BaseModel):
    id: uuid.UUID
    init_id: uuid.UUID | None = None
    name: str
    description: str | None = None
    created_at: datetime


class GetTemplateLayoutsResponse(BaseModel):
    layouts: list[TemplateLayoutData]
    template: TemplateData | None = None
    fonts: Any | None = None


class TemplateExample(BaseModel):
    template: str
    slides: list[dict]


class CreateTemplateInitRequest(BaseModel):
    pptx_url: str
    slide_image_urls: list[str]
    fonts: dict = {}


class CreateSlideLayoutRequest(BaseModel):
    id: uuid.UUID
    index: int


class CreateSlideLayoutResponse(BaseModel):
    react_component: str


class EditSlideLayoutRequest(BaseModel):
    react_component: str
    prompt: str


class EditSlideLayoutResponse(CreateSlideLayoutResponse):
    pass


class EditSlideLayoutSectionRequest(BaseModel):
    react_component: str
    section: str
    prompt: str


class EditSlideLayoutSectionResponse(CreateSlideLayoutResponse):
    pass


class SaveTemplateLayoutData(BaseModel):
    layout_id: str
    layout_name: str
    layout_code: str


class SaveTemplateRequest(BaseModel):
    template_info_id: uuid.UUID
    name: str
    description: str | None = None
    layouts: list[SaveTemplateLayoutData]


class SaveTemplateResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    created_at: datetime


class CloneTemplateRequest(BaseModel):
    id: str
    name: str
    description: str | None = None


class UpdateTemplateRequest(BaseModel):
    id: uuid.UUID
    layouts: list[SaveTemplateLayoutData]


class SaveSlideLayoutRequest(BaseModel):
    template_id: uuid.UUID
    layout_id: str
    layout_code: str


class CloneSlideLayoutRequest(BaseModel):
    template_id: str
    layout_id: str
    layout_name: str | None = None
