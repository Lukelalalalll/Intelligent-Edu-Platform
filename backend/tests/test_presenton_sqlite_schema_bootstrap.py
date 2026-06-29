from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy import create_engine, inspect, text

_PRESENTON_RUNTIME_ROOT = Path(__file__).resolve().parents[1] / "presenton_runtime"
if str(_PRESENTON_RUNTIME_ROOT) not in sys.path:
    sys.path.insert(0, str(_PRESENTON_RUNTIME_ROOT))

from services.database import _sqlite_apply_presenton_compatibility_fixes


def test_sqlite_bootstrap_adds_missing_presenton_columns_and_index(tmp_path):
    db_path = tmp_path / "presenton-legacy.sqlite3"
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")

    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    """
                    CREATE TABLE presentations (
                        id VARCHAR PRIMARY KEY,
                        content TEXT NOT NULL,
                        n_slides INTEGER NOT NULL,
                        language TEXT NOT NULL,
                        title TEXT,
                        file_paths JSON,
                        outlines JSON,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        layout JSON,
                        structure JSON,
                        instructions TEXT,
                        tone TEXT,
                        verbosity TEXT,
                        include_table_of_contents BOOLEAN,
                        include_title_slide BOOLEAN,
                        web_search BOOLEAN,
                        theme JSON
                    )
                    """
                )
            )
            connection.execute(
                text(
                    """
                    CREATE TABLE slides (
                        id VARCHAR PRIMARY KEY,
                        presentation VARCHAR NOT NULL,
                        layout_group TEXT NOT NULL,
                        layout TEXT NOT NULL,
                        "index" INTEGER NOT NULL,
                        content JSON NOT NULL,
                        html_content TEXT,
                        speaker_note TEXT,
                        properties JSON
                    )
                    """
                )
            )

            _sqlite_apply_presenton_compatibility_fixes(connection)

        inspector = inspect(engine)
        presentation_columns = {
            column["name"] for column in inspector.get_columns("presentations")
        }
        slide_columns = {column["name"] for column in inspector.get_columns("slides")}
        presentation_indexes = {
            index["name"] for index in inspector.get_indexes("presentations")
        }

        assert "owner_user_id" in presentation_columns
        assert "search_text" in presentation_columns
        assert "search_text" in slide_columns
        assert "ix_presentations_owner_user_id_updated_at" in presentation_indexes
    finally:
        engine.dispose()
