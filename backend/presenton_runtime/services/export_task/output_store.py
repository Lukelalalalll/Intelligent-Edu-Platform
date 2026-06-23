from __future__ import annotations

import os
import shutil
import tempfile
import uuid

from fastapi import HTTPException

from utils.asset_directory_utils import get_exports_directory, resolve_app_path_to_filesystem
from utils.get_env import get_temp_directory_env

EXPORT_DIRECTORY_MODE = 0o755
EXPORT_FILE_MODE = 0o644


def resolve_output_path(response_data: dict) -> str:
    for path_key in ("path", "file_path"):
        path_value = response_data.get(path_key)
        if isinstance(path_value, str):
            resolved = resolve_app_path_to_filesystem(path_value) or path_value
            if os.path.isfile(resolved):
                return resolved

    url_value = response_data.get("url")
    if isinstance(url_value, str):
        resolved = resolve_app_path_to_filesystem(url_value)
        if resolved and os.path.isfile(resolved):
            return resolved
    raise HTTPException(status_code=500, detail="PPTX-to-HTML task completed without a valid output path")


def ensure_output_readable(output_path: str) -> None:
    try:
        os.chmod(os.path.dirname(output_path), EXPORT_DIRECTORY_MODE)
        os.chmod(output_path, EXPORT_FILE_MODE)
    except OSError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Export completed but output permissions could not be updated: {exc}",
        ) from exc


def is_within_directory(file_path: str, directory: str) -> bool:
    try:
        common = os.path.commonpath([os.path.abspath(file_path), os.path.abspath(directory)])
    except ValueError:
        return False
    return os.path.normcase(common) == os.path.normcase(os.path.abspath(directory))


def persist_export_output(output_path: str) -> str:
    exports_directory = get_exports_directory()
    resolved_output_path = os.path.abspath(output_path)
    if is_within_directory(resolved_output_path, exports_directory):
        return resolved_output_path

    filename = os.path.basename(resolved_output_path) or "presentation"
    stem, ext = os.path.splitext(filename)
    candidate_path = os.path.join(exports_directory, filename)
    while os.path.exists(candidate_path):
        try:
            if os.path.samefile(candidate_path, resolved_output_path):
                return os.path.abspath(candidate_path)
        except OSError:
            pass
        candidate_path = os.path.join(exports_directory, f"{stem}-{uuid.uuid4().hex[:8]}{ext}")
    try:
        shutil.move(resolved_output_path, candidate_path)
    except OSError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Export completed but the output file could not be finalized: {exc}",
        ) from exc
    return os.path.abspath(candidate_path)


def persist_temp_export_response(response_data: dict, temp_dir: str) -> dict:
    output_path = resolve_output_path(response_data)
    if not is_within_directory(output_path, temp_dir):
        return response_data
    return {"path": persist_export_output(output_path)}


def create_task_paths() -> tuple[str, str, str]:
    temp_root = get_temp_directory_env() or os.path.join(tempfile.gettempdir(), "presenton")
    os.makedirs(temp_root, exist_ok=True)
    temp_dir = tempfile.mkdtemp(prefix="export-task-", dir=temp_root)
    task_path = os.path.join(temp_dir, "export_task.json")
    response_path = os.path.join(temp_dir, "export_task.response.json")
    return temp_dir, task_path, response_path
