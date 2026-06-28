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
from backend.presenton_runtime.templates.fonts_and_slides_preview_support import workflow as preview_workflow
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


def test_render_pptx_slides_to_images_retries_without_runtime_font_extraction(monkeypatch):
    calls: list[tuple[str, bool]] = []

    async def fake_convert_pptx_to_html(path: str, get_fonts: bool):
        calls.append((path, get_fonts))
        if get_fonts:
            raise HTTPException(status_code=500, detail="font extraction failed")
        return types.SimpleNamespace(
            slides=["<div>1</div>"],
            width=1280,
            height=720,
            font_css="",
        )

    async def fake_render_htmls_to_images(*, htmls, width: int, height: int):
        return types.SimpleNamespace(paths=["slide-1.png"])

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
            max_slides=1,
            logger=types.SimpleNamespace(info=lambda _message: None, warning=lambda _message: None),
        )
    )

    assert result == ["slide-1.png"]
    assert calls == [("deck.pptx", True), ("deck.pptx", False)]


def test_render_pptx_slides_to_images_falls_back_to_python_renderer(monkeypatch):
    calls: list[tuple[str, bool]] = []

    async def fake_convert_pptx_to_html(path: str, get_fonts: bool):
        calls.append((path, get_fonts))
        raise HTTPException(status_code=500, detail=f"failed get_fonts={get_fonts}")

    async def fake_render_pptx_slides_with_python_fallback(**kwargs):
        return ["fallback-slide-1.png", "fallback-slide-2.png"]

    monkeypatch.setattr(
        "backend.presenton_runtime.templates.fonts_and_slides_preview_support.rendering.EXPORT_TASK_SERVICE",
        types.SimpleNamespace(
            convert_pptx_to_html=fake_convert_pptx_to_html,
            render_htmls_to_images=None,
        ),
    )
    monkeypatch.setattr(
        "backend.presenton_runtime.templates.fonts_and_slides_preview_support.rendering._render_pptx_slides_with_python_fallback",
        fake_render_pptx_slides_with_python_fallback,
    )

    result = asyncio.run(
        render_pptx_slides_to_images(
            modified_pptx_path="deck.pptx",
            font_paths_for_install=[],
            max_slides=2,
            logger=types.SimpleNamespace(info=lambda _message: None, warning=lambda _message: None),
        )
    )

    assert result == ["fallback-slide-1.png", "fallback-slide-2.png"]
    assert calls == [("deck.pptx", True), ("deck.pptx", False)]


def test_render_pptx_slides_to_images_prefers_html_fallback_before_pillow(monkeypatch):
    calls: list[tuple[str, bool]] = []

    async def fake_convert_pptx_to_html(path: str, get_fonts: bool):
        calls.append((path, get_fonts))
        raise HTTPException(status_code=500, detail=f"failed get_fonts={get_fonts}")

    async def fake_render_htmls_to_images(*, htmls, width: int, height: int):
        return types.SimpleNamespace(paths=["html-fallback-slide-1.png"])

    monkeypatch.setattr(
        "backend.presenton_runtime.templates.fonts_and_slides_preview_support.rendering.EXPORT_TASK_SERVICE",
        types.SimpleNamespace(
            convert_pptx_to_html=fake_convert_pptx_to_html,
            render_htmls_to_images=fake_render_htmls_to_images,
        ),
    )
    monkeypatch.setattr(
        "backend.presenton_runtime.templates.fonts_and_slides_preview_support.rendering.extract_slide_htmls_from_pptx",
        lambda *_args, **_kwargs: ["<div>fallback html</div>"],
    )

    def fail_if_pillow_used(*_args, **_kwargs):
        raise AssertionError("Pillow fallback should not run when HTML fallback succeeds")

    monkeypatch.setattr(
        "backend.presenton_runtime.templates.fonts_and_slides_preview_support.rendering.render_fallback_slide_pngs_from_pptx",
        fail_if_pillow_used,
    )

    result = asyncio.run(
        render_pptx_slides_to_images(
            modified_pptx_path="deck.pptx",
            font_paths_for_install=[],
            max_slides=1,
            logger=types.SimpleNamespace(info=lambda *_args, **_kwargs: None, warning=lambda *_args, **_kwargs: None),
        )
    )

    assert result == ["html-fallback-slide-1.png"]
    assert calls == [("deck.pptx", True), ("deck.pptx", False)]


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
            font_replacements="[]",
        )
    )

    assert isinstance(result, FontsUploadAndSlidesPreviewResponse)
    assert captured["max_slides"] == 25
    assert captured["font_replacements"] == "[]"


def test_rewrite_font_family_in_stylesheet_supports_unicode_names():
    rewritten = preview_workflow._rewrite_font_family_in_stylesheet(
        '@font-face { font-family: "Inter"; src: url("https://example.com/inter.woff2"); }',
        "微软雅黑",
    )

    assert 'font-family: "微软雅黑"' in rewritten
    assert "\\u5fae" not in rewritten


def test_build_local_alias_font_face_rule_preserves_unicode_name():
    rule = preview_workflow._build_local_alias_font_face_rule(
        original_name="微软雅黑",
        original_variant="regular",
        source_url="/app_data/fonts/inter.woff2",
    )

    assert 'font-family: "微软雅黑";' in rule
    assert 'src: url("/app_data/fonts/inter.woff2");' in rule
    assert "\\u5fae" not in rule


def test_upload_fonts_and_slides_preview_requires_missing_font_files(monkeypatch):
    create_slide_previews_called = False

    async def fake_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    async def fake_upload_fonts_and_fix_fonts_in_pptx(**_kwargs):
        return (
            {"Brand Sans Bold"},
            {},
            {},
            [],
            "deck-modified.pptx",
            [],
            [],
            {},
            [],
            {},
        )

    async def fake_create_slide_previews(**_kwargs):
        nonlocal create_slide_previews_called
        create_slide_previews_called = True
        return []

    monkeypatch.setattr(
        preview_workflow.asyncio,
        "to_thread",
        fake_to_thread,
    )
    monkeypatch.setattr(
        preview_workflow,
        "upload_fonts_and_fix_fonts_in_pptx",
        fake_upload_fonts_and_fix_fonts_in_pptx,
    )
    monkeypatch.setattr(
        preview_workflow,
        "create_slide_previews",
        fake_create_slide_previews,
    )
    monkeypatch.setattr(
        preview_workflow,
        "extract_used_font_variants_from_pptx",
        lambda _pptx_path: {"Brand Sans Bold": {"bold"}},
    )
    async def fake_check_google_font_availability(*_args, **_kwargs):
        return False

    monkeypatch.setattr(
        preview_workflow,
        "check_google_font_availability",
        fake_check_google_font_availability,
    )

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(
            preview_workflow.upload_fonts_and_preview_handler(
                pptx_file=_FakeUploadFile("deck.pptx", b"pptx-bytes"),
                font_files=None,
                original_font_names=None,
            )
        )

    assert excinfo.value.status_code == 409
    assert excinfo.value.detail["code"] == preview_workflow.MISSING_FONTS_REQUIRED_CODE
    assert excinfo.value.detail["missing_count"] == 1
    assert excinfo.value.detail["missing_fonts"][0]["name"] == "Brand Sans Bold"
    assert create_slide_previews_called is False


def test_upload_fonts_and_slides_preview_detects_partially_resolved_font_variants(monkeypatch):
    async def fake_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    async def fake_upload_fonts_and_fix_fonts_in_pptx(**_kwargs):
        return (
            {"Brand Sans", "Brand Sans Bold"},
            {},
            {"Brand Sans": "Brand Sans Regular"},
            [],
            "deck-modified.pptx",
            [],
            [],
            {},
            [],
            {"Brand Sans": {"regular": "Brand Sans Regular"}},
        )

    monkeypatch.setattr(
        preview_workflow.asyncio,
        "to_thread",
        fake_to_thread,
    )
    monkeypatch.setattr(
        preview_workflow,
        "upload_fonts_and_fix_fonts_in_pptx",
        fake_upload_fonts_and_fix_fonts_in_pptx,
    )
    monkeypatch.setattr(
        preview_workflow,
        "extract_used_font_variants_from_pptx",
        lambda _pptx_path: {"Brand Sans": {"regular"}, "Brand Sans Bold": {"bold"}},
    )
    async def fake_check_google_font_availability(*_args, **_kwargs):
        return False

    monkeypatch.setattr(
        preview_workflow,
        "check_google_font_availability",
        fake_check_google_font_availability,
    )

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(
            preview_workflow.upload_fonts_and_preview_handler(
                pptx_file=_FakeUploadFile("deck.pptx", b"pptx-bytes"),
                font_files=None,
                original_font_names=None,
            )
        )

    assert excinfo.value.status_code == 409
    assert excinfo.value.detail["missing_count"] == 1
    assert excinfo.value.detail["missing_fonts"][0]["name"] == "Brand Sans Bold"


def test_upload_fonts_and_slides_preview_accepts_valid_font_replacement(monkeypatch):
    create_slide_previews_called = False

    async def fake_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    async def fake_get_available_and_unavailable_fonts_for_pptx(*_args, **_kwargs):
        return [("Inter", "https://fonts.googleapis.com/css2?family=Inter&display=swap")], [("Brand Sans", None)]

    async def fake_upload_fonts_and_fix_fonts_in_pptx(**_kwargs):
        return (
            {"Brand Sans"},
            {},
            {"Brand Sans": "Inter"},
            [],
            "deck-modified.pptx",
            [],
            [],
            {},
            [],
            {"Brand Sans": {"regular": "Inter"}},
        )

    async def fake_create_slide_previews(*_args, **_kwargs):
        nonlocal create_slide_previews_called
        create_slide_previews_called = True
        return ["slide-1.png"]

    async def fake_upload_presentations(*_args, **_kwargs):
        return "deck-modified.pptx"

    monkeypatch.setattr(preview_workflow.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(
        preview_workflow,
        "get_available_and_unavailable_fonts_for_pptx",
        fake_get_available_and_unavailable_fonts_for_pptx,
    )
    monkeypatch.setattr(
        preview_workflow,
        "upload_fonts_and_fix_fonts_in_pptx",
        fake_upload_fonts_and_fix_fonts_in_pptx,
    )
    monkeypatch.setattr(preview_workflow, "create_slide_previews", fake_create_slide_previews)
    monkeypatch.setattr(preview_workflow, "upload_presentations", fake_upload_presentations)
    monkeypatch.setattr(
        preview_workflow,
        "public_urls_for_local_paths",
        lambda paths: [f"/app_data/{path}" for path in paths],
    )
    monkeypatch.setattr(
        preview_workflow,
        "extract_used_font_variants_from_pptx",
        lambda _pptx_path: {"Brand Sans": {"regular"}},
    )
    async def fake_prepare_replacement_font_assets(**_kwargs):
        return (
            '@font-face { font-family: "Brand Sans"; src: url("https://fonts.gstatic.com/inter.woff2"); }',
            {"Brand Sans": "/app_data/fonts/replacement-font-aliases.css"},
        )

    monkeypatch.setattr(
        preview_workflow,
        "_prepare_replacement_font_assets",
        fake_prepare_replacement_font_assets,
    )

    result = asyncio.run(
        preview_workflow.upload_fonts_and_preview_handler(
            pptx_file=_FakeUploadFile("deck.pptx", b"pptx-bytes"),
            font_files=None,
            original_font_names=None,
            font_replacements='[{"original_name":"Brand Sans","original_variant":"regular","replacement_family_name":"Inter","replacement_variant":"regular","replacement_label":"Inter Regular"}]',
        )
    )

    assert create_slide_previews_called is True
    assert result.slide_image_urls == ["/app_data/slide-1.png"]
    assert result.fonts["Brand Sans"] == "/app_data/fonts/replacement-font-aliases.css"


def test_upload_fonts_and_slides_preview_rejects_invalid_font_replacement(monkeypatch):
    async def fake_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    async def fake_get_available_and_unavailable_fonts_for_pptx(*_args, **_kwargs):
        return [("Inter", "https://fonts.googleapis.com/css2?family=Inter&display=swap")], [("Brand Sans", None)]

    monkeypatch.setattr(preview_workflow.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(
        preview_workflow,
        "get_available_and_unavailable_fonts_for_pptx",
        fake_get_available_and_unavailable_fonts_for_pptx,
    )
    monkeypatch.setattr(
        preview_workflow,
        "extract_used_font_variants_from_pptx",
        lambda _pptx_path: {"Brand Sans": {"regular"}},
    )

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(
            preview_workflow.upload_fonts_and_preview_handler(
                pptx_file=_FakeUploadFile("deck.pptx", b"pptx-bytes"),
                font_files=None,
                original_font_names=None,
                font_replacements='[{"original_name":"Brand Sans","original_variant":"regular","replacement_family_name":"Not Inter","replacement_variant":"regular","replacement_label":"Not Inter"}]',
            )
        )

    assert excinfo.value.status_code == 400
    assert "matched font" in str(excinfo.value.detail)


def test_upload_fonts_and_slides_preview_detects_partially_resolved_replacement_variants(monkeypatch):
    async def fake_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    async def fake_get_available_and_unavailable_fonts_for_pptx(*_args, **_kwargs):
        return [("Inter", "https://fonts.googleapis.com/css2?family=Inter&display=swap")], [("Brand Sans", None)]

    async def fake_upload_fonts_and_fix_fonts_in_pptx(**_kwargs):
        return (
            {"Brand Sans", "Brand Sans Bold"},
            {},
            {"Brand Sans": "Inter"},
            [],
            "deck-modified.pptx",
            [],
            [],
            {},
            [],
            {"Brand Sans": {"regular": "Inter"}},
        )

    monkeypatch.setattr(preview_workflow.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(
        preview_workflow,
        "get_available_and_unavailable_fonts_for_pptx",
        fake_get_available_and_unavailable_fonts_for_pptx,
    )
    monkeypatch.setattr(
        preview_workflow,
        "upload_fonts_and_fix_fonts_in_pptx",
        fake_upload_fonts_and_fix_fonts_in_pptx,
    )
    monkeypatch.setattr(
        preview_workflow,
        "extract_used_font_variants_from_pptx",
        lambda _pptx_path: {"Brand Sans": {"regular"}, "Brand Sans Bold": {"bold"}},
    )
    async def fake_check_google_font_availability(*_args, **_kwargs):
        return False

    monkeypatch.setattr(
        preview_workflow,
        "check_google_font_availability",
        fake_check_google_font_availability,
    )
    async def fake_prepare_replacement_font_assets(**_kwargs):
        return (
            '@font-face { font-family: "Brand Sans"; src: url("https://fonts.gstatic.com/inter.woff2"); }',
            {"Brand Sans": "/app_data/fonts/replacement-font-aliases.css"},
        )

    monkeypatch.setattr(
        preview_workflow,
        "_prepare_replacement_font_assets",
        fake_prepare_replacement_font_assets,
    )

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(
            preview_workflow.upload_fonts_and_preview_handler(
                pptx_file=_FakeUploadFile("deck.pptx", b"pptx-bytes"),
                font_files=None,
                original_font_names=None,
                font_replacements='[{"original_name":"Brand Sans","original_variant":"regular","replacement_family_name":"Inter","replacement_variant":"regular","replacement_label":"Inter Regular"}]',
            )
        )

    assert excinfo.value.status_code == 409
    assert excinfo.value.detail["missing_count"] == 1
    assert excinfo.value.detail["missing_fonts"][0]["name"] == "Brand Sans Bold"


def test_upload_fonts_override_replacement_for_same_missing_entry(monkeypatch):
    def fake_extract_raw_fonts_and_embedded_details(*_args, **_kwargs):
        return {"Brand Sans"}, [], []

    async def fake_prepare_embedded_fonts(*_args, **_kwargs):
        return {}, {}, {}

    async def fake_save_uploaded_fonts_to_temp(*_args, **_kwargs):
        return (
            [("uploaded-font.ttf", "Brand Sans")],
            {"Brand Sans": "Uploaded Sans"},
            {"Brand Sans": {"regular": "Uploaded Sans"}},
        )

    captured: dict[str, object] = {}

    def fake_replace_fonts_in_pptx(_pptx_path, font_mapping, _output_path, font_variant_mapping):
        captured["font_mapping"] = font_mapping
        captured["font_variant_mapping"] = font_variant_mapping

    async def fake_persist_files_to_session(_pairs):
        return []

    async def fake_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    monkeypatch.setattr(
        preview_workflow,
        "extract_raw_fonts_and_embedded_details",
        fake_extract_raw_fonts_and_embedded_details,
    )
    monkeypatch.setattr(
        preview_workflow,
        "_prepare_embedded_fonts",
        fake_prepare_embedded_fonts,
    )
    monkeypatch.setattr(
        preview_workflow,
        "_save_uploaded_fonts_to_temp",
        fake_save_uploaded_fonts_to_temp,
    )
    monkeypatch.setattr(preview_workflow, "persist_files_to_session", fake_persist_files_to_session)
    monkeypatch.setattr(preview_workflow.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(preview_workflow, "replace_fonts_in_pptx", fake_replace_fonts_in_pptx)

    asyncio.run(
        preview_workflow.upload_fonts_and_fix_fonts_in_pptx(
            pptx_path="deck.pptx",
            temp_dir="temp-dir",
            original_filename="deck.pptx",
            font_files=None,
            original_font_names=None,
            font_replacements=[
                preview_workflow.FontReplacementSelection(
                    original_name="Brand Sans",
                    original_variant="regular",
                    replacement_family_name="Inter",
                    replacement_variant="regular",
                    replacement_label="Inter Regular",
                )
            ],
            logger=types.SimpleNamespace(info=lambda _message: None),
            session_dir="session-dir",
        )
    )

    assert captured["font_mapping"]["Brand Sans"] == "Uploaded Sans"
    assert captured["font_variant_mapping"]["Brand Sans"]["regular"] == "Uploaded Sans"


def test_replacement_only_does_not_rewrite_pptx(monkeypatch):
    def fake_extract_raw_fonts_and_embedded_details(*_args, **_kwargs):
        return {"Brand Sans"}, [], []

    async def fake_prepare_embedded_fonts(*_args, **_kwargs):
        return {}, {}, {}

    async def fake_save_uploaded_fonts_to_temp(*_args, **_kwargs):
        return [], {}, {}

    async def fake_persist_files_to_session(_pairs):
        return []

    async def fake_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    replace_called = False

    def fake_replace_fonts_in_pptx(*_args, **_kwargs):
        nonlocal replace_called
        replace_called = True

    monkeypatch.setattr(
        preview_workflow,
        "extract_raw_fonts_and_embedded_details",
        fake_extract_raw_fonts_and_embedded_details,
    )
    monkeypatch.setattr(
        preview_workflow,
        "_prepare_embedded_fonts",
        fake_prepare_embedded_fonts,
    )
    monkeypatch.setattr(
        preview_workflow,
        "_save_uploaded_fonts_to_temp",
        fake_save_uploaded_fonts_to_temp,
    )
    monkeypatch.setattr(preview_workflow, "persist_files_to_session", fake_persist_files_to_session)
    monkeypatch.setattr(preview_workflow.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(preview_workflow, "replace_fonts_in_pptx", fake_replace_fonts_in_pptx)

    result = asyncio.run(
        preview_workflow.upload_fonts_and_fix_fonts_in_pptx(
            pptx_path="deck.pptx",
            temp_dir="temp-dir",
            original_filename="deck.pptx",
            font_files=None,
            original_font_names=None,
            font_replacements=[
                preview_workflow.FontReplacementSelection(
                    original_name="Brand Sans",
                    original_variant="regular",
                    replacement_family_name="Inter",
                    replacement_variant="regular",
                    replacement_label="Inter Regular",
                )
            ],
            logger=types.SimpleNamespace(info=lambda _message: None),
            session_dir="session-dir",
        )
    )

    assert replace_called is False
    assert result[4] == "deck.pptx"


def test_create_slide_previews_sanitizes_runtime_errors(monkeypatch):
    async def fake_render_pptx_slides_to_images(**_kwargs):
        raise HTTPException(
            status_code=500,
            detail="Export task failed. returncode=1 stderr=convert.py exited with code 1",
        )

    monkeypatch.setattr(
        preview_workflow,
        "render_pptx_slides_to_images",
        fake_render_pptx_slides_to_images,
    )

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(
            preview_workflow.create_slide_previews(
                modified_pptx_path="deck.pptx",
                font_paths_for_install=[],
                max_slides=3,
                logger=types.SimpleNamespace(info=lambda _message: None, error=lambda _message: None),
                session_dir="session-dir",
            )
        )

    assert excinfo.value.status_code == 500
    assert excinfo.value.detail["code"] == preview_workflow.SLIDE_PREVIEW_GENERATION_FAILED_CODE
    assert "convert.py exited" not in excinfo.value.detail["message"]
