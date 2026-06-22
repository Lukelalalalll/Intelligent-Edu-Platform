from __future__ import annotations

import os

from fastapi import Depends, HTTPException

from backend.config import Config
from backend.core.security import get_current_user
from backend.services.file_artifact_service import build_file_response, find_first_existing_path, resolve_artifact_path

from .router import slides_router


@slides_router.get("/download_ppt/{filename}")
def download_ppt(filename: str):
    path = find_first_existing_path(
        filename,
        [Config.PPT_RESULTS_FOLDER, os.path.join(Config.PPT_RESULTS_FOLDER, "sub1")],
    )
    if path is None:
        raise HTTPException(status_code=404, detail="File not found")
    return build_file_response(
        path,
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
    )


@slides_router.get("/download/{filename}")
def download_combined(filename: str, user: dict = Depends(get_current_user)):
    path = find_first_existing_path(filename, [Config.SUB1_MD_FOLDER, Config.MARKDOWN_FOLDER])
    if path is None:
        raise HTTPException(status_code=404, detail="File not found")
    return build_file_response(path)


@slides_router.get("/download_source/{filename}")
def download_source(filename: str, user: dict = Depends(get_current_user)):
    path = resolve_artifact_path(filename, Config.SUB1_UPLOAD_FOLDER)
    return build_file_response(path)


@slides_router.get("/download_script/{filename}")
def download_script(filename: str, user: dict = Depends(get_current_user)):
    path = resolve_artifact_path(filename, Config.SCRIPT_RESULTS_FOLDER)
    return build_file_response(
        path,
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@slides_router.get("/download_html/{filename}")
def download_html(filename: str):
    path = resolve_artifact_path(filename, Config.PPT_RESULTS_FOLDER)
    return build_file_response(path, filename=filename, media_type="text/html")
