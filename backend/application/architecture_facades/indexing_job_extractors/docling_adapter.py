from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def _docling_enabled() -> bool:
    try:
        from backend.config import Config

        return bool(getattr(Config, "RAG_ENABLE_DOCLING", True))
    except Exception:
        return True


def _extract_with_docling(source_path: Path) -> dict[str, Any] | None:
    try:
        from docling.document_converter import DocumentConverter
    except ImportError:
        logger.info("Docling not installed; skipping for %s", source_path.name)
        return None

    try:
        from .structure import _build_structure_from_markdown

        converter = DocumentConverter()
        conversion = converter.convert(str(source_path))
        document = conversion.document
        markdown = str(document.export_to_markdown() or "").strip()
        if not markdown:
            return None
        structure = _build_structure_from_markdown(markdown, source_path.name)
        structure["docling_json"] = _safe_docling_json(document)
        return {"markdown": markdown, "structure": structure}
    except Exception:
        logger.exception("Docling extraction failed for %s", source_path.name)
        return None


def _safe_docling_json(document: Any) -> dict[str, Any]:
    try:
        if hasattr(document, "export_to_dict"):
            payload = document.export_to_dict()
            if isinstance(payload, dict):
                return payload
        if hasattr(document, "model_dump"):
            payload = document.model_dump()
            if isinstance(payload, dict):
                return payload
    except Exception:
        logger.debug("Could not serialize Docling document", exc_info=True)
    return {}


def _supports_docling_suffix(suffix: str) -> bool:
    return suffix in {
        ".pdf",
        ".docx",
        ".pptx",
        ".xlsx",
        ".html",
        ".htm",
        ".md",
        ".markdown",
        ".txt",
        ".png",
        ".jpg",
        ".jpeg",
    }
