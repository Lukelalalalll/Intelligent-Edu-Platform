from __future__ import annotations

import argparse
import asyncio
from typing import Iterable
import uuid

import backend.presenton_integration  # noqa: F401
from sqlalchemy import distinct
from sqlmodel import select

from backend.services.presenton_projection_service import (
    PRESENTON_MONGO_PROJECTION_SERVICE,
)

from models.sql.chat_history_message import ChatHistoryMessageModel
from models.sql.presentation import PresentationModel
from services.database import async_session_maker, create_db_and_tables


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Backfill Presenton SQLite data into MongoDB projection collections."
    )
    parser.add_argument(
        "--owner-user-id",
        required=True,
        help="Owner user id to stamp onto projected Presenton documents.",
    )
    parser.add_argument(
        "--presentation-id",
        action="append",
        default=[],
        help="Optional Presenton presentation UUID to backfill. Repeatable.",
    )
    return parser.parse_args()


def _iter_presentation_ids(raw_values: Iterable[str]) -> list[uuid.UUID]:
    ids: list[uuid.UUID] = []
    for raw in raw_values:
        value = str(raw or "").strip()
        if not value:
            continue
        ids.append(uuid.UUID(value))
    return ids


async def _run(owner_user_id: str, presentation_ids: list[uuid.UUID]) -> None:
    await create_db_and_tables()
    async with async_session_maker() as sql_session:
        target_ids = presentation_ids
        if not target_ids:
            rows = await sql_session.scalars(
                select(PresentationModel.id).order_by(PresentationModel.created_at.asc())
            )
            target_ids = list(rows)

        for presentation_id in target_ids:
            result = await PRESENTON_MONGO_PROJECTION_SERVICE.sync_presentation_bundle(
                sql_session,
                presentation_id=presentation_id,
                owner_user_id=owner_user_id,
            )
            print(
                f"[presenton-backfill] presentation={result['presentationId']} slides={result['slidesCount']}"
            )

            conversation_rows = await sql_session.execute(
                select(distinct(ChatHistoryMessageModel.conversation_id)).where(
                    ChatHistoryMessageModel.presentation_id == presentation_id
                )
            )
            conversation_ids = [
                row[0]
                for row in conversation_rows.all()
                if row and row[0] is not None
            ]
            for conversation_id in conversation_ids:
                chat_result = await PRESENTON_MONGO_PROJECTION_SERVICE.sync_chat_conversation(
                    sql_session,
                    presentation_id=presentation_id,
                    conversation_id=conversation_id,
                    owner_user_id=owner_user_id,
                )
                print(
                    "[presenton-backfill] "
                    f"presentation={chat_result['presentationId']} "
                    f"conversation={chat_result['conversationId']} "
                    f"messages={chat_result['messagesCount']}"
                )


def main() -> None:
    args = _parse_args()
    asyncio.run(
        _run(
            owner_user_id=str(args.owner_user_id or "").strip(),
            presentation_ids=_iter_presentation_ids(args.presentation_id),
        )
    )


if __name__ == "__main__":
    main()
