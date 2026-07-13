from __future__ import annotations

from backend.application.architecture_facades.indexing_job_extractors.docling_adapter import (
    _docling_enabled,
    _extract_with_docling,
    _supports_docling_suffix,
)
from backend.application.architecture_facades.indexing_job_extractors.entrypoints import (
    ParsedDocumentArtifact,
    ParsedDocumentResult,
    _finalize_parse_result,
)
from backend.application.architecture_facades.indexing_job_extractors.format_extractors import (
    _extract_fast_text,
    _extract_pdf_markdown,
    _extract_text_from_docx,
    _extract_text_from_pptx,
    _extract_text_from_xlsx,
    _strip_html,
    _strip_markdown,
)
from backend.application.architecture_facades.indexing_job_extractors.quality import (
    _build_quality_report,
    _passes_quality_gate,
)
from backend.application.architecture_facades.indexing_job_extractors.structure import (
    _build_structure_from_markdown,
    _looks_like_formula,
    _normalize_markdown,
)
from backend.application.architecture_facades.indexing_job_extractors import (
    docling_adapter,
    entrypoints,
    format_extractors,
    quality,
    structure,
)

_PATCH_TARGETS = {
    "_docling_enabled": (docling_adapter, entrypoints),
    "_extract_with_docling": (docling_adapter, entrypoints),
    "_supports_docling_suffix": (docling_adapter, entrypoints),
    "_extract_pdf_markdown": (format_extractors, entrypoints),
    "_extract_fast_text": (format_extractors, entrypoints),
    "_extract_text_from_docx": (format_extractors,),
    "_extract_text_from_pptx": (format_extractors,),
    "_extract_text_from_xlsx": (format_extractors,),
    "_strip_markdown": (format_extractors,),
    "_strip_html": (format_extractors,),
    "_finalize_parse_result": (entrypoints,),
    "_normalize_markdown": (structure, entrypoints),
    "_build_structure_from_markdown": (structure, entrypoints),
    "_build_quality_report": (quality, entrypoints),
    "_passes_quality_gate": (quality, entrypoints),
    "_looks_like_formula": (structure,),
}


def _sync_patchable_helpers() -> None:
    for name, targets in _PATCH_TARGETS.items():
        for target in targets:
            setattr(target, name, globals()[name])


def extract_document_payload(*args, **kwargs):
    _sync_patchable_helpers()
    return entrypoints.extract_document_payload(*args, **kwargs)


def extract_text_from_path(*args, **kwargs):
    _sync_patchable_helpers()
    return entrypoints.extract_text_from_path(*args, **kwargs)


__all__ = [
    "ParsedDocumentArtifact",
    "ParsedDocumentResult",
    "extract_document_payload",
    "extract_text_from_path",
    "_docling_enabled",
    "_extract_with_docling",
    "_extract_pdf_markdown",
    "_extract_fast_text",
    "_extract_text_from_docx",
    "_extract_text_from_pptx",
    "_extract_text_from_xlsx",
    "_strip_markdown",
    "_strip_html",
    "_finalize_parse_result",
    "_normalize_markdown",
    "_build_structure_from_markdown",
    "_build_quality_report",
    "_passes_quality_gate",
    "_looks_like_formula",
    "_supports_docling_suffix",
]
