from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class RenderEditorSessionRequest(BaseModel):
    pptx_base64: Optional[str] = Field(None, description="Base64-encoded PPTX bytes")
    theme_id: Optional[str] = Field(None, description="Theme identifier for template merging")
    theme: Optional[str] = Field(None, description="Frontend theme identifier")
    ppt_schema: Optional[Dict[str, Any]] = Field(None, description="Frontend PPT schema")
    slide_lookup_table: Dict[int, str] = Field(
        default_factory=dict,
        description="Mapping from slide index to layout type (e.g. 'title_slide')",
    )


class AutoAssignLayoutsRequest(BaseModel):
    slides_md: Optional[List[Dict[str, Any]]] = Field(
        None,
        description="Array of slide objects with md_content and slide_number",
    )
    provider: Optional[str] = None
    theme: Optional[str] = None
    ppt_schema: Optional[Dict[str, Any]] = None


class ConvertToPptxRequest(BaseModel):
    payload: Dict[str, Any] = Field(..., description="JSON payload describing slides and their elements")
    theme_id: str = Field(..., description="Theme ID to apply")


class EditTextRequest(BaseModel):
    session_id: str = Field(..., description="Editor session ID")
    slide_index: int = Field(..., ge=1, description="1-based slide index")
    element_index: int = Field(..., ge=0, description="0-based element index on the slide")
    new_text: str = Field(..., min_length=1, description="New text content")


class ReRenderSessionRequest(BaseModel):
    session_id: str = Field(..., description="Editor session ID")
    edits: List[Dict[str, Any]] = Field(default_factory=list)
    slide_images: Optional[List[Dict[str, Any]]] = None


class ExportPptxRequest(BaseModel):
    session_id: str = Field(..., description="Editor session ID")
    theme: Optional[str] = None
    ppt_schema: Optional[Dict[str, Any]] = None
    edits: List[Dict[str, Any]] = Field(default_factory=list)
    slide_images: Optional[List[Dict[str, Any]]] = None
