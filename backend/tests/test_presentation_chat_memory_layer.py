from __future__ import annotations

import asyncio
import copy
import importlib
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock

_PRESENTON_RUNTIME_ROOT = Path(__file__).resolve().parents[1] / "presenton_runtime"
if str(_PRESENTON_RUNTIME_ROOT) not in sys.path:
    sys.path.insert(0, str(_PRESENTON_RUNTIME_ROOT))

from models.sql.key_value import KeyValueSqlModel
from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel
from services.chat.memory_layer import PresentationChatMemoryLayer
from services.chat.memory_layer_support.chat_memory_theme_data import CHAT_BUILTIN_THEMES


class _FakeScalarResult:
    def __init__(self, rows):
        self._rows = list(rows)

    def __iter__(self):
        return iter(self._rows)


class _FakeSession:
    def __init__(self, *, presentation, slides=None, key_values=None):
        self.presentation = presentation
        self.slides = list(slides or [])
        self.key_values = dict(key_values or {})
        self.images = []

    def _entity(self, statement):
        return statement.column_descriptions[0].get("entity")

    def _filter_slides(self, statement):
        params = statement.compile().params
        values = list(params.values())
        uuid_values = {value for value in values if isinstance(value, uuid.UUID)}
        int_values = [value for value in values if isinstance(value, int)]
        rows = list(self.slides)
        if uuid_values:
            rows = [
                slide
                for slide in rows
                if slide.presentation in uuid_values or slide.id in uuid_values
            ]
        if "slides.index =" in str(statement) and int_values:
            rows = [slide for slide in rows if slide.index == int_values[-1]]
        if "ORDER BY slides.index" in str(statement):
            rows = sorted(rows, key=lambda slide: slide.index)
        return rows

    async def get(self, model, identifier):
        if model is PresentationModel and identifier == self.presentation.id:
            return self.presentation
        return None

    async def scalars(self, statement):
        if self._entity(statement) is SlideModel:
            return _FakeScalarResult(self._filter_slides(statement))
        raise AssertionError(f"Unexpected scalars query: {statement}")

    async def scalar(self, statement):
        entity = self._entity(statement)
        if entity is SlideModel:
            rows = self._filter_slides(statement)
            return rows[0] if rows else None
        if entity is KeyValueSqlModel:
            key = next(
                (value for value in statement.compile().params.values() if isinstance(value, str)),
                "",
            )
            return self.key_values.get(key)
        raise AssertionError(f"Unexpected scalar query: {statement}")

    def add(self, obj):
        if isinstance(obj, SlideModel):
            if obj not in self.slides:
                self.slides.append(obj)
            return
        if isinstance(obj, KeyValueSqlModel):
            self.key_values[obj.key] = obj
            return
        if isinstance(obj, PresentationModel):
            self.presentation = obj
            return
        self.images.append(obj)

    def add_all(self, objects):
        for obj in objects:
            self.add(obj)

    async def delete(self, obj):
        self.slides = [slide for slide in self.slides if slide is not obj]

    async def commit(self):
        return None

    async def refresh(self, obj):
        return None


def _build_presentation() -> PresentationModel:
    now = datetime.now(timezone.utc)
    return PresentationModel(
        id=uuid.uuid4(),
        content="Deck content",
        n_slides=2,
        language="en",
        title="Deck",
        file_paths=[],
        outlines={"source": "presentation", "slides": [{"title": "Fallback"}]},
        created_at=now,
        updated_at=now,
        layout={
            "name": "demo",
            "icon_weight": "duotone",
            "slides": [
                {
                    "id": "layout-a",
                    "name": "Title",
                    "description": "Title slide",
                    "json_schema": {
                        "type": "object",
                        "properties": {"title": {"type": "string"}},
                        "required": ["title"],
                    },
                }
            ],
        },
        structure={"slides": [0, 1]},
        instructions="Be concise",
        tone="default",
        verbosity="standard",
        include_table_of_contents=False,
        include_title_slide=True,
        web_search=False,
        theme=copy.deepcopy(CHAT_BUILTIN_THEMES[3]),
    )


def _build_slide(presentation_id: uuid.UUID, index: int, title: str) -> SlideModel:
    return SlideModel(
        id=uuid.uuid4(),
        presentation=presentation_id,
        layout_group="demo",
        layout="layout-a",
        index=index,
        content={"title": title},
        html_content=None,
        speaker_note=f"note-{index}",
        properties={},
    )


def test_memory_layer_outline_prefers_live_slides():
    presentation = _build_presentation()
    session = _FakeSession(
        presentation=presentation,
        slides=[_build_slide(presentation.id, 0, "Intro")],
    )

    result = asyncio.run(
        PresentationChatMemoryLayer(session, presentation.id).get("presentation_outline")
    )

    assert result["source"] == "slides_table"
    assert result["slide_count"] == 1
    assert result["slides"][0]["content"] == {"title": "Intro"}


def test_memory_layer_outline_falls_back_to_presentation_outline():
    presentation = _build_presentation()
    session = _FakeSession(presentation=presentation, slides=[])

    result = asyncio.run(
        PresentationChatMemoryLayer(session, presentation.id).get("presentation_outline")
    )

    assert result == presentation.outlines


def test_memory_layer_search_ranks_and_builds_snippets():
    presentation = _build_presentation()
    session = _FakeSession(
        presentation=presentation,
        slides=[
            _build_slide(presentation.id, 0, "Chlorophyll overview"),
            _build_slide(presentation.id, 1, "Sunlight and glucose"),
        ],
    )

    result = asyncio.run(
        PresentationChatMemoryLayer(session, presentation.id).search("chlorophyll", limit=2)
    )

    assert [item["index"] for item in result] == [0]
    assert "chlorophyll" in result[0]["snippet"].lower()
    assert result[0]["slide_number"] == 1


def test_memory_layer_save_create_replace_and_delete(monkeypatch):
    presentation = _build_presentation()
    slides = [
        _build_slide(presentation.id, 0, "Intro"),
        _build_slide(presentation.id, 1, "Old middle"),
    ]
    session = _FakeSession(presentation=presentation, slides=slides)
    memory = PresentationChatMemoryLayer(session, presentation.id)
    slide_ops = importlib.import_module(
        "services.chat.memory_layer_support.chat_memory_slide_ops"
    )

    monkeypatch.setattr(slide_ops, "get_images_directory", lambda: "D:/tmp/images")
    monkeypatch.setattr(slide_ops, "ImageGenerationService", lambda *_args, **_kwargs: object())
    monkeypatch.setattr(slide_ops, "process_slide_and_fetch_assets", AsyncMock(return_value=[]))
    monkeypatch.setattr(
        slide_ops,
        "process_old_and_new_slides_and_fetch_assets",
        AsyncMock(return_value=[]),
    )
    monkeypatch.setattr(
        slide_ops.MEM0_PRESENTATION_MEMORY_SERVICE,
        "store_slide_edit",
        AsyncMock(return_value=None),
    )

    created = asyncio.run(
        memory.save_slide(
            content={"title": "Inserted", "__speaker_note__": "speak"},
            layout_id="layout-a",
            index=1,
            replace_old_slide_at_index=False,
        )
    )
    assert created["saved"] is True
    assert created["action"] == "created"
    assert created["shifted_slide_count"] == 1
    assert sorted(slide.index for slide in session.slides) == [0, 1, 2]

    replaced = asyncio.run(
        memory.save_slide(
            content={"title": "Replaced"},
            layout_id="layout-a",
            index=0,
            replace_old_slide_at_index=True,
        )
    )
    assert replaced["saved"] is True
    assert replaced["action"] == "replaced"
    assert next(slide for slide in session.slides if slide.index == 0).content["title"] == "Replaced"

    deleted = asyncio.run(memory.delete_slide(index=1))
    assert deleted["deleted"] is True
    assert sorted(slide.index for slide in session.slides) == [0, 1]


def test_memory_layer_theme_operations_preserve_response_shape(monkeypatch):
    presentation = _build_presentation()
    session = _FakeSession(presentation=presentation)
    memory = PresentationChatMemoryLayer(session, presentation.id)
    theme_ops = importlib.import_module(
        "services.chat.memory_layer_support.chat_memory_themes"
    )

    response = asyncio.run(
        memory.set_presentation_theme(
            theme_query="Midnight custom",
            custom_theme={
                "name": "Midnight Custom",
                "data": {
                    "colors": {"background": "#101010", "primary": "#fefefe"},
                    "fonts": {
                        "textFont": {
                            "name": "Inter",
                            "url": "https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap",
                        }
                    },
                },
            },
        )
    )
    catalog = asyncio.run(memory.get_presentation_theme_catalog())

    assert response["applied"] is True
    assert response["theme_source"] == "custom"
    assert response["custom_theme_saved"] is True
    assert catalog["found"] is True
    assert catalog["current_theme"]["name"] == "Midnight Custom"
    assert response["theme_id"] in catalog["available_theme_ids"]
