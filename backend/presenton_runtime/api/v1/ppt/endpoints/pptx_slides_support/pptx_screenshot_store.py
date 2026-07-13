from __future__ import annotations

import os
import shutil
import uuid

from api.v1.ppt.endpoints.pptx_slides_support.pptx_font_analysis import (
    normalized_fonts_for_slide,
)
from api.v1.ppt.endpoints.pptx_slides_support.pptx_slide_models import SlideData
from fastapi import HTTPException
from utils.asset_directory_utils import absolute_fastapi_asset_url, get_images_directory


def persist_slide_screenshots(
    slide_xmls: list[str],
    screenshot_paths: list[str],
) -> list[SlideData]:
    if len(screenshot_paths) != len(slide_xmls):
        raise HTTPException(
            status_code=500,
            detail=(
                "PPTX preview renderer returned an unexpected slide count: "
                f"expected {len(slide_xmls)}, got {len(screenshot_paths)}"
            ),
        )

    images_dir = get_images_directory()
    presentation_id = uuid.uuid4()
    presentation_images_dir = os.path.join(images_dir, str(presentation_id))
    os.makedirs(presentation_images_dir, exist_ok=True)

    slides_data: list[SlideData] = []
    for index, (xml_content, screenshot_path) in enumerate(
        zip(slide_xmls, screenshot_paths),
        start=1,
    ):
        screenshot_filename = f"slide_{index}.png"
        permanent_screenshot_path = os.path.join(
            presentation_images_dir,
            screenshot_filename,
        )
        if os.path.exists(screenshot_path) and os.path.getsize(screenshot_path) > 0:
            shutil.copy2(screenshot_path, permanent_screenshot_path)
            screenshot_url = absolute_fastapi_asset_url(
                f"/app_data/images/{presentation_id}/{screenshot_filename}"
            )
        else:
            screenshot_url = absolute_fastapi_asset_url(
                "/static/images/replaceable_template_image.png"
            )

        slides_data.append(
            SlideData(
                slide_number=index,
                screenshot_url=screenshot_url,
                xml_content=xml_content,
                normalized_fonts=normalized_fonts_for_slide(xml_content),
            )
        )
    return slides_data
