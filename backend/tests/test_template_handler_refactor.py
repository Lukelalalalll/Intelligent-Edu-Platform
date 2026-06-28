from __future__ import annotations

import asyncio
import sys
import types
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi import HTTPException

_PRESENTON_RUNTIME_ROOT = Path(__file__).resolve().parents[1] / "presenton_runtime"
if str(_PRESENTON_RUNTIME_ROOT) not in sys.path:
    sys.path.insert(0, str(_PRESENTON_RUNTIME_ROOT))

from templates import handler


class _ScalarRows:
    def __init__(self, rows):
        self._rows = list(rows)

    def all(self):
        return list(self._rows)


class _ExecuteResult:
    def __init__(self, rows):
        self._rows = list(rows)

    def scalars(self):
        return _ScalarRows(self._rows)


class _FakeTemplateSession:
    def __init__(self):
        now = datetime.now(timezone.utc)
        self.template_info_id = uuid.uuid4()
        self.existing_template_id = uuid.uuid4()
        self.template_infos = {
            self.template_info_id: types.SimpleNamespace(
                id=self.template_info_id,
                fonts={"Inter": {"name": "Inter"}},
                pptx_url="/app_data/deck.pptx",
                slide_image_urls=["/app_data/slide-1.png"],
                slide_htmls=["<section>Hero</section>"],
            )
        }
        self.templates = {
            self.existing_template_id: types.SimpleNamespace(
                id=self.existing_template_id,
                name="Existing",
                description="Original template",
                created_at=now,
            )
        }
        self.layouts = [
            types.SimpleNamespace(
                presentation=self.existing_template_id,
                layout_id="hero-1000",
                layout_name="Hero",
                layout_code='const Hero = () => <Slide layoutId="hero-1000" />',
                fonts={"Inter": {"name": "Inter"}},
            )
        ]

    @staticmethod
    def _entity(statement):
        descriptions = getattr(statement, "column_descriptions", [])
        if descriptions:
            return descriptions[0].get("entity")
        return None

    @staticmethod
    def _params(statement):
        return list(statement.compile().params.values())

    async def get(self, model, identifier):
        if model.__name__ == "TemplateCreateInfoModel":
            return self.template_infos.get(identifier)
        if model.__name__ == "TemplateModel":
            return self.templates.get(identifier)
        return None

    async def execute(self, statement):
        if str(statement).lstrip().upper().startswith("DELETE"):
            target_ids = {
                value for value in self._params(statement) if isinstance(value, uuid.UUID)
            }
            self.layouts = [
                layout for layout in self.layouts if layout.presentation not in target_ids
            ]
            return _ExecuteResult([])

        if self._entity(statement).__name__ == "PresentationLayoutCodeModel":
            params = self._params(statement)
            target_ids = {value for value in params if isinstance(value, uuid.UUID)}
            rows = [
                layout for layout in self.layouts if layout.presentation in target_ids
            ]
            return _ExecuteResult(rows)

        raise AssertionError(f"Unexpected execute statement: {statement}")

    async def scalar(self, statement):
        if self._entity(statement).__name__ != "PresentationLayoutCodeModel":
            raise AssertionError(f"Unexpected scalar statement: {statement}")

        params = self._params(statement)
        target_ids = {value for value in params if isinstance(value, uuid.UUID)}
        target_layout_ids = {
            value for value in params if isinstance(value, str) and value.startswith("hero")
        }
        for layout in self.layouts:
            if target_ids and layout.presentation not in target_ids:
                continue
            if target_layout_ids and layout.layout_id not in target_layout_ids:
                continue
            return layout
        return None

    def add(self, obj):
        if hasattr(obj, "slide_htmls") and hasattr(obj, "pptx_url"):
            self.template_infos[obj.id] = obj
            return
        if hasattr(obj, "presentation") and hasattr(obj, "layout_id"):
            self.layouts.append(obj)
            return
        if hasattr(obj, "name") and hasattr(obj, "description") and hasattr(obj, "id"):
            self.templates[obj.id] = obj
            return
        raise AssertionError(f"Unexpected add object: {obj!r}")

    def add_all(self, objects):
        for obj in objects:
            self.add(obj)

    async def commit(self):
        return None

    async def refresh(self, obj):
        if getattr(obj, "created_at", None) is None:
            obj.created_at = datetime.now(timezone.utc)


class _FakeUploadFile:
    def __init__(self, filename: str) -> None:
        self.filename = filename


def test_handler_normalizes_layout_code_and_asset_fields(monkeypatch):
    monkeypatch.setattr("templates.handler_support.code_normalization.random.randint", lambda _a, _b: 4321)

    raw_code = """
```tsx
import React from "react";
const Slide = () => (
  <div image_url="hero.png">
    {icon_url}
    <Section layoutId="hero" />
  </div>
);
export default Slide;
```
"""

    normalized = handler._normalize_layout_code_for_create(raw_code)

    assert "```" not in normalized
    assert "import React" not in normalized
    assert "export default" not in normalized
    assert "__image_url__" in normalized
    assert "__icon_url__" in normalized
    assert 'layoutId="hero-4321"' in normalized


def test_get_template_by_id_rejects_invalid_custom_template_id():
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            handler.get_template_by_id(
                id="custom-not-a-uuid",
                sql_session=_FakeTemplateSession(),
            )
        )

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Template not found. Please use a valid template."


def test_template_mutation_flows_keep_response_shapes(monkeypatch):
    session = _FakeTemplateSession()
    monkeypatch.setattr("templates.handler_support.code_normalization.random.randint", lambda _a, _b: 6789)

    save_response = asyncio.run(
        handler.save_template(
            handler.SaveTemplateRequest(
                template_info_id=session.template_info_id,
                name="Saved Template",
                description="Saved description",
                layouts=[
                    handler.SaveTemplateLayoutData(
                        layout_id="saved-layout",
                        layout_name="Saved Layout",
                        layout_code="<Saved />",
                    )
                ],
            ),
            sql_session=session,
        )
    )
    assert set(save_response.model_dump().keys()) == {
        "id",
        "name",
        "description",
        "created_at",
    }

    clone_response = asyncio.run(
        handler.clone_template(
            handler.CloneTemplateRequest(
                id=f"custom-{session.existing_template_id}",
                name="Cloned Template",
            ),
            sql_session=session,
        )
    )
    assert set(clone_response.model_dump().keys()) == {
        "id",
        "name",
        "description",
        "created_at",
    }

    update_response = asyncio.run(
        handler.update_template(
            handler.UpdateTemplateRequest(
                id=session.existing_template_id,
                layouts=[
                    handler.SaveTemplateLayoutData(
                        layout_id="hero-updated",
                        layout_name="Hero Updated",
                        layout_code='const Hero = () => <Slide layoutId="hero-updated" />',
                    )
                ],
            ),
            sql_session=session,
        )
    )
    assert set(update_response.model_dump().keys()) == {
        "id",
        "name",
        "description",
        "created_at",
    }
    updated_layouts = [
        layout for layout in session.layouts if layout.presentation == session.existing_template_id
    ]
    assert [layout.layout_id for layout in updated_layouts] == ["hero-updated"]
    assert updated_layouts[0].fonts == {"Inter": {"name": "Inter"}}

    clone_layout_response = asyncio.run(
        handler.clone_slide_layout(
            handler.CloneSlideLayoutRequest(
                template_id=f"custom-{session.existing_template_id}",
                layout_id="hero-updated",
                layout_name="Hero Updated Copy",
            ),
            sql_session=session,
        )
    )
    assert set(clone_layout_response.model_dump().keys()) == {
        "layout_id",
        "layout_name",
        "layout_code",
    }
    assert clone_layout_response.layout_id.endswith("-6789")
    assert clone_layout_response.layout_name == "Hero Updated Copy"


def test_handler_preview_wrapper_defaults_max_slides_to_25(monkeypatch):
    captured: dict[str, object] = {}

    async def fake_upload_fonts_and_preview_handler(**kwargs):
        captured.update(kwargs)
        return handler.FontsUploadAndSlidesPreviewResponse(
            slide_image_urls=[],
            pptx_url="/app_data/deck.pptx",
            modified_pptx_url="/app_data/deck.pptx",
            fonts={},
        )

    monkeypatch.setattr(
        "templates.handler_support.layout_generation.upload_fonts_and_slides_preview_handler",
        fake_upload_fonts_and_preview_handler,
    )

    result = asyncio.run(
        handler.upload_fonts_and_slides_preview(
            pptx_file=_FakeUploadFile("deck.pptx"),
            font_files=None,
            original_font_names=None,
            font_replacements="[]",
        )
    )

    assert isinstance(result, handler.FontsUploadAndSlidesPreviewResponse)
    assert captured["max_slides"] == 25
    assert captured["font_replacements"] == "[]"


def test_init_create_template_falls_back_when_pptx_to_html_fails(monkeypatch, tmp_path):
    session = _FakeTemplateSession()
    pptx_path = tmp_path / "deck.pptx"
    pptx_path.write_bytes(b"pptx-bytes")

    async def fake_convert_pptx_to_html(_pptx_path: str, get_fonts: bool = False):
        raise HTTPException(status_code=500, detail=f"failed get_fonts={get_fonts}")

    def fake_extract_slide_htmls_from_pptx(_pptx_path: str):
        return ["<section>Fallback slide</section>"]

    monkeypatch.setattr(
        "templates.handler_support.layout_generation.resolve_app_path_to_filesystem",
        lambda _url: str(pptx_path),
    )
    monkeypatch.setattr(
        "templates.handler_support.layout_generation.EXPORT_TASK_SERVICE",
        types.SimpleNamespace(convert_pptx_to_html=fake_convert_pptx_to_html),
    )
    monkeypatch.setattr(
        "templates.handler_support.layout_generation.extract_slide_htmls_from_pptx",
        fake_extract_slide_htmls_from_pptx,
    )

    result = asyncio.run(
        handler.init_create_template(
            handler.CreateTemplateInitRequest(
                pptx_url="/app_data/deck.pptx",
                slide_image_urls=["/app_data/slide-1.png"],
                fonts={"Inter": {"name": "Inter"}},
            ),
            sql_session=session,
        )
    )

    created = session.template_infos[result]
    assert created.slide_htmls == ["<section>Fallback slide</section>"]
    assert created.slide_image_urls == ["/app_data/slide-1.png"]
