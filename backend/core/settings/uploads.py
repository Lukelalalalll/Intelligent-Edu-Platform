from __future__ import annotations

from typing import ClassVar

from .rag import RagSettingsSegment


class UploadSettingsSegment(RagSettingsSegment):
    UPLOAD_FOLDER: str = ""
    MAX_CONTENT_LENGTH: int = 50 * 1024 * 1024
    MARKDOWN_FOLDER: str = ""
    HIGHLIGHTS_FOLDER: str = ""
    SUB1_UPLOAD_FOLDER: str = ""
    SUB1_MD_FOLDER: str = ""
    SUB1_HIGHLIGHTS_FOLDER: str = ""
    PPT_TEMPLATES_FOLDER: str = ""
    PPT_RESULTS_FOLDER: str = ""
    SCRIPT_RESULTS_FOLDER: str = ""

    UPLOAD_FOLDER_SUB2: str = ""
    GENERATED_FOLDER_SUB2: str = ""
    SCREENSHOTS_FOLDER_SUB2: str = ""
    KNOWLEDGE_BASE_UPLOAD_DIR: str = ""
    ALLOWED_EXTENSIONS_SUB2: ClassVar[set[str]] = {"pdf", "png", "jpg", "jpeg"}
    SUB2_FILE_TTL_HOURS: int = 72
    SUB2_UPLOAD_FILE_TTL_HOURS: int = 2160
