"""presenton_sql_source_hardening

Revision ID: 6f60e30791d1
Revises: c7b70d0f31b1
Create Date: 2026-06-28 13:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "6f60e30791d1"
down_revision: Union[str, None] = "c7b70d0f31b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _inspector():
    return sa.inspect(op.get_bind())


def _has_column(table_name: str, column_name: str) -> bool:
    inspector = _inspector()
    if table_name not in inspector.get_table_names():
        return False
    return column_name in {column["name"] for column in inspector.get_columns(table_name)}


def _has_index(table_name: str, index_name: str) -> bool:
    inspector = _inspector()
    if table_name not in inspector.get_table_names():
        return False
    return index_name in {index["name"] for index in inspector.get_indexes(table_name)}


def _has_unique_constraint(table_name: str, constraint_name: str) -> bool:
    inspector = _inspector()
    if table_name not in inspector.get_table_names():
        return False
    return constraint_name in {
        constraint["name"] for constraint in inspector.get_unique_constraints(table_name)
    }


def _is_postgresql() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    if not _has_column("presentations", "owner_user_id"):
        op.add_column(
            "presentations",
            sa.Column("owner_user_id", sa.String(), nullable=False, server_default=""),
        )
    if not _has_column("presentations", "search_text"):
        op.add_column(
            "presentations",
            sa.Column("search_text", sa.String(), nullable=False, server_default=""),
        )
    if not _has_column("slides", "search_text"):
        op.add_column(
            "slides",
            sa.Column("search_text", sa.String(), nullable=False, server_default=""),
        )

    op.execute(sa.text("UPDATE presentations SET owner_user_id = COALESCE(owner_user_id, '')"))
    op.execute(sa.text("UPDATE presentations SET search_text = COALESCE(search_text, '')"))
    op.execute(sa.text("UPDATE slides SET search_text = COALESCE(search_text, '')"))

    if not _has_index("presentations", "ix_presentations_owner_user_id_updated_at"):
        op.create_index(
            "ix_presentations_owner_user_id_updated_at",
            "presentations",
            ["owner_user_id", "updated_at"],
            unique=False,
        )

    if not _has_unique_constraint("slides", "uq_slides_presentation_index"):
        with op.batch_alter_table("slides") as batch_op:
            batch_op.create_unique_constraint(
                "uq_slides_presentation_index",
                ["presentation", "index"],
            )

    if not _has_unique_constraint(
        "chat_history_messages",
        "uq_chat_history_messages_presentation_conversation_position",
    ):
        with op.batch_alter_table("chat_history_messages") as batch_op:
            batch_op.create_unique_constraint(
                "uq_chat_history_messages_presentation_conversation_position",
                ["presentation_id", "conversation_id", "position"],
            )

    if _is_postgresql():
        op.execute(
            sa.text(
                "CREATE INDEX IF NOT EXISTS ix_presentations_search_text_tsv "
                "ON presentations USING GIN (to_tsvector('simple', search_text))"
            )
        )
        op.execute(
            sa.text(
                "CREATE INDEX IF NOT EXISTS ix_slides_search_text_tsv "
                "ON slides USING GIN (to_tsvector('simple', search_text))"
            )
        )


def downgrade() -> None:
    if _is_postgresql():
        op.execute(sa.text("DROP INDEX IF EXISTS ix_slides_search_text_tsv"))
        op.execute(sa.text("DROP INDEX IF EXISTS ix_presentations_search_text_tsv"))

    if _has_unique_constraint(
        "chat_history_messages",
        "uq_chat_history_messages_presentation_conversation_position",
    ):
        with op.batch_alter_table("chat_history_messages") as batch_op:
            batch_op.drop_constraint(
                "uq_chat_history_messages_presentation_conversation_position",
                type_="unique",
            )

    if _has_unique_constraint("slides", "uq_slides_presentation_index"):
        with op.batch_alter_table("slides") as batch_op:
            batch_op.drop_constraint("uq_slides_presentation_index", type_="unique")

    if _has_index("presentations", "ix_presentations_owner_user_id_updated_at"):
        op.drop_index("ix_presentations_owner_user_id_updated_at", table_name="presentations")

    if _has_column("slides", "search_text"):
        op.drop_column("slides", "search_text")
    if _has_column("presentations", "search_text"):
        op.drop_column("presentations", "search_text")
    if _has_column("presentations", "owner_user_id"):
        op.drop_column("presentations", "owner_user_id")
