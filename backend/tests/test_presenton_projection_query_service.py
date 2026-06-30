from __future__ import annotations

import asyncio
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import SQLModel

_PRESENTON_RUNTIME_ROOT = Path(__file__).resolve().parents[1] / "presenton_runtime"
if str(_PRESENTON_RUNTIME_ROOT) not in sys.path:
    sys.path.insert(0, str(_PRESENTON_RUNTIME_ROOT))

from models.sql.chat_history_message import ChatHistoryMessageModel
from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel
from services.search_indexing import update_presentation_search_text, update_slide_search_text

from backend.services.presenton.presenton_projection_query_service import (
    PRESENTON_PROJECTION_QUERY_SERVICE,
)
from backend.services.presenton.presenton_sql_query_service import (
    PRESENTON_SQL_QUERY_SERVICE,
)


def _build_presentation(
    *,
    owner_user_id: str,
    title: str,
    updated_at: datetime,
) -> PresentationModel:
    presentation = PresentationModel(
        id=uuid.uuid4(),
        owner_user_id=owner_user_id,
        content=f"{title} source",
        n_slides=2,
        language="en",
        title=title,
        file_paths=["app_data/source.md"],
        outlines={"slides": [{"title": title}]},
        created_at=updated_at - timedelta(days=1),
        updated_at=updated_at,
        layout={"name": "demo"},
        structure={"slides": [0, 1]},
        instructions="Be concise",
        tone="default",
        verbosity="standard",
        include_table_of_contents=False,
        include_title_slide=True,
        web_search=False,
        theme={"id": "professional-blue"},
    )
    update_presentation_search_text(presentation)
    return presentation


def _build_slide(
    *,
    presentation_id: uuid.UUID,
    index: int,
    title: str,
    speaker_note: str,
) -> SlideModel:
    slide = SlideModel(
        id=uuid.uuid4(),
        presentation=presentation_id,
        layout_group="demo",
        layout="layout-a",
        index=index,
        content={"title": title, "body": speaker_note},
        html_content=None,
        speaker_note=speaker_note,
        properties={"variant": "default"},
    )
    update_slide_search_text(slide)
    return slide


def _build_message(
    *,
    presentation_id: uuid.UUID,
    conversation_id: uuid.UUID,
    position: int,
    role: str,
    content: str,
    created_at: datetime,
) -> ChatHistoryMessageModel:
    return ChatHistoryMessageModel(
        id=uuid.uuid4(),
        presentation_id=presentation_id,
        conversation_id=conversation_id,
        position=position,
        role=role,
        content=content,
        created_at=created_at,
        tool_calls=["saveSlide"] if role == "assistant" else None,
    )


def _seed_presenton_query_db(tmp_path):
    async def _setup():
        db_path = tmp_path / "presenton-query-test.sqlite3"
        engine = create_async_engine(f"sqlite+aiosqlite:///{db_path.as_posix()}")
        session_maker = async_sessionmaker(engine, expire_on_commit=False)

        async with engine.begin() as conn:
            await conn.run_sync(
                lambda sync_conn: SQLModel.metadata.create_all(
                    sync_conn,
                    tables=[
                        PresentationModel.__table__,
                        SlideModel.__table__,
                        ChatHistoryMessageModel.__table__,
                    ],
                )
            )

        now = datetime.now(timezone.utc)
        pres_a = _build_presentation(
            owner_user_id="user-1",
            title="Photosynthesis Basics",
            updated_at=now,
        )
        pres_b = _build_presentation(
            owner_user_id="user-1",
            title="Heat Transfer",
            updated_at=now - timedelta(hours=3),
        )
        pres_c = _build_presentation(
            owner_user_id="user-2",
            title="Private Deck",
            updated_at=now - timedelta(minutes=30),
        )

        slides = [
            _build_slide(
                presentation_id=pres_a.id,
                index=0,
                title="Intro",
                speaker_note="chlorophyll and leaves",
            ),
            _build_slide(
                presentation_id=pres_a.id,
                index=1,
                title="Process",
                speaker_note="sunlight water glucose",
            ),
            _build_slide(
                presentation_id=pres_b.id,
                index=0,
                title="Conduction",
                speaker_note="metal rod thermodynamics contact",
            ),
            _build_slide(
                presentation_id=pres_c.id,
                index=0,
                title="Hidden",
                speaker_note="should never leak",
            ),
        ]

        conversation_1 = uuid.uuid4()
        conversation_2 = uuid.uuid4()
        messages = [
            _build_message(
                presentation_id=pres_a.id,
                conversation_id=conversation_1,
                position=1,
                role="user",
                content="Can we simplify slide one?",
                created_at=now - timedelta(minutes=5),
            ),
            _build_message(
                presentation_id=pres_a.id,
                conversation_id=conversation_1,
                position=2,
                role="assistant",
                content="Yes, reduce the bullet count.",
                created_at=now - timedelta(minutes=4),
            ),
            _build_message(
                presentation_id=pres_a.id,
                conversation_id=conversation_2,
                position=1,
                role="user",
                content="Need a stronger ending.",
                created_at=now - timedelta(minutes=2),
            ),
            _build_message(
                presentation_id=pres_c.id,
                conversation_id=uuid.uuid4(),
                position=1,
                role="user",
                content="Private",
                created_at=now - timedelta(minutes=1),
            ),
        ]

        async with session_maker() as session:
            session.add_all([pres_a, pres_b, pres_c, *slides, *messages])
            await session.commit()

        return engine, session_maker, {
            "pres_a": str(pres_a.id),
            "pres_b": str(pres_b.id),
            "pres_c": str(pres_c.id),
            "conversation_2": str(conversation_2),
        }

    return asyncio.run(_setup())


def test_list_presentations_filters_by_owner_and_sorts_latest_first(monkeypatch, tmp_path):
    engine, session_maker, ids = _seed_presenton_query_db(tmp_path)
    monkeypatch.setattr(
        "backend.services.presenton.presenton_sql_query_service.get_async_session_maker",
        lambda: session_maker,
    )

    try:
        items, total = asyncio.run(
            PRESENTON_SQL_QUERY_SERVICE.list_presentations(
                owner_user_id="user-1",
                page=1,
                page_size=10,
            )
        )
    finally:
        asyncio.run(engine.dispose())

    assert total == 2
    assert [item["presentonPresentationId"] for item in items] == [ids["pres_a"], ids["pres_b"]]
    assert all(item["ownerUserId"] == "user-1" for item in items)
    assert items[0]["id"] == ids["pres_a"]
    assert items[0]["slideCount"] == 2
    assert items[0]["thumbnailUrl"] is None
    assert items[0]["firstSlidePreview"] == {
        "eyebrow": None,
        "heading": "Intro",
        "summary": "chlorophyll and leaves",
        "imageUrl": None,
        "layout": "layout-a",
        "layoutGroup": "demo",
    }


def test_get_presentation_detail_returns_sorted_slides_and_owner_scoped_chats(monkeypatch, tmp_path):
    engine, session_maker, ids = _seed_presenton_query_db(tmp_path)
    monkeypatch.setattr(
        "backend.services.presenton.presenton_sql_query_service.get_async_session_maker",
        lambda: session_maker,
    )

    try:
        detail = asyncio.run(
            PRESENTON_SQL_QUERY_SERVICE.get_presentation_detail(
                owner_user_id="user-1",
                presentation_id=ids["pres_a"],
            )
        )
        hidden_detail = asyncio.run(
            PRESENTON_SQL_QUERY_SERVICE.get_presentation_detail(
                owner_user_id="user-1",
                presentation_id=ids["pres_c"],
            )
        )
    finally:
        asyncio.run(engine.dispose())

    assert detail is not None
    assert detail["presentation"]["presentonPresentationId"] == ids["pres_a"]
    assert [slide["index"] for slide in detail["slides"]] == [0, 1]
    assert detail["chatSummary"]["conversationCount"] == 2
    assert detail["chatSummary"]["messageCount"] == 3
    assert detail["chatConversations"][0]["conversationId"] == ids["conversation_2"]
    assert detail["chatConversations"][0]["messageCount"] == 1
    assert hidden_detail is None


def test_search_presentations_matches_title_and_slide_text_without_cross_owner_leaks(monkeypatch, tmp_path):
    engine, session_maker, ids = _seed_presenton_query_db(tmp_path)
    monkeypatch.setattr(
        "backend.services.presenton.presenton_sql_query_service.get_async_session_maker",
        lambda: session_maker,
    )

    try:
        slide_match_items, slide_match_total = asyncio.run(
            PRESENTON_SQL_QUERY_SERVICE.search_presentations(
                owner_user_id="user-1",
                query="thermodynamics",
                page=1,
                page_size=10,
            )
        )
        title_match_items, title_match_total = asyncio.run(
            PRESENTON_SQL_QUERY_SERVICE.search_presentations(
                owner_user_id="user-1",
                query="Photosynthesis",
                page=1,
                page_size=10,
            )
        )
        leaked_items, leaked_total = asyncio.run(
            PRESENTON_SQL_QUERY_SERVICE.search_presentations(
                owner_user_id="user-1",
                query="should never leak",
                page=1,
                page_size=10,
            )
        )
    finally:
        asyncio.run(engine.dispose())

    assert slide_match_total == 1
    assert slide_match_items[0]["presentonPresentationId"] == ids["pres_b"]
    assert slide_match_items[0]["matchedSlidesCount"] == 1
    assert "thermodynamics" in slide_match_items[0]["matchedSlides"][0]["contentText"].lower()
    assert slide_match_items[0]["firstSlidePreview"]["heading"] == "Conduction"
    assert slide_match_items[0]["firstSlidePreview"]["summary"] == "metal rod thermodynamics contact"

    assert title_match_total == 1
    assert title_match_items[0]["presentonPresentationId"] == ids["pres_a"]

    assert leaked_total == 0
    assert leaked_items == []


def test_legacy_projection_query_service_now_reads_from_sql(monkeypatch, tmp_path):
    engine, session_maker, ids = _seed_presenton_query_db(tmp_path)
    monkeypatch.setattr(
        "backend.services.presenton.presenton_sql_query_service.get_async_session_maker",
        lambda: session_maker,
    )

    try:
        items, total = asyncio.run(
            PRESENTON_PROJECTION_QUERY_SERVICE.list_presentations(
                owner_user_id="user-1",
                page=1,
                page_size=10,
            )
        )
    finally:
        asyncio.run(engine.dispose())

    assert total == 2
    assert [item["presentonPresentationId"] for item in items] == [ids["pres_a"], ids["pres_b"]]


def test_search_presentations_blank_query_falls_back_to_list(monkeypatch, tmp_path):
    engine, session_maker, ids = _seed_presenton_query_db(tmp_path)
    monkeypatch.setattr(
        "backend.services.presenton.presenton_sql_query_service.get_async_session_maker",
        lambda: session_maker,
    )

    try:
        listed_items, listed_total = asyncio.run(
            PRESENTON_SQL_QUERY_SERVICE.list_presentations(
                owner_user_id="user-1",
                page=1,
                page_size=10,
            )
        )
        searched_items, searched_total = asyncio.run(
            PRESENTON_SQL_QUERY_SERVICE.search_presentations(
                owner_user_id="user-1",
                query="   ",
                page=1,
                page_size=10,
            )
        )
    finally:
        asyncio.run(engine.dispose())

    assert listed_total == searched_total == 2
    assert [item["presentonPresentationId"] for item in searched_items] == [
        ids["pres_a"],
        ids["pres_b"],
    ]
    assert searched_items == listed_items


def test_list_presentations_pagination_boundaries_and_clamp(monkeypatch, tmp_path):
    engine, session_maker, ids = _seed_presenton_query_db(tmp_path)
    monkeypatch.setattr(
        "backend.services.presenton.presenton_sql_query_service.get_async_session_maker",
        lambda: session_maker,
    )

    try:
        first_page_items, first_page_total = asyncio.run(
            PRESENTON_SQL_QUERY_SERVICE.list_presentations(
                owner_user_id="user-1",
                page=1,
                page_size=1,
            )
        )
        second_page_items, second_page_total = asyncio.run(
            PRESENTON_SQL_QUERY_SERVICE.list_presentations(
                owner_user_id="user-1",
                page=2,
                page_size=1,
            )
        )
        overflow_items, overflow_total = asyncio.run(
            PRESENTON_SQL_QUERY_SERVICE.list_presentations(
                owner_user_id="user-1",
                page=3,
                page_size=1,
            )
        )
        clamped_items, clamped_total = asyncio.run(
            PRESENTON_SQL_QUERY_SERVICE.list_presentations(
                owner_user_id="user-1",
                page=1,
                page_size=1000,
            )
        )
    finally:
        asyncio.run(engine.dispose())

    assert first_page_total == second_page_total == overflow_total == clamped_total == 2
    assert [item["presentonPresentationId"] for item in first_page_items] == [ids["pres_a"]]
    assert [item["presentonPresentationId"] for item in second_page_items] == [ids["pres_b"]]
    assert overflow_items == []
    assert [item["presentonPresentationId"] for item in clamped_items] == [
        ids["pres_a"],
        ids["pres_b"],
    ]


def test_slide_unique_constraint_rejects_duplicate_index(tmp_path):
    async def _run():
        db_path = tmp_path / "presenton-query-constraint.sqlite3"
        engine = create_async_engine(f"sqlite+aiosqlite:///{db_path.as_posix()}")
        session_maker = async_sessionmaker(engine, expire_on_commit=False)
        async with engine.begin() as conn:
            await conn.run_sync(
                lambda sync_conn: SQLModel.metadata.create_all(
                    sync_conn,
                    tables=[
                        PresentationModel.__table__,
                        SlideModel.__table__,
                    ],
                )
            )

        presentation = _build_presentation(
            owner_user_id="user-1",
            title="Duplicate Slide Index",
            updated_at=datetime.now(timezone.utc),
        )
        slide_a = _build_slide(
            presentation_id=presentation.id,
            index=0,
            title="A",
            speaker_note="one",
        )
        slide_b = _build_slide(
            presentation_id=presentation.id,
            index=0,
            title="B",
            speaker_note="two",
        )

        try:
            async with session_maker() as session:
                session.add_all([presentation, slide_a, slide_b])
                with pytest.raises(IntegrityError):
                    await session.commit()
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_chat_message_unique_constraint_rejects_duplicate_position(tmp_path):
    async def _run():
        db_path = tmp_path / "presenton-query-chat-constraint.sqlite3"
        engine = create_async_engine(f"sqlite+aiosqlite:///{db_path.as_posix()}")
        session_maker = async_sessionmaker(engine, expire_on_commit=False)
        async with engine.begin() as conn:
            await conn.run_sync(
                lambda sync_conn: SQLModel.metadata.create_all(
                    sync_conn,
                    tables=[
                        PresentationModel.__table__,
                        ChatHistoryMessageModel.__table__,
                    ],
                )
            )

        now = datetime.now(timezone.utc)
        presentation = _build_presentation(
            owner_user_id="user-1",
            title="Duplicate Message Position",
            updated_at=now,
        )
        conversation_id = uuid.uuid4()
        message_a = _build_message(
            presentation_id=presentation.id,
            conversation_id=conversation_id,
            position=1,
            role="user",
            content="hello",
            created_at=now,
        )
        message_b = _build_message(
            presentation_id=presentation.id,
            conversation_id=conversation_id,
            position=1,
            role="assistant",
            content="world",
            created_at=now,
        )

        try:
            async with session_maker() as session:
                session.add_all([presentation, message_a, message_b])
                with pytest.raises(IntegrityError):
                    await session.commit()
        finally:
            await engine.dispose()

    asyncio.run(_run())
