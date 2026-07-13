from __future__ import annotations

import os
import tempfile
import zipfile

from fastapi import HTTPException, UploadFile

from constants.documents import POWERPOINT_TYPES


def create_temp_dir():
    return tempfile.TemporaryDirectory()


def validate_pptx_upload(pptx_file: UploadFile, *, enforce_size_limit: bool = False) -> None:
    if pptx_file.content_type not in POWERPOINT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Expected PPTX file, got {pptx_file.content_type}",
        )
    if (
        enforce_size_limit
        and hasattr(pptx_file, "size")
        and pptx_file.size
        and pptx_file.size > (100 * 1024 * 1024)
    ):
        raise HTTPException(
            status_code=400,
            detail="PPTX file exceeded max upload size of 100 MB",
        )


async def save_upload_to_temp(
    pptx_file: UploadFile,
    temp_dir: str,
    *,
    filename: str = "presentation.pptx",
) -> str:
    pptx_path = os.path.join(temp_dir, filename)
    with open(pptx_path, "wb") as file_obj:
        pptx_content = await pptx_file.read()
        file_obj.write(pptx_content)
    return pptx_path


async def save_fonts(fonts: list[UploadFile], temp_dir: str) -> list[str]:
    fonts_dir = os.path.join(temp_dir, "fonts")
    os.makedirs(fonts_dir, exist_ok=True)
    font_paths: list[str] = []
    for font_file in fonts:
        font_path = os.path.join(fonts_dir, font_file.filename)
        with open(font_path, "wb") as file_obj:
            font_content = await font_file.read()
            file_obj.write(font_content)
        font_paths.append(font_path)
    return font_paths


def extract_slide_xmls(pptx_path: str, temp_dir: str) -> list[str]:
    slide_xmls: list[str] = []
    extract_dir = os.path.join(temp_dir, "pptx_extract")
    try:
        with zipfile.ZipFile(pptx_path, "r") as zip_ref:
            zip_ref.extractall(extract_dir)

        slides_dir = os.path.join(extract_dir, "ppt", "slides")
        if not os.path.exists(slides_dir):
            raise Exception("No slides directory found in PPTX file")

        slide_files = [
            filename
            for filename in os.listdir(slides_dir)
            if filename.startswith("slide") and filename.endswith(".xml")
        ]
        slide_files.sort(key=lambda name: int(name.replace("slide", "").replace(".xml", "")))
        for slide_file in slide_files:
            slide_path = os.path.join(slides_dir, slide_file)
            with open(slide_path, "r", encoding="utf-8") as file_obj:
                slide_xmls.append(file_obj.read())
        return slide_xmls
    except Exception as exc:
        raise Exception(f"Failed to extract slide XMLs: {exc}")
