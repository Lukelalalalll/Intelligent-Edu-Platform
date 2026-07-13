from __future__ import annotations

import os

import aiohttp
from fastapi import HTTPException

from utils.asset_directory_utils import resolve_image_path_to_filesystem


async def _download_image_bytes(image_url: str) -> bytes:
    async with aiohttp.ClientSession() as session:
        async with session.get(image_url) as response:
            if response.status != 200:
                raise HTTPException(
                    status_code=400,
                    detail=f"Failed to download slide image: {image_url}",
                )
            return await response.read()


async def _read_image_bytes_and_media_type(image_url: str) -> tuple[bytes, str]:
    actual_image_path = resolve_image_path_to_filesystem(image_url)
    if actual_image_path and os.path.isfile(actual_image_path):
        with open(actual_image_path, "rb") as image_file:
            image_bytes = image_file.read()
        file_extension = os.path.splitext(actual_image_path)[1].lower()
    else:
        image_bytes = await _download_image_bytes(image_url)
        file_extension = os.path.splitext(image_url)[1].lower()

    media_type_map = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
    }
    return image_bytes, media_type_map.get(file_extension, "image/png")
