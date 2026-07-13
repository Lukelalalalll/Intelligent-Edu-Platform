"""Async indexing job service facade."""
from __future__ import annotations

from backend.application.architecture_facades.indexing_job.facade import (
    _reuse_existing_index,
    _run_dispatched_indexing_job,
    _verify_index_build,
    create_job,
    get_job_status,
    mark_document_removed,
)

__all__ = [
    "create_job",
    "get_job_status",
    "mark_document_removed",
    "_run_dispatched_indexing_job",
    "_reuse_existing_index",
    "_verify_index_build",
]
