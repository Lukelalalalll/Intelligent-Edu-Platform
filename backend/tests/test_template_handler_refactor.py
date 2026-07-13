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


def test_handler_normalizes_schema_defaults_to_generic_sample_content(monkeypatch):
    monkeypatch.setattr("templates.handler_support.code_normalization.random.randint", lambda _a, _b: 4321)

    raw_code = """
import { z } from "zod";

const Schema = z.object({
  title: z.string().max(18).default("FY25 Revenue Plan"),
  subtitle: z.string().max(20).default("North America"),
  description: z.string().max(48).default("Quarterly pipeline conversion is improving steadily."),
  bulletPoints: z.array(z.string().max(24)).max(3).default([
    "Expand enterprise pipeline",
    "Improve outbound conversion",
    "Reduce churn in strategic accounts",
  ]),
  stats: z.object({
    label: z.string().max(16).default("Growth"),
    value: z.string().max(8).default("42%"),
  }).default({
    label: "Growth",
    value: "42%",
  }),
  table: z.object({
    columns: z.array(z.string().max(12)).max(2).default(["Region", "Target"]),
    rows: z.array(z.array(z.string().max(12)).max(2)).max(2).default([
      ["North", "$2.3M"],
      ["South", "$1.1M"],
    ]),
  }).default({
    columns: ["Region", "Target"],
    rows: [
      ["North", "$2.3M"],
      ["South", "$1.1M"],
    ],
  }),
  chart: z.object({
    categories: z.array(z.string().max(12)).max(2).default(["Q1", "Q2"]),
    series: z.array(z.object({
      name: z.string().max(12).default("Revenue"),
      data: z.array(z.number()).max(2).default([12, 18]),
    })).max(1).default([
      {
        name: "Revenue",
        data: [12, 18],
      },
    ]),
  }).default({
    categories: ["Q1", "Q2"],
    series: [
      {
        name: "Revenue",
        data: [12, 18],
      },
    ],
  }),
  image: z.object({
    image_url: z.string().default("https://example.com/ceo.png"),
    image_prompt: z.string().max(40).default("CEO headshot on stage"),
  }).default({
    image_url: "https://example.com/ceo.png",
    image_prompt: "CEO headshot on stage",
  }),
});

const layoutId = "title-image-right";
"""

    normalized = handler._normalize_layout_code_for_create(raw_code)

    assert "FY25 Revenue Plan" not in normalized
    assert "North America" not in normalized
    assert "Quarterly pipeline conversion" not in normalized
    assert "Expand enterprise pipeline" not in normalized
    assert "Revenue" not in normalized
    assert 'default("Sample Title")' in normalized
    assert 'subtitle: z.string().max(20).default("Sample' in normalized
    assert 'default("Sample description text")' in normalized
    assert 'default(["Sample item 1", "Sample item 2", "Sample item 3"])' in normalized
    assert 'columns: ["Column", "Column"]' in normalized
    assert 'rows: [["Sampl", "Sampl"], ["Sampl", "Sampl"]]' in normalized
    assert 'categories: ["Ca", "Ca"]' in normalized
    assert 'name: "Series"' in normalized
    assert 'data: [10, 20]' in normalized


def test_handler_sanitizes_slide_html_reference_content_and_assets():
    raw_html = """
<div class="slide">
  <img src="/app_data/backgrounds/hero-bg.png" style="width:100%;height:100%" alt="Revenue background" />
  <h1 style="font-size: 36px;">FY25 Revenue Plan</h1>
  <p>North America pipeline conversion is improving.</p>
  <img src="/app_data/images/hero-photo.jpg" alt="Executive team on stage" />
  <img src="/static/icons/bold/chart-pie-bold.png" alt="growth icon" data-editable-id="metric-icon-1" />
</div>
"""

    sanitized = handler._sanitize_slide_html(raw_html)

    assert "FY25 Revenue Plan" not in sanitized
    assert "North America pipeline conversion is improving." not in sanitized
    assert "Executive team on stage" not in sanitized
    assert "growth icon" not in sanitized
    assert "Sample Title" in sanitized
    assert "/app_data/backgrounds/hero-bg.png" in sanitized
    assert "/static/images/replaceable_template_image.png" in sanitized
    assert "/static/icons/placeholder.svg" in sanitized


def test_create_slide_layout_impl_sanitizes_source_reference_and_generated_code(monkeypatch):
    session = _FakeTemplateSession()
    session.template_infos[session.template_info_id].slide_htmls = [
        """
<div>
  <h1 style="font-size: 40px;">FY25 Revenue Plan</h1>
  <p>North America pipeline conversion is improving.</p>
  <img src="/app_data/images/hero-photo.jpg" alt="Executive team on stage" />
</div>
"""
    ]

    captured: dict[str, str] = {}

    async def fake_generate_slide_layout_code(*, system_prompt: str, user_text: str, image_bytes: bytes, media_type: str):
        captured["system_prompt"] = system_prompt
        captured["user_text"] = user_text
        assert image_bytes == b"image-bytes"
        assert media_type == "image/png"
        return """
import { z } from "zod";

const Schema = z.object({
  title: z.string().max(18).default("FY25 Revenue Plan"),
  image: z.object({
    image_url: z.string().default("/app_data/images/hero-photo.jpg"),
    image_prompt: z.string().max(30).default("Executive team on stage"),
  }).default({
    image_url: "/app_data/images/hero-photo.jpg",
    image_prompt: "Executive team on stage",
  }),
});

const layoutId = "hero-layout";
const layoutName = "Hero Layout";
const layoutDescription = "Template";

const dynamicSlideLayout = ({ data }: { data: Partial<z.infer<typeof Schema>> }) => (
  <div>
    <h1>FY25 Revenue Plan</h1>
    <p>North America pipeline conversion is improving.</p>
    <img src="/app_data/images/hero-photo.jpg" alt="Executive team on stage" />
  </div>
);

export {Schema, layoutId, layoutName, layoutDescription, dynamicSlideLayout};
"""

    monkeypatch.setattr(
        "templates.handler_support.layout_generation._read_image_bytes_and_media_type",
        lambda _image_url: asyncio.sleep(0, result=(b"image-bytes", "image/png")),
    )
    monkeypatch.setattr(
        "templates.handler_support.layout_generation.generate_slide_layout_code",
        fake_generate_slide_layout_code,
    )
    monkeypatch.setattr(
        "templates.handler_support.code_normalization.random.randint",
        lambda _a, _b: 4321,
    )

    response = asyncio.run(
        handler._create_slide_layout_impl(
            session,
            handler.CreateSlideLayoutRequest(
                id=session.template_info_id,
                index=0,
            ),
        )
    )

    assert "FY25 Revenue Plan" not in captured["user_text"]
    assert "North America pipeline conversion is improving." not in captured["user_text"]
    assert "/app_data/images/hero-photo.jpg" not in captured["user_text"]
    assert "Sample Title" in captured["user_text"]
    assert "/static/images/replaceable_template_image.png" in captured["user_text"]

    assert "FY25 Revenue Plan" not in response.react_component
    assert "North America pipeline conversion is improving." not in response.react_component
    assert "/app_data/images/hero-photo.jpg" not in response.react_component
    assert 'default("Sample Titl")' in response.react_component
    assert "/static/images/replaceable_template_image.png" in response.react_component
    assert "Executive team on stage" not in response.react_component


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
            render_mode="pptx_to_html",
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
