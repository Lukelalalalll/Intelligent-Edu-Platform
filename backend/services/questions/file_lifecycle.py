"""Upload persistence and cleanup for sub2."""

from __future__ import annotations

import os
import time
import uuid
from typing import Any

import PyPDF2
from fastapi import UploadFile
from werkzeug.utils import secure_filename

from backend.config import Config


def cleanup_old_files() -> None:
    """Remove generated/cache/screenshot files that exceeded their TTL."""
    import logging

    logger = logging.getLogger("sub2.cleanup")
    default_ttl_seconds = Config.SUB2_FILE_TTL_HOURS * 3600
    upload_ttl_seconds = Config.SUB2_UPLOAD_FILE_TTL_HOURS * 3600
    now = time.time()
    cleaned = 0
    ttl_by_folder = {
        Config.GENERATED_FOLDER_SUB2: default_ttl_seconds,
        Config.SCREENSHOTS_FOLDER_SUB2: default_ttl_seconds,
        Config.UPLOAD_FOLDER_SUB2: upload_ttl_seconds,
    }

    for folder, ttl_seconds in ttl_by_folder.items():
        if not os.path.isdir(folder):
            continue
        for fname in os.listdir(folder):
            fpath = os.path.join(folder, fname)
            if not os.path.isfile(fpath):
                continue
            try:
                age = now - os.path.getmtime(fpath)
                if age > ttl_seconds:
                    os.remove(fpath)
                    cleaned += 1
            except OSError:
                continue

    if cleaned:
        logger.info(
            "Sub2 cleanup: removed %d files (temp TTL=%dh, upload TTL=%dh)",
            cleaned,
            Config.SUB2_FILE_TTL_HOURS,
            Config.SUB2_UPLOAD_FILE_TTL_HOURS,
        )


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in Config.ALLOWED_EXTENSIONS_SUB2


def _prepare_storage_filename(filename: str) -> tuple[str, str, str]:
    display_filename = secure_filename(filename or "")
    if not display_filename:
        raise ValueError("Invalid filename")
    if not allowed_file(display_filename):
        raise ValueError("File type not allowed")

    stem, ext = os.path.splitext(display_filename)
    storage_filename = f"{uuid.uuid4().hex[:12]}_{stem}{ext.lower()}"
    os.makedirs(Config.UPLOAD_FOLDER_SUB2, exist_ok=True)
    filepath = os.path.join(Config.UPLOAD_FOLDER_SUB2, storage_filename)
    return display_filename, storage_filename, filepath


def _finalize_saved_upload(*, filepath: str, display_filename: str, storage_filename: str) -> dict[str, Any]:
    total_pages = 0
    file_type = "image"
    if storage_filename.lower().endswith(".pdf"):
        with open(filepath, "rb") as handle:
            reader = PyPDF2.PdfReader(handle)
            total_pages = len(reader.pages)
        if total_pages > 200:
            os.remove(filepath)
            raise ValueError("PDF exceeds 200-page limit")
        file_type = "pdf"

    return {
        "task_id": uuid.uuid4().hex[:12],
        "uploaded_file": filepath,
        "uploaded_filename": display_filename,
        "uploaded_storage_name": storage_filename,
        "file_type": file_type,
        "total_pages": total_pages,
    }


async def save_upload_file(file: UploadFile) -> dict[str, Any]:
    if not file.filename:
        raise ValueError("Empty filename")

    display_filename, storage_filename, filepath = _prepare_storage_filename(file.filename)
    max_upload_size = Config.MAX_CONTENT_LENGTH
    total_written = 0

    try:
        with open(filepath, "wb") as buffer:
            while True:
                chunk = await file.read(1024 * 256)
                if not chunk:
                    break
                total_written += len(chunk)
                if total_written > max_upload_size:
                    buffer.close()
                    os.remove(filepath)
                    raise ValueError(f"File too large (max {max_upload_size // (1024 * 1024)}MB)")
                buffer.write(chunk)
    except Exception:
        if os.path.exists(filepath):
            try:
                os.remove(filepath)
            except OSError:
                pass
        raise

    return _finalize_saved_upload(
        filepath=filepath,
        display_filename=display_filename,
        storage_filename=storage_filename,
    )


def save_upload(filename: str, content: bytes, ext: str | None = None) -> dict[str, Any]:
    display_name = filename
    if ext and "." not in display_name:
        display_name = f"{display_name}.{ext}"

    display_filename, storage_filename, filepath = _prepare_storage_filename(display_name)
    max_upload_size = Config.MAX_CONTENT_LENGTH
    if len(content) > max_upload_size:
        raise ValueError(f"File too large (max {max_upload_size // (1024 * 1024)}MB)")

    try:
        with open(filepath, "wb") as handle:
            handle.write(content)
    except Exception:
        if os.path.exists(filepath):
            try:
                os.remove(filepath)
            except OSError:
                pass
        raise

    return _finalize_saved_upload(
        filepath=filepath,
        display_filename=display_filename,
        storage_filename=storage_filename,
    )


def get_file_info(file_path: str) -> dict[str, Any]:
    exists = os.path.exists(file_path)
    info: dict[str, Any] = {
        "path": file_path,
        "exists": exists,
        "size": os.path.getsize(file_path) if exists else 0,
        "filename": os.path.basename(file_path),
        "file_type": "pdf" if str(file_path).lower().endswith(".pdf") else "image",
    }
    if exists and info["file_type"] == "pdf":
        with open(file_path, "rb") as handle:
            info["total_pages"] = len(PyPDF2.PdfReader(handle).pages)
    else:
        info["total_pages"] = 0
    return info
