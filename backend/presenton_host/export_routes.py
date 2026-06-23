from __future__ import annotations

import mimetypes
import uuid
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from .auth_bridge import get_presenton_current_user, resolve_request_public_origin
from .bootstrap import ensure_presenton_ready, load_presenton_runtime

export_router = APIRouter()


class PresentonAppExportRequest(BaseModel):
    id: str
    title: str | None = None
    format: str


async def get_presenton_async_session():
    runtime = load_presenton_runtime()
    async for session in runtime.get_async_session():
        yield session


def content_disposition(filename: str) -> str:
    fallback = "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in filename) or "download"
    return f'attachment; filename="{fallback}"; ' f"filename*=UTF-8''{quote(filename)}"


def get_safe_export_file_path(name: str) -> Path:
    file_name = name.strip()
    if not file_name:
        raise HTTPException(status_code=400, detail="Invalid export file name")
    if Path(file_name).name != file_name or "/" in file_name or "\\" in file_name:
        raise HTTPException(status_code=400, detail="Invalid export file name")
    runtime = load_presenton_runtime()
    exports_dir = Path(runtime.get_exports_directory()).resolve()
    candidate = (exports_dir / file_name).resolve()
    try:
        candidate.relative_to(exports_dir)
    except ValueError as exc:
        raise HTTPException(status_code=403, detail="Access denied") from exc
    return candidate


@export_router.post("/api/v1/app/export")
async def presenton_export(request: Request, body: PresentonAppExportRequest, _current_user: dict = Depends(get_presenton_current_user)):
    await ensure_presenton_ready()
    export_format = (body.format or "").strip().lower()
    if export_format not in {"pdf", "pptx"}:
        raise HTTPException(status_code=400, detail="Invalid export format")
    public_origin = resolve_request_public_origin(request)
    runtime = load_presenton_runtime()
    try:
        presentation_and_path = await runtime.export_presentation(
            uuid.UUID(body.id),
            (body.title or "").strip() or "presentation",
            export_format,
            cookie_header=request.headers.get("cookie") or None,
            web_origin=public_origin,
            fastapi_url=public_origin,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid presentation id") from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Export failed: {exc}") from exc
    output_path = Path(presentation_and_path.path).resolve()
    exports_dir = Path(runtime.get_exports_directory()).resolve()
    try:
        relative_path = output_path.relative_to(exports_dir)
    except ValueError as exc:
        raise HTTPException(
            status_code=500,
            detail="Export finished outside the configured exports directory",
        ) from exc
    return {
        "success": True,
        "downloadUrl": f"/api/v1/app/export/file?name={quote(relative_path.name)}",
        "path": f"/app_data/exports/{relative_path.as_posix()}",
        "presentationId": body.id,
    }


@export_router.get("/api/v1/app/export/file")
async def presenton_export_file(name: str = Query(...), _current_user: dict = Depends(get_presenton_current_user)):
    await ensure_presenton_ready()
    file_path = get_safe_export_file_path(name)
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Export file not found")
    media_type, _ = mimetypes.guess_type(file_path.name)
    return FileResponse(
        path=file_path,
        media_type=media_type or "application/octet-stream",
        headers={
            "Cache-Control": "no-store",
            "Content-Disposition": content_disposition(file_path.name),
        },
    )


@export_router.post("/api/v1/app/read-file")
async def presenton_read_file(body: dict = Body(...), _current_user: dict = Depends(get_presenton_current_user)):
    await ensure_presenton_ready()
    file_path = body.get("filePath")
    if not isinstance(file_path, str) or not file_path.strip():
        raise HTTPException(status_code=400, detail="Invalid file path")
    runtime = load_presenton_runtime()
    try:
        content = runtime.TEMP_FILE_SERVICE.read_temp_file(file_path, binary=False)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to read file") from exc
    return {"content": content}


@export_router.get("/api/export-presentation-data/{presentation_id}")
async def presenton_export_presentation_data(
    presentation_id: uuid.UUID,
    sql_session: AsyncSession = Depends(get_presenton_async_session),
    _current_user: dict = Depends(get_presenton_current_user),
):
    await ensure_presenton_ready()
    runtime = load_presenton_runtime()
    presentation = await sql_session.get(runtime.PresentationModel, presentation_id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")
    slides_result = await sql_session.scalars(
        select(runtime.SlideModel)
        .where(runtime.SlideModel.presentation == presentation_id)
        .order_by(runtime.SlideModel.index)
    )
    slides = list(slides_result)
    fonts = await runtime._resolve_presentation_fonts(presentation, slides, sql_session)
    return runtime.PresentationWithSlides(**presentation.model_dump(), slides=slides, fonts=fonts)
