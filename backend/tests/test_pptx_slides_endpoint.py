from __future__ import annotations

import asyncio
import sys
import zipfile
from pathlib import Path

import pytest
from fastapi import HTTPException

_PRESENTON_RUNTIME_ROOT = Path(__file__).resolve().parents[1] / "presenton_runtime"
if str(_PRESENTON_RUNTIME_ROOT) not in sys.path:
    sys.path.insert(0, str(_PRESENTON_RUNTIME_ROOT))

from api.v1.ppt.endpoints.pptx_slides import process_pptx_fonts, process_pptx_slides
from api.v1.ppt.endpoints.pptx_slides_support.pptx_archive_utils import (
    extract_slide_xmls,
    validate_pptx_upload,
)
from api.v1.ppt.endpoints.pptx_slides_support.pptx_screenshot_store import (
    persist_slide_screenshots,
)
from api.v1.ppt.endpoints.pptx_slides_support.pptx_slide_models import (
    FontAnalysisResult,
    PptxFontsResponse,
    PptxSlidesResponse,
    SlideData,
)


class _FakeUpload:
    def __init__(self, *, content_type: str, payload: bytes = b"pptx", size: int | None = None):
        self.content_type = content_type
        self._payload = payload
        self.size = size if size is not None else len(payload)
        self.filename = "deck.pptx"

    async def read(self):
        return self._payload


def test_validate_pptx_upload_rejects_non_pptx():
    with pytest.raises(HTTPException) as exc_info:
        validate_pptx_upload(_FakeUpload(content_type="application/pdf"))

    assert exc_info.value.status_code == 400
    assert "Expected PPTX file" in exc_info.value.detail


def test_extract_slide_xmls_reads_slides_in_numeric_order(tmp_path):
    pptx_path = tmp_path / "deck.pptx"
    with zipfile.ZipFile(pptx_path, "w") as archive:
        archive.writestr("ppt/slides/slide10.xml", "<slide>10</slide>")
        archive.writestr("ppt/slides/slide2.xml", "<slide>2</slide>")
        archive.writestr("ppt/slides/slide1.xml", "<slide>1</slide>")

    slide_xmls = extract_slide_xmls(str(pptx_path), str(tmp_path))

    assert slide_xmls == ["<slide>1</slide>", "<slide>2</slide>", "<slide>10</slide>"]


def test_persist_slide_screenshots_rejects_count_mismatch():
    with pytest.raises(HTTPException) as exc_info:
        persist_slide_screenshots(["<slide/>"], [])

    assert exc_info.value.status_code == 500
    assert "unexpected slide count" in exc_info.value.detail


def test_persist_slide_screenshots_handles_success_and_fallback(monkeypatch, tmp_path):
    good_path = tmp_path / "good.png"
    good_path.write_bytes(b"png")
    missing_path = tmp_path / "missing.png"
    images_dir = tmp_path / "images"
    images_dir.mkdir()

    monkeypatch.setattr(
        "api.v1.ppt.endpoints.pptx_slides_support.pptx_screenshot_store.get_images_directory",
        lambda: str(images_dir),
    )
    monkeypatch.setattr(
        "api.v1.ppt.endpoints.pptx_slides_support.pptx_screenshot_store.absolute_fastapi_asset_url",
        lambda path: f"http://testserver{path}",
    )

    slides = persist_slide_screenshots(
        [
            (
                "<slide xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\">"
                "<a:rPr><a:latin typeface=\"Inter\"/></a:rPr></slide>"
            ),
            "<slide/>",
        ],
        [str(good_path), str(missing_path)],
    )

    assert slides[0].screenshot_url.startswith("http://testserver/app_data/images/")
    assert slides[0].normalized_fonts == ["Inter"]
    assert slides[1].screenshot_url == "http://testserver/static/images/replaceable_template_image.png"


def test_pptx_endpoints_keep_response_shapes(monkeypatch):
    async def fake_slides_request(_pptx_file, _fonts):
        return PptxSlidesResponse(
            success=True,
            slides=[
                SlideData(
                    slide_number=1,
                    screenshot_url="http://testserver/slide.png",
                    xml_content="<slide/>",
                    normalized_fonts=["Inter"],
                )
            ],
            total_slides=1,
            fonts=FontAnalysisResult(
                internally_supported_fonts=[{"name": "Inter", "google_fonts_url": "https://fonts"}],
                not_supported_fonts=[],
            ),
        )

    async def fake_fonts_request(_pptx_file):
        return PptxFontsResponse(
            success=True,
            fonts=FontAnalysisResult(
                internally_supported_fonts=[],
                not_supported_fonts=[],
            ),
        )

    monkeypatch.setattr(
        "api.v1.ppt.endpoints.pptx_slides.process_pptx_slides_request",
        fake_slides_request,
    )
    monkeypatch.setattr(
        "api.v1.ppt.endpoints.pptx_slides.process_pptx_fonts_request",
        fake_fonts_request,
    )

    slides_response = asyncio.run(process_pptx_slides(object(), None))
    fonts_response = asyncio.run(process_pptx_fonts(object()))

    assert slides_response.model_dump()["slides"][0]["normalized_fonts"] == ["Inter"]
    assert slides_response.model_dump()["total_slides"] == 1
    assert fonts_response.model_dump() == {
        "success": True,
        "fonts": {
            "internally_supported_fonts": [],
            "not_supported_fonts": [],
        },
    }
