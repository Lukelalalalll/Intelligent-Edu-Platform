from __future__ import annotations

import asyncio
import sys
import types
from pathlib import Path

import pytest
from fastapi import HTTPException

_PRESENTON_RUNTIME_ROOT = Path(__file__).resolve().parents[1] / "presenton_runtime"
if str(_PRESENTON_RUNTIME_ROOT) not in sys.path:
    sys.path.insert(0, str(_PRESENTON_RUNTIME_ROOT))

from backend.presenton_runtime.templates.fonts_and_slides_preview_support.font_mapping import (
    build_modified_pptx_filename,
)
from backend.presenton_runtime.templates.fonts_and_slides_preview_support.models import (
    FontsUploadAndSlidesPreviewResponse,
)
from backend.presenton_runtime.templates.fonts_and_slides_preview_support.rendering import (
    render_pptx_slides_to_images,
)
from backend.presenton_runtime.templates.fonts_and_slides_preview_support.workflow import (
    check_fonts_in_pptx_handler,
)
from backend.presenton_runtime.templates.preview import (
    upload_fonts_and_slides_preview_handler,
)


class _FakeUploadFile:
    def __init__(self, filename: str, content: bytes = b"") -> None:
        self.filename = filename
        self._content = content

    async def read(self) -> bytes:
        return self._content


def test_check_fonts_in_pptx_handler_rejects_non_pptx():
    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(check_fonts_in_pptx_handler(_FakeUploadFile("notes.txt")))

    assert excinfo.value.status_code == 400
    assert excinfo.value.detail == "Invalid file type. Expected PPTX file"


@pytest.mark.parametrize(
    ("original_filename", "expected_filename"),
    [
        ("deck.pptx", "deck-modified.pptx"),
        ("deck-modified.pptx", "deck-modified.pptx"),
        ("deck_modified.pptx", "deck-modified.pptx"),
        ("deck modified.pptx", "deck-modified.pptx"),
    ],
)
def test_build_modified_pptx_filename_preserves_existing_suffix_semantics(
    original_filename: str,
    expected_filename: str,
):
    assert build_modified_pptx_filename(original_filename) == expected_filename


def test_render_pptx_slides_to_images_orchestrates_export_task_service(monkeypatch):
    calls: dict[str, object] = {}

    async def fake_convert_pptx_to_html(path: str, get_fonts: bool):
        calls["convert"] = (path, get_fonts)
        return types.SimpleNamespace(
            slides=["<div>1</div>", "<div>2</div>", "<div>3</div>"],
            width=1024,
            height=576,
            font_css="body { font-family: Demo; }",
        )

    async def fake_render_htmls_to_images(*, htmls, width: int, height: int):
        calls["render"] = (list(htmls), width, height)
        return types.SimpleNamespace(paths=["slide-1.png", "slide-2.png"])

    monkeypatch.setattr(
        "backend.presenton_runtime.templates.fonts_and_slides_preview_support.rendering.EXPORT_TASK_SERVICE",
        types.SimpleNamespace(
            convert_pptx_to_html=fake_convert_pptx_to_html,
            render_htmls_to_images=fake_render_htmls_to_images,
        ),
    )

    result = asyncio.run(
        render_pptx_slides_to_images(
            modified_pptx_path="deck.pptx",
            font_paths_for_install=[],
            max_slides=2,
            logger=types.SimpleNamespace(info=lambda message: None),
        )
    )

    assert result == ["slide-1.png", "slide-2.png"]
    assert calls["convert"] == ("deck.pptx", True)
    rendered_htmls, width, height = calls["render"]
    assert len(rendered_htmls) == 2
    assert width == 1024
    assert height == 576


def test_preview_wrapper_defaults_max_slides_to_25(monkeypatch):
    captured: dict[str, object] = {}

    async def fake_upload_fonts_and_preview_handler(**kwargs):
        captured.update(kwargs)
        return FontsUploadAndSlidesPreviewResponse(
            slide_image_urls=[],
            pptx_url="/app_data/deck.pptx",
            modified_pptx_url="/app_data/deck.pptx",
            fonts={},
        )

    monkeypatch.setattr(
        "backend.presenton_runtime.templates.preview.upload_fonts_and_preview_handler",
        fake_upload_fonts_and_preview_handler,
    )

    result = asyncio.run(
        upload_fonts_and_slides_preview_handler(
            pptx_file=_FakeUploadFile("deck.pptx"),
            font_files=None,
            original_font_names=None,
        )
    )

    assert isinstance(result, FontsUploadAndSlidesPreviewResponse)
    assert captured["max_slides"] == 25
