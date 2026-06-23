"""Compatibility facade for extracted document indexing extractors."""
from __future__ import annotations

from importlib import import_module as _import_module

_impl = _import_module("backend.application.architecture_facades.indexing_job_extractors_impl")

for _name in dir(_impl):
    if not (_name.startswith("__") and _name.endswith("__")):
        globals()[_name] = getattr(_impl, _name)

_PATCHABLE = (
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
)


def _sync_patchable_helpers() -> None:
    for _name in _PATCHABLE:
        if _name in globals():
            setattr(_impl, _name, globals()[_name])


def extract_document_payload(*args, **kwargs):
    _sync_patchable_helpers()
    return _impl.extract_document_payload(*args, **kwargs)


def extract_text_from_path(*args, **kwargs):
    _sync_patchable_helpers()
    return _impl.extract_text_from_path(*args, **kwargs)

__all__ = [
    _name for _name in globals()
    if not (_name.startswith("__") and _name.endswith("__"))
    and _name not in {"_import_module", "_impl"}
]
