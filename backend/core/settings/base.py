from __future__ import annotations

from typing import Annotated, ClassVar

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from .shared import _BASE_DIR


class BaseSettingsSegment(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=f"{_BASE_DIR}/.env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    BASE_DIR: ClassVar[str] = _BASE_DIR

    ENV: str = Field(default="development", alias="ENV")
    LOG_LEVEL: str = "INFO"
    ENABLE_RAG_PRELOAD: bool = False
    INTERNAL_GATEWAY_TOKEN: str = ""
    INTERNAL_GATEWAY_HEADER: str = "X-Internal-Gateway"
    GOOGLE_AUTH_CLIENT_ID: str = ""
    MONGO_URI: str = "mongodb://localhost:27017/intelligent_edu"

    TEXTIN_API_KEY: str | None = None
    TEXTIN_SECRET_CODE: str | None = None
    TESSERACT_CMD: str | None = None

    HANDWRITING_OCR_ENABLED: bool = True
    HANDWRITING_OCR_DPI: int = 200
    HANDWRITING_OCR_CONFIDENCE: float = 0.5
    HANDWRITING_OCR_MAX_PAGES: int = 30

    CHAT_AI_ENABLED: bool = True
    CHAT_TRANSFER_ENABLED: bool = True
    CHAT_TRANSFER_TICKET_TTL_HOURS: int = 24
    CHAT_AI_CONTEXT_WINDOW: int = 50
    CHAT_FILE_MAX_MB: int = 20

    ADMIN_DB_CONSOLE_ENABLED: bool = True
    ADMIN_DB_CONSOLE_ALLOWED_COLLECTIONS: Annotated[list[str], NoDecode] = Field(default_factory=list)

    SEARXNG_ENABLED: bool = False
    SEARXNG_BASE_URL: str = "http://localhost:8080"
    SEARXNG_MAX_RESULTS: int = 5
    SEARXNG_TIMEOUT_SECONDS: float = 6.0
    SEARXNG_FETCH_CONTENT: bool = False
    SEARXNG_CONTENT_MAX_CHARS: int = 1200

    SERPAPI_KEY: str = ""
    HDGSB_API_KEY: str = ""

    ALLOWED_ORIGINS: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )

    DIFFICULTY_MAP: ClassVar[dict[int, str]] = {
        1: "Basic",
        2: "Easy",
        3: "Medium",
        4: "Difficult",
        5: "Competition Level",
    }

    @field_validator("LOG_LEVEL", mode="before")
    @classmethod
    def upper_log_level(cls, value: str) -> str:
        return str(value or "INFO").upper()
