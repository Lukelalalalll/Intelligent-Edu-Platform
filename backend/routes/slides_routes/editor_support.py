from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any, Dict

from fastapi import HTTPException


def extract_json_from_markdown(text: str) -> str:
    match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
    if match:
        return match.group(1).strip()
    return text.strip()


def prep_auto_markdown(slides_md: list) -> str:
    parts: list[str] = []
    for slide in slides_md:
        num = slide.get("slide_number", slide.get("index", "?"))
        md = slide.get("md_content", "")
        parts.append(f"--- Slide {num} ---\n{md}")
    return "\n\n".join(parts)


def theme_from_body(body) -> str:
    return (body.theme_id or body.theme or "Dark").strip() or "Dark"


def build_pptx_bytes_from_schema(ppt_schema: Dict[str, Any], theme: str, *, create_ppt_fn, config) -> bytes:
    schema = dict(ppt_schema or {})
    schema["theme"] = theme
    schema["slides"] = [
        {**slide, "layout": slide.get("layout") or {"name": "Title and Content"}}
        for slide in schema.get("slides", [])
        if isinstance(slide, dict)
    ]
    filename = create_ppt_fn(schema)
    pptx_path = Path(config.PPT_RESULTS_FOLDER) / filename
    if not pptx_path.is_file():
        raise RuntimeError(f"Generated PPTX not found: {pptx_path}")
    return pptx_path.read_bytes()


def frontend_session_payload(session) -> Dict[str, Any]:
    slide_total = session.slide_count or len(session._slide_pngs)
    slides = [
        {
            "index": idx - 1,
            "preview_url": f"/api/slides/editor/sessions/{session.session_id}/slides/{idx}.png",
            "elements": [],
        }
        for idx in range(1, slide_total + 1)
    ]
    return {
        "session_id": session.session_id,
        "theme": session.theme_id,
        "theme_id": session.theme_id,
        "slide_width_pt": 960,
        "slide_height_pt": 540,
        "slides": slides,
        "total_slides": slide_total,
        "status": "ready",
    }


def get_session_or_404(session_id: str, *, editor_session_cls):
    session = editor_session_cls.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found or expired")
    return session


def editor_asset_dir(*, config) -> Path:
    path = Path(config.PPT_RESULTS_FOLDER) / "editor_assets"
    path.mkdir(parents=True, exist_ok=True)
    return path


def resolve_editor_asset(asset_id: str, *, config) -> Path:
    safe_name = os.path.basename(asset_id)
    if not safe_name or safe_name != asset_id:
        raise HTTPException(status_code=400, detail="Invalid asset id")
    path = editor_asset_dir(config=config) / safe_name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Asset not found")
    return path
