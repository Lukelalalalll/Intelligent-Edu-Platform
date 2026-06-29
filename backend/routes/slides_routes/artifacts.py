from __future__ import annotations

import os
import re

from fastapi import APIRouter, Depends, HTTPException

from backend.config import Config
from backend.core.database import db
from backend.core.security import get_current_user
from backend.repositories import history_repo
from backend.services.files.file_artifact_service import build_file_response, find_first_existing_path, resolve_artifact_path

router = APIRouter()


def _current_user_id(user: dict) -> str:
    return str(user.get("id") or user.get("_id") or "").strip()


def _is_admin(user: dict) -> bool:
    return str(user.get("role") or "").strip().lower() == "admin"


def _safe_filename(filename: str) -> str:
    safe_name = os.path.basename(str(filename or "").strip())
    if not safe_name:
        raise HTTPException(status_code=404, detail="File not found")
    return safe_name


def _download_url_regex(path_prefix: str, filename: str) -> dict[str, str]:
    return {"$regex": re.escape(f"{path_prefix}/{filename}")}


async def _history_has_artifact(user_id: str, *, clauses: list[dict]) -> bool:
    doc = await history_repo.find_one(
        "sub1_generation_history",
        {
            "user_id": user_id,
            "deleted_at": {"$exists": False},
            "$or": clauses,
        },
        {"_id": 1},
    )
    return doc is not None


async def _task_tracker_has_artifact(user_id: str, *, clauses: list[dict]) -> bool:
    doc = await db["sub1_task_tracking"].find_one(
        {
            "user_id": user_id,
            "$or": clauses,
        },
        {"_id": 1},
    )
    return doc is not None


async def _checkpoint_has_artifact(user_id: str, *, clauses: list[dict]) -> bool:
    doc = await db["sub1_checkpoints"].find_one(
        {
            "user_id": user_id,
            "$or": clauses,
        },
        {"_id": 1},
    )
    return doc is not None


async def _user_owns_slide_artifact(user: dict, *, filename: str, artifact_kind: str) -> bool:
    if _is_admin(user):
        return True

    user_id = _current_user_id(user)
    if not user_id:
        return False

    safe_name = _safe_filename(filename)

    history_clauses: list[dict] = []
    tracker_clauses: list[dict] = []
    checkpoint_clauses: list[dict] = []

    if artifact_kind == "pptx":
        history_clauses = [
            {"source.result_artifacts.pptx_filename": safe_name},
            {"result_full": _download_url_regex("/api/slides/download_ppt", safe_name)},
        ]
        tracker_clauses = [
            {"result_metadata.filename": safe_name},
            {"result_metadata.pptx_download_url": _download_url_regex("/api/slides/download_ppt", safe_name)},
        ]
        checkpoint_clauses = [
            {"output.filename": safe_name},
            {"output.download_url": _download_url_regex("/api/sub1/download_ppt", safe_name)},
        ]
    elif artifact_kind == "html":
        history_clauses = [
            {"source.result_artifacts.html_preview_filename": safe_name},
            {"result_full": _download_url_regex("/api/slides/download_html", safe_name)},
        ]
        tracker_clauses = [
            {"result_metadata.html_preview_url": _download_url_regex("/api/slides/download_html", safe_name)},
        ]
    elif artifact_kind == "script":
        history_clauses = [
            {"source.result_artifacts.script_doc_filename": safe_name},
            {"source.result_artifacts.script_doc_download_url": _download_url_regex("/slides/download_script", safe_name)},
            {"result_full": _download_url_regex("/slides/download_script", safe_name)},
        ]
    elif artifact_kind == "source":
        history_clauses = [
            {"source.source_filename": safe_name},
            {"params.source_filename": safe_name},
        ]
        tracker_clauses = [
            {"result_metadata.source_filename": safe_name},
        ]
    elif artifact_kind == "combined":
        history_clauses = [
            {"source.combined_markdown_filename": safe_name},
            {"params.combined_markdown_filename": safe_name},
            {"params.filename": safe_name},
        ]
    else:
        return False

    if history_clauses and await _history_has_artifact(user_id, clauses=history_clauses):
        return True
    if tracker_clauses and await _task_tracker_has_artifact(user_id, clauses=tracker_clauses):
        return True
    if checkpoint_clauses and await _checkpoint_has_artifact(user_id, clauses=checkpoint_clauses):
        return True
    return False


async def _assert_user_can_access_slide_artifact(user: dict, *, filename: str, artifact_kind: str) -> str:
    safe_name = _safe_filename(filename)
    if not await _user_owns_slide_artifact(user, filename=safe_name, artifact_kind=artifact_kind):
        raise HTTPException(status_code=404, detail="File not found")
    return safe_name


@router.get("/download_ppt/{filename}")
async def download_ppt(filename: str, user: dict = Depends(get_current_user)):
    safe_name = await _assert_user_can_access_slide_artifact(user, filename=filename, artifact_kind="pptx")
    path = find_first_existing_path(
        safe_name,
        [Config.PPT_RESULTS_FOLDER, os.path.join(Config.PPT_RESULTS_FOLDER, "sub1")],
    )
    if path is None:
        raise HTTPException(status_code=404, detail="File not found")
    return build_file_response(
        path,
        filename=safe_name,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
    )


@router.get("/download/{filename}")
async def download_combined(filename: str, user: dict = Depends(get_current_user)):
    safe_name = await _assert_user_can_access_slide_artifact(user, filename=filename, artifact_kind="combined")
    path = find_first_existing_path(safe_name, [Config.SUB1_MD_FOLDER, Config.MARKDOWN_FOLDER])
    if path is None:
        raise HTTPException(status_code=404, detail="File not found")
    return build_file_response(path)


@router.get("/download_source/{filename}")
async def download_source(filename: str, user: dict = Depends(get_current_user)):
    safe_name = await _assert_user_can_access_slide_artifact(user, filename=filename, artifact_kind="source")
    path = resolve_artifact_path(safe_name, Config.SUB1_UPLOAD_FOLDER)
    return build_file_response(path)


@router.get("/download_script/{filename}")
async def download_script(filename: str, user: dict = Depends(get_current_user)):
    safe_name = await _assert_user_can_access_slide_artifact(user, filename=filename, artifact_kind="script")
    path = resolve_artifact_path(safe_name, Config.SCRIPT_RESULTS_FOLDER)
    return build_file_response(
        path,
        filename=safe_name,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@router.get("/download_html/{filename}")
async def download_html(filename: str, user: dict = Depends(get_current_user)):
    safe_name = await _assert_user_can_access_slide_artifact(user, filename=filename, artifact_kind="html")
    path = resolve_artifact_path(safe_name, Config.PPT_RESULTS_FOLDER)
    return build_file_response(path, filename=safe_name, media_type="text/html")
