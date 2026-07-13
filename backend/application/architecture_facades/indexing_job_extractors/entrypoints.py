from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .docling_adapter import (
    _docling_enabled,
    _extract_with_docling,
    _supports_docling_suffix,
)
from .format_extractors import _extract_fast_text, _extract_pdf_markdown
from .quality import _build_quality_report, _passes_quality_gate
from .structure import _build_structure_from_markdown, _normalize_markdown

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class ParsedDocumentArtifact:
    kind: str
    filename: str
    content: str
    content_type: str


@dataclass(slots=True)
class ParsedDocumentResult:
    text: str
    normalized_markdown: str
    structure: dict[str, Any]
    quality_report: dict[str, Any]
    parser_used: str
    parser_strategy: str
    fallback_chain: list[str]
    artifacts: list[ParsedDocumentArtifact]


def extract_document_payload(
    source_path: Path,
    *,
    parser_strategy: str = "auto",
    index_profile: str = "quality",
    use_fast: bool = False,
) -> ParsedDocumentResult:
    strategy = str(parser_strategy or "auto").strip().lower() or "auto"
    profile = str(index_profile or "quality").strip().lower() or "quality"
    suffix = source_path.suffix.lower()
    fallback_chain: list[str] = []
    preferred_use_fast = use_fast or profile == "fast" or strategy == "fast"

    if strategy == "docling":
        result = _extract_with_docling(source_path)
        if result is None:
            raise RuntimeError(f"Docling extraction unavailable for {source_path.name}")
        return _finalize_parse_result(
            source_path,
            result["markdown"],
            parser_used="docling",
            parser_strategy=strategy,
            fallback_chain=fallback_chain,
            structure_hint=result.get("structure"),
        )

    if strategy == "marker":
        markdown = _extract_pdf_markdown(source_path, use_fast=False)
        if not markdown.strip():
            raise RuntimeError(f"marker extraction unavailable for {source_path.name}")
        return _finalize_parse_result(
            source_path,
            markdown,
            parser_used="marker",
            parser_strategy=strategy,
            fallback_chain=fallback_chain,
        )

    if strategy == "fast":
        markdown = _extract_fast_text(source_path)
        if not markdown.strip():
            raise RuntimeError(f"fast extraction unavailable for {source_path.name}")
        return _finalize_parse_result(
            source_path,
            markdown,
            parser_used="fast",
            parser_strategy=strategy,
            fallback_chain=fallback_chain,
        )

    if strategy == "auto":
        if not preferred_use_fast and _docling_enabled() and _supports_docling_suffix(suffix):
            docling_result = _extract_with_docling(source_path)
            if docling_result is not None:
                finalized = _finalize_parse_result(
                    source_path,
                    docling_result["markdown"],
                    parser_used="docling",
                    parser_strategy=strategy,
                    fallback_chain=fallback_chain,
                    structure_hint=docling_result.get("structure"),
                )
                if _passes_quality_gate(finalized.quality_report):
                    return finalized
                fallback_chain.append("docling")
                logger.info("Docling quality gate failed for %s; falling back", source_path.name)

        if suffix == ".pdf":
            markdown = _extract_pdf_markdown(source_path, use_fast=preferred_use_fast)
            parser_used = "fast" if preferred_use_fast else "marker"
            if markdown.strip():
                return _finalize_parse_result(
                    source_path,
                    markdown,
                    parser_used=parser_used,
                    parser_strategy=strategy,
                    fallback_chain=fallback_chain,
                )
            fallback_chain.append(parser_used)

        markdown = _extract_fast_text(source_path)
        if markdown.strip():
            return _finalize_parse_result(
                source_path,
                markdown,
                parser_used="fast",
                parser_strategy=strategy,
                fallback_chain=fallback_chain,
            )

    raise RuntimeError(f"Could not extract document payload from {source_path.name}")


def extract_text_from_path(source_path: Path, use_fast: bool = False) -> str:
    result = extract_document_payload(
        source_path,
        parser_strategy="fast" if use_fast else "auto",
        index_profile="fast" if use_fast else "quality",
        use_fast=use_fast,
    )
    return result.text


def _finalize_parse_result(
    source_path: Path,
    markdown: str,
    *,
    parser_used: str,
    parser_strategy: str,
    fallback_chain: list[str],
    structure_hint: dict[str, Any] | None = None,
) -> ParsedDocumentResult:
    normalized = _normalize_markdown(markdown)
    structure = structure_hint or _build_structure_from_markdown(normalized, source_path.name)
    quality_report = _build_quality_report(normalized, structure)
    artifacts = [
        ParsedDocumentArtifact(
            kind="normalized_markdown",
            filename=f"{source_path.stem}.normalized.md",
            content=normalized,
            content_type="text/markdown",
        ),
        ParsedDocumentArtifact(
            kind="structure_json",
            filename=f"{source_path.stem}.structure.json",
            content=json.dumps(structure, ensure_ascii=False, indent=2),
            content_type="application/json",
        ),
        ParsedDocumentArtifact(
            kind="quality_report_json",
            filename=f"{source_path.stem}.quality_report.json",
            content=json.dumps(quality_report, ensure_ascii=False, indent=2),
            content_type="application/json",
        ),
    ]
    return ParsedDocumentResult(
        text=normalized,
        normalized_markdown=normalized,
        structure=structure,
        quality_report=quality_report,
        parser_used=parser_used,
        parser_strategy=parser_strategy,
        fallback_chain=list(fallback_chain),
        artifacts=artifacts,
    )
