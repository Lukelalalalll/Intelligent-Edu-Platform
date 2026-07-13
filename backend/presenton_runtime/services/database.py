from collections.abc import AsyncGenerator
import logging

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    create_async_engine,
    async_sessionmaker,
    AsyncSession,
)
from sqlmodel import SQLModel

from models.sql.async_presentation_generation_status import (
    AsyncPresentationGenerationTaskModel,
)
from models.sql.chat_history_message import ChatHistoryMessageModel
from models.sql.image_asset import ImageAsset
from models.sql.key_value import KeyValueSqlModel
from models.sql.ollama_pull_status import OllamaPullStatus
from models.sql.presentation_layout_code import PresentationLayoutCodeModel
from models.sql.presentation import PresentationModel
from models.sql.template import TemplateModel
from models.sql.template_create_info import TemplateCreateInfoModel
from models.sql.slide import SlideModel
from models.sql.webhook_subscription import WebhookSubscription
from utils.db_utils import get_database_url_and_connect_args, get_pool_kwargs

logger = logging.getLogger(__name__)

database_url, connect_args = get_database_url_and_connect_args()

# Apply connection-pool settings for server-class databases (PostgreSQL, MySQL).
# SQLite uses a file-lock model and ignores pool configuration, so we skip it.
_pool_kwargs = get_pool_kwargs() if "sqlite" not in database_url else {}

sql_engine: AsyncEngine = create_async_engine(
    database_url, connect_args=connect_args, **_pool_kwargs
)
async_session_maker = async_sessionmaker(sql_engine, expire_on_commit=False)


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session


def _sqlite_column_names(sync_conn, table_name: str) -> set[str]:
    inspector = inspect(sync_conn)
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def _sqlite_table_has_index(sync_conn, table_name: str, index_name: str) -> bool:
    inspector = inspect(sync_conn)
    if table_name not in inspector.get_table_names():
        return False
    return any(index.get("name") == index_name for index in inspector.get_indexes(table_name))


def _sqlite_apply_presenton_compatibility_fixes(sync_conn) -> None:
    presentation_columns = _sqlite_column_names(sync_conn, "presentations")
    if presentation_columns:
        if "owner_user_id" not in presentation_columns:
            sync_conn.execute(
                text(
                    "ALTER TABLE presentations "
                    "ADD COLUMN owner_user_id VARCHAR NOT NULL DEFAULT ''"
                )
            )
            logger.warning(
                "SQLite compatibility fix applied: added presentations.owner_user_id"
            )
        if "search_text" not in presentation_columns:
            sync_conn.execute(
                text(
                    "ALTER TABLE presentations "
                    "ADD COLUMN search_text VARCHAR NOT NULL DEFAULT ''"
                )
            )
            logger.warning(
                "SQLite compatibility fix applied: added presentations.search_text"
            )

        sync_conn.execute(
            text(
                "UPDATE presentations "
                "SET owner_user_id = COALESCE(owner_user_id, ''), "
                "search_text = COALESCE(search_text, '')"
            )
        )
        if not _sqlite_table_has_index(
            sync_conn,
            "presentations",
            "ix_presentations_owner_user_id_updated_at",
        ):
            sync_conn.execute(
                text(
                    "CREATE INDEX ix_presentations_owner_user_id_updated_at "
                    "ON presentations (owner_user_id, updated_at)"
                )
            )

    slide_columns = _sqlite_column_names(sync_conn, "slides")
    if slide_columns and "search_text" not in slide_columns:
        sync_conn.execute(
            text(
                "ALTER TABLE slides "
                "ADD COLUMN search_text VARCHAR NOT NULL DEFAULT ''"
            )
        )
        logger.warning(
            "SQLite compatibility fix applied: added slides.search_text"
        )

    if slide_columns:
        sync_conn.execute(
            text("UPDATE slides SET search_text = COALESCE(search_text, '')")
        )


# Create Database and Tables
async def create_db_and_tables():
    if "sqlite" not in database_url:
        from migrations import verify_database_schema_current

        await verify_database_schema_current()
        return

    async with sql_engine.begin() as conn:
        await conn.run_sync(
            lambda sync_conn: SQLModel.metadata.create_all(
                sync_conn,
                tables=[
                    PresentationModel.__table__,
                    SlideModel.__table__,
                    KeyValueSqlModel.__table__,
                    ChatHistoryMessageModel.__table__,
                    ImageAsset.__table__,
                    PresentationLayoutCodeModel.__table__,
                    TemplateCreateInfoModel.__table__,
                    TemplateModel.__table__,
                    WebhookSubscription.__table__,
                    AsyncPresentationGenerationTaskModel.__table__,
                    OllamaPullStatus.__table__,
                ],
            )
        )
        await conn.run_sync(_sqlite_apply_presenton_compatibility_fixes)


async def dispose_engines():
    """Dispose all engine connection pools.

    Call this during application shutdown (e.g. in a FastAPI ``shutdown``
    event or lifespan context) to release every connection back to the
    database and prevent stale / leaked connections.
    """
    await sql_engine.dispose()
