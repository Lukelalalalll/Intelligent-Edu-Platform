"""Modular question-generation services."""

from __future__ import annotations

from .file_lifecycle import (
    allowed_file,
    cleanup_old_files,
    get_file_info,
    save_upload,
    save_upload_file,
)
from .generation import call_provider_generate
from .ocr import extract_text_from_image, format_extracted_text
from .pdf_extraction import extract_pdf_text_with_loader
from .question_ops_service import (
    apply_question_ops_dedupe,
    create_question_ops_run,
    get_question_ops_items,
    get_question_ops_run,
    resolve_question_ops_source,
)
from .structured_generation import (
    build_questions_markdown,
    build_questions_txt,
    normalize_question_drafts,
    parse_question_markdown,
)


def get_proxies():
    return None


__all__ = [
    "allowed_file",
    "call_provider_generate",
    "cleanup_old_files",
    "create_question_ops_run",
    "build_questions_markdown",
    "build_questions_txt",
    "extract_pdf_text_with_loader",
    "extract_text_from_image",
    "format_extracted_text",
    "get_file_info",
    "get_question_ops_items",
    "get_question_ops_run",
    "get_proxies",
    "normalize_question_drafts",
    "parse_question_markdown",
    "apply_question_ops_dedupe",
    "resolve_question_ops_source",
    "save_upload",
    "save_upload_file",
]
