from __future__ import annotations

import asyncio
from pathlib import Path

from alembic import command
from alembic.config import Config as AlembicConfig
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine

from utils.db_utils import get_database_url_and_connect_args, to_sync_sqlalchemy_url
from utils.get_env import get_migrate_database_on_startup_env


def _is_truthy(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def _is_sqlite_url(url: str) -> bool:
    return str(url or "").startswith("sqlite")


def _get_sync_url() -> str:
    runtime_url, _ = get_database_url_and_connect_args()
    return to_sync_sqlalchemy_url(runtime_url)


def _build_alembic_config(sync_url: str) -> AlembicConfig:
    config = AlembicConfig()
    config.set_main_option(
        "script_location",
        str(Path(__file__).resolve().parent / "alembic"),
    )
    config.set_main_option("sqlalchemy.url", sync_url)
    return config


def _verify_database_schema_current_sync(sync_url: str) -> None:
    config = _build_alembic_config(sync_url)
    script = ScriptDirectory.from_config(config)
    expected_heads = set(script.get_heads())

    engine = create_engine(sync_url)
    try:
        with engine.connect() as connection:
            context = MigrationContext.configure(connection)
            current_heads = set(context.get_current_heads())
    finally:
        engine.dispose()

    if current_heads != expected_heads:
        raise RuntimeError(
            "Presenton database schema is not current. Run Alembic migrations before startup."
        )


async def verify_database_schema_current() -> None:
    sync_url = _get_sync_url()
    if _is_sqlite_url(sync_url):
        return
    await asyncio.to_thread(_verify_database_schema_current_sync, sync_url)


async def migrate_database_on_startup() -> None:
    sync_url = _get_sync_url()
    if _is_sqlite_url(sync_url):
        return

    if _is_truthy(get_migrate_database_on_startup_env()):
        config = _build_alembic_config(sync_url)
        await asyncio.to_thread(command.upgrade, config, "head")

    await verify_database_schema_current()
