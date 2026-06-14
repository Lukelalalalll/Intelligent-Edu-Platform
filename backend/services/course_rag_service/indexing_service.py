"""Compatibility facade for extracted course RAG indexing workflows."""
from __future__ import annotations

from importlib import import_module as _import_module

_impl = _import_module("backend.application.architecture_facades.course_rag_indexing_service_impl")

for _name in dir(_impl):
    if not (_name.startswith("__") and _name.endswith("__")):
        globals()[_name] = getattr(_impl, _name)


def _sync_patchable_helpers() -> None:
    for _name in ("opensearch_enabled", "sync_course_sparse_index", "_invalidate_course_cache"):
        if _name in globals():
            setattr(_impl, _name, globals()[_name])


class CourseRagIndexingService(_impl.CourseRagIndexingService):
    def _sync_opensearch_active_version(self, course_id: str, index_version: str) -> None:
        _sync_patchable_helpers()
        return super()._sync_opensearch_active_version(course_id, index_version)

__all__ = [
    _name for _name in globals()
    if not (_name.startswith("__") and _name.endswith("__"))
    and _name not in {"_import_module", "_impl"}
]
