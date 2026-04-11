"""Shared router instances for the slides sub-system."""
from typing import Literal, Optional
from fastapi import APIRouter
from pydantic import BaseModel

slides_router = APIRouter(prefix="/api/slides", tags=["Slides"])
public_slides_router = APIRouter(prefix="/slides", tags=["SlidesPublic"])
legacy_sub1_router = APIRouter(prefix="/api/sub1", tags=["SlidesLegacy"])


class SlidesDeliveryJobSchema(BaseModel):
    provider: Optional[Literal['coze', 'local_ollama']] = 'local_ollama'
    title: str = "Lesson Delivery Pack"
    ppt_schema: dict
    script_style: str = "classroom"
    locale: str = "en"
