from __future__ import annotations

import hashlib
import logging
import uuid

from backend.config import Config
from backend.services.background_job_dispatcher import background_job_dispatcher
from backend.services.background_job_runtime import spawn_background_coro

from .artifact_registry import persist_source_file, register_source_asset
from .index_reuse import reuse_existing_index as _reuse_existing_index
from .index_reuse import verify_index_build as _verify_index_build
from .job_runtime import run_dispatched_indexing_job as _run_dispatched_indexing_job
from .job_store import (
    INDEXING_DISPATCH_JOB_TYPE,
    build_job_document,
    find_completed_duplicate,
    get_job_status,
    insert_job,
    mark_document_removed,
    set_job_dispatch_id,
)

logger = logging.getLogger(__name__)


async def create_job(
    course_id: str,
    filename: str,
    content_bytes: bytes,
    user_id: str,
    chapter_id: str = "",
    use_fast_extract: bool = False,
    *,
    index_profile: str = "",
    parser_strategy: str = "",
    force_reindex: bool = False,
) -> dict:
    content_hash = hashlib.sha256(content_bytes).hexdigest()
    logger.debug("create_job: course=%s file=%s hash=%s", course_id, filename, content_hash[:12])
    profile = (index_profile or "").strip().lower() or (
        "fast" if use_fast_extract else str(getattr(Config, "RAG_INDEX_DEFAULT_PROFILE", "quality") or "quality")
    )
    strategy = (parser_strategy or "").strip().lower() or (
        "fast" if use_fast_extract else str(getattr(Config, "RAG_INDEX_DEFAULT_PARSER_STRATEGY", "auto") or "auto")
    )
    chapter = str(chapter_id or "")

    if not force_reindex:
        existing = await find_completed_duplicate(
            course_id=course_id,
            filename=filename,
            content_hash=content_hash,
            chapter_id=chapter,
        )
        if existing:
            from backend.services.course_rag_service import course_rag_service

            indexed_names = {d["doc_name"] for d in course_rag_service.list_indexed_documents(course_id)}
            if filename in indexed_names:
                logger.info("Skipping duplicate index: course=%s file=%s hash=%s", course_id, filename, content_hash[:12])
                return {
                    "job_id": existing["job_id"],
                    "status": "done",
                    "filename": filename,
                    "content_hash": content_hash,
                    "duplicate": True,
                    "index_version": existing.get("index_version", ""),
                }

    job_id = str(uuid.uuid4())
    source_rel_path = persist_source_file(
        course_id=course_id,
        job_id=job_id,
        filename=filename,
        content_bytes=content_bytes,
    )
    await insert_job(
        build_job_document(
            job_id=job_id,
            course_id=course_id,
            filename=filename,
            content_hash=content_hash,
            file_size=len(content_bytes),
            user_id=user_id,
            chapter_id=chapter,
            use_fast_extract=use_fast_extract,
            index_profile=profile,
            parser_strategy=strategy,
            force_reindex=force_reindex,
            source_rel_path=source_rel_path,
        )
    )
    await register_source_asset(
        source_rel_path=source_rel_path,
        file_size=len(content_bytes),
        job_id=job_id,
        filename=filename,
        course_id=course_id,
        user_id=user_id,
        content_hash=content_hash,
        chapter_id=chapter,
    )

    dispatch_job = await background_job_dispatcher.enqueue(
        job_type=INDEXING_DISPATCH_JOB_TYPE,
        payload={
            "job_id": job_id,
            "course_id": course_id,
            "filename": filename,
            "chapter_id": chapter,
            "use_fast_extract": bool(use_fast_extract),
            "index_profile": profile,
            "parser_strategy": strategy,
            "force_reindex": bool(force_reindex),
        },
        metadata={"owner_collection": "indexing_jobs", "owner_job_id": job_id},
    )
    await set_job_dispatch_id(job_id=job_id, dispatch_job_id=dispatch_job["job_id"])
    spawn_background_coro(
        _run_dispatched_indexing_job(dispatch_job["job_id"], job_id),
        label=f"indexing-job:{job_id}",
    )
    return {
        "job_id": job_id,
        "status": "pending",
        "filename": filename,
        "content_hash": content_hash,
        "index_profile": profile,
        "parser_strategy": strategy,
    }
