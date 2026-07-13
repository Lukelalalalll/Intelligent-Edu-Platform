"""Strict Pydantic models for the Slides/Video generation pipeline.

All scene data MUST pass through these models at the route layer
before being handed to the rendering service. No more json.loads()
in render.py.
"""
from __future__ import annotations

import json
import re
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _camel_to_snake(name: str) -> str:
    return re.sub(r'(?<!^)(?=[A-Z])', '_', name).lower()


class ChartDataItem(BaseModel):
    label: str = Field(..., max_length=60)
    value: float


class ParsedLayoutData(BaseModel):
    """Pre-parsed, clean content for each layout type.

    The route layer is responsible for parsing slideBody (Markdown / JSON)
    into this structured format before passing to the renderer.
    """
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    bullets: List[str] = Field(default_factory=list)
    col1Title: Optional[str] = Field(default=None, max_length=60)
    col1Bullets: List[str] = Field(default_factory=list)
    col2Title: Optional[str] = Field(default=None, max_length=60)
    col2Bullets: List[str] = Field(default_factory=list)
    chartData: List[ChartDataItem] = Field(default_factory=list)
    flowSteps: List[str] = Field(default_factory=list)
    codeSnippet: Optional[str] = Field(default=None, max_length=4000)
    codeLanguage: Optional[str] = Field(default=None, max_length=40)
    quoteText: Optional[str] = Field(default=None, max_length=300)

    @field_validator("bullets", "col1Bullets", "col2Bullets", "flowSteps", mode="before")
    @classmethod
    def cap_list(cls, v: list) -> list:
        return v[:7] if v else []


class RenderOptions(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    animationLevel: Literal["off", "basic", "high"] = "off"
    subtitleMode: Literal["hard_srt", "image_strip", "none"] = "none"
    toneMode: Literal["lecture", "inspire", "poetry"] = "lecture"


class SceneAssets(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    customImagePath: Optional[str] = None
    layoutImagePath: Optional[str] = None


class SceneModel(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    id: str
    layoutType: Literal[
        "title-bullets", "image-left", "image-right", "image-top",
        "big-quote", "two-column", "bar-chart", "flowchart", "code"
    ] = "title-bullets"
    themeId: str = "dark-ocean"
    slideMode: Literal["theme", "image"] = "theme"
    slideTitle: str = Field(..., max_length=100)
    slideBody: str = ""
    parsedContent: ParsedLayoutData = Field(default_factory=ParsedLayoutData)
    assets: SceneAssets = Field(default_factory=SceneAssets)
    renderOptions: RenderOptions = Field(default_factory=RenderOptions)
    script: str = ""
    toneMode: str = "lecture"


def parse_scene_body(scene_dict: dict) -> ParsedLayoutData:
    """Parse slideBody (raw JSON or plain text) into ParsedLayoutData.
    Call this in video_routes.py, NOT in render.py.
    """
    body = scene_dict.get("slideBody", "") or ""
    bullets: List[str] = []
    try:
        parsed = json.loads(body)
        if isinstance(parsed, dict) and "bullets" in parsed:
            bullets = [str(b)[:80] for b in parsed["bullets"][:7]]
        elif isinstance(parsed, list):
            bullets = [str(b)[:80] for b in parsed[:7]]
    except (json.JSONDecodeError, TypeError):
        pass
    if not bullets:
        bullets = [l.strip()[:80] for l in body.split("\n") if l.strip()][:7]

    chart_raw = scene_dict.get("chartData") or []
    chart_items = [
        ChartDataItem(**d) for d in chart_raw
        if isinstance(d, dict) and "label" in d and "value" in d
    ]

    return ParsedLayoutData(
        bullets=bullets,
        col1Title=scene_dict.get("col1Title"),
        col1Bullets=scene_dict.get("col1Bullets") or [],
        col2Title=scene_dict.get("col2Title"),
        col2Bullets=scene_dict.get("col2Bullets") or [],
        chartData=chart_items,
        flowSteps=scene_dict.get("flowSteps") or [],
        codeSnippet=scene_dict.get("codeSnippet"),
        codeLanguage=scene_dict.get("codeLanguage"),
        quoteText=scene_dict.get("quoteText"),
    )
