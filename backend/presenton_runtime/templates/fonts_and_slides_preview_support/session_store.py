from __future__ import annotations

import asyncio
import os
import shutil
import uuid
from typing import List, Tuple

try:
    from utils.asset_directory_utils import absolute_fastapi_asset_url
    from utils.get_env import get_app_data_directory_env
except ModuleNotFoundError:  # pragma: no cover - backend test import path
    from backend.presenton_runtime.utils.asset_directory_utils import (
        absolute_fastapi_asset_url,
    )
    from backend.presenton_runtime.utils.get_env import get_app_data_directory_env


def write_bytes_to_path(path: str, data: bytes) -> None:
    with open(path, "wb") as file:
        file.write(data)


def app_data_directory() -> str:
    app_data_dir = get_app_data_directory_env() or "/tmp/presenton"
    os.makedirs(app_data_dir, exist_ok=True)
    return app_data_dir


def get_fonts_directory() -> str:
    fonts_dir = os.path.join(app_data_directory(), "fonts")
    os.makedirs(fonts_dir, exist_ok=True)
    return fonts_dir


def get_template_preview_session_dir(session_id: uuid.UUID) -> str:
    session_dir = os.path.join(app_data_directory(), "uploads", "template-previews", str(session_id))
    os.makedirs(session_dir, exist_ok=True)
    return session_dir


async def persist_files_to_session(pairs: List[Tuple[str, str]]) -> List[str]:
    if not pairs:
        return []

    async def copy_pair(dest_path: str, src_path: str) -> str:
        await asyncio.to_thread(os.makedirs, os.path.dirname(dest_path), exist_ok=True)
        await asyncio.to_thread(shutil.copy2, src_path, dest_path)
        return dest_path

    return list(await asyncio.gather(*[copy_pair(dest, src) for dest, src in pairs]))


def public_urls_for_local_paths(paths: List[str]) -> List[str]:
    if not paths:
        return []
    app_data = app_data_directory()
    urls: List[str] = []
    for path in paths:
        rel = os.path.relpath(os.path.abspath(path), os.path.abspath(app_data)).replace("\\", "/")
        urls.append(absolute_fastapi_asset_url(f"/app_data/{rel}"))
    return urls
