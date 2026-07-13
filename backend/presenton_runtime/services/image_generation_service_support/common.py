import base64
import os
import uuid
from urllib.parse import urlparse

from models.sql.image_asset import ImageAsset
from utils.asset_directory_utils import absolute_fastapi_asset_url
from utils.image_generation_error import normalize_image_generation_error
from utils.image_provider import (
    is_comfyui_selected,
    is_dalle3_selected,
    is_gemini_flash_selected,
    is_gpt_image_1_5_selected,
    is_nanobanana_pro_selected,
    is_open_webui_selected,
    is_openai_compatible_selected,
    is_pixels_selected,
    is_pixabay_selected,
)


def select_image_generation_method(service):
    if service.is_image_generation_disabled:
        return None

    if is_pixabay_selected():
        return service.get_image_from_pixabay
    if is_pixels_selected():
        return service.get_image_from_pexels
    if is_gemini_flash_selected():
        return service.generate_image_gemini_flash
    if is_nanobanana_pro_selected():
        return service.generate_image_nanobanana_pro
    if is_dalle3_selected():
        return service.generate_image_openai_dalle3
    if is_gpt_image_1_5_selected():
        return service.generate_image_openai_gpt_image_1_5
    if is_comfyui_selected():
        return service.generate_image_comfyui
    if is_open_webui_selected():
        return service.generate_image_open_webui
    if is_openai_compatible_selected():
        return service.generate_image_openai_compatible
    return None


def is_stock_provider_selected() -> bool:
    return is_pixels_selected() or is_pixabay_selected()


def placeholder_image_url() -> str:
    return absolute_fastapi_asset_url("/static/images/placeholder.jpg")


def resolve_generated_image_result(image_path: str, *, prompt_text: str, theme_prompt: str):
    if image_path.startswith("http"):
        return image_path
    if os.path.exists(image_path):
        return ImageAsset(
            path=image_path,
            is_uploaded=False,
            extras={
                "prompt": prompt_text,
                "theme_prompt": theme_prompt,
            },
        )
    if image_path.startswith("/app_data/") or image_path.startswith("/static/"):
        return absolute_fastapi_asset_url(image_path)
    raise Exception(f"Image not found at {image_path}")


def normalize_generation_exception(error: Exception) -> Exception:
    normalized = normalize_image_generation_error(error)
    return normalized


def save_base64_image(output_directory: str, payload: str, extension: str = "png") -> str:
    image_path = os.path.join(output_directory, f"{uuid.uuid4()}.{extension}")
    with open(image_path, "wb") as file:
        file.write(base64.b64decode(payload))
    return image_path


def save_image_bytes(output_directory: str, payload: bytes, extension: str = "png") -> str:
    image_path = os.path.join(output_directory, f"{uuid.uuid4()}.{extension}")
    with open(image_path, "wb") as file:
        file.write(payload)
    return image_path


def origin_from_base_url(base_url: str) -> str:
    parsed = urlparse(base_url)
    return f"{parsed.scheme}://{parsed.netloc}"


__all__ = [
    "is_stock_provider_selected",
    "normalize_generation_exception",
    "origin_from_base_url",
    "placeholder_image_url",
    "resolve_generated_image_result",
    "save_base64_image",
    "save_image_bytes",
    "select_image_generation_method",
]
