from __future__ import annotations

import asyncio
import hashlib
import logging
from datetime import datetime, timezone

from backend.config import Config
from backend.repositories import indexing_job_repo
from backend.services.background_job_dispatcher import background_job_dispatcher

from ..indexing_job_extractors import extract_document_payload
from .artifact_registry import register_artifacts
from .index_reuse import build_source_hash, reuse_existing_index, verify_index_build
from .job_store import (
    INDEXING_DISPATCH_JOB_TYPE,
    build_source_abs_path,
    find_done_job_by_normalized_hash,
    load_job_user_id,
    update_phase_timing,
    update_processing_metadata,
    update_progress,
    update_status,
)

logger = logging.getLogger(__name__)


async def run_dispatched_indexing_job(dispatch_job_id: str, job_id: str) -> None:
    worker_id = f"api-indexing-{job_id}"
    claimed = await background_job_dispatcher.claim(
        worker_id=worker_id,
        job_types=[INDEXING_DISPATCH_JOB_TYPE],
        job_id=dispatch_job_id,
        lease_seconds=900,
    )
    if not claimed:
        return

    payload = dict(claimed.get("payload") or {})
    await process_job(
        str(payload.get("job_id") or job_id),
        str(payload.get("course_id") or ""),
        str(payload.get("filename") or ""),
        chapter_id=str(payload.get("chapter_id") or ""),
        use_fast_extract=bool(payload.get("use_fast_extract")),
        index_profile=str(payload.get("index_profile") or ""),
        parser_strategy=str(payload.get("parser_strategy") or ""),
    )

    current = await indexing_job_repo.find_job(job_id, {"status": 1, "error": 1, "job_id": 1})
    if (current or {}).get("status") == "done":
        await background_job_dispatcher.mark_done(
            job_id=dispatch_job_id,
            worker_id=worker_id,
            result={"indexing_job_id": job_id, "status": "done"},
        )
        return

    await background_job_dispatcher.mark_failed(
        job_id=dispatch_job_id,
        worker_id=worker_id,
        error=str((current or {}).get("error") or "Indexing job failed"),
    )


async def process_job(
    job_id: str,
    course_id: str,
    filename: str,
    chapter_id: str = "",
    use_fast_extract: bool = False,
    index_profile: str = "",
    parser_strategy: str = "",
) -> None:
    try:
        from backend.services.course_rag_service import course_rag_service

        await update_status(job_id, "processing")
        await update_progress(job_id, 5, "extracting")

        source_path = build_source_abs_path(course_id=course_id, job_id=job_id, filename=filename)
        parsed = await _extract_with_timeout(
            job_id=job_id,
            source_path=source_path,
            parser_strategy=parser_strategy,
            index_profile=index_profile,
            use_fast_extract=use_fast_extract,
        )
        await update_progress(job_id, 45, "normalizing")
        if not parsed.text.strip():
            await update_status(job_id, "failed", error="Could not extract any text from the file")
            return

        normalized_hash = hashlib.sha256(parsed.normalized_markdown.encode("utf-8")).hexdigest()
        existing_normalized = await find_done_job_by_normalized_hash(
            course_id=course_id,
            normalized_hash=normalized_hash,
            filename=filename,
        )
        artifact_refs = await register_artifacts(
            course_id=course_id,
            job_id=job_id,
            user_id=await load_job_user_id(job_id),
            filename=filename,
            artifacts=parsed.artifacts,
            normalized_hash=normalized_hash,
        )
        index_version = course_rag_service.create_index_version(course_id)
        await update_processing_metadata(
            job_id=job_id,
            normalized_hash=normalized_hash,
            parser_used=parsed.parser_used,
            fallback_chain=parsed.fallback_chain,
            quality_report=parsed.quality_report,
            artifact_refs=artifact_refs,
            index_version=index_version,
        )
        _write_diagnostics(
            course_id=course_id,
            filename=filename,
            job_id=job_id,
            parsed=parsed,
            artifact_refs=artifact_refs,
            index_version=index_version,
        )

        if existing_normalized:
            await update_progress(job_id, 80, "reusing_index")
            reuse_result = await reuse_existing_index(
                course_id=course_id,
                filename=filename,
                chapter_id=chapter_id,
                source_hash=build_source_hash(parsed),
                normalized_hash=normalized_hash,
                parsed=parsed,
                index_version=index_version,
                artifact_refs=artifact_refs,
                existing_job=existing_normalized,
            )
            finalize_started = asyncio.get_event_loop().time()
            course_rag_service.finalize_index_build(course_id, index_version, activate=True)
            await update_phase_timing(job_id, "activate", finalize_started, asyncio.get_event_loop().time())
            await update_status(
                job_id,
                "done",
                result=reuse_result,
                parser_used=parsed.parser_used,
                quality_report=parsed.quality_report,
                artifact_refs=artifact_refs,
                index_version=index_version,
            )
            return

        await update_progress(job_id, 55, "quality_gate")
        if parsed.quality_report.get("quality_status") == "poor":
            course_rag_service.mark_index_build_failed(course_id, index_version, "Quality gate failed")
            await update_status(job_id, "failed", error="Document extraction quality too poor to index")
            return

        result = await _build_index(
            job_id=job_id,
            course_id=course_id,
            filename=filename,
            chapter_id=chapter_id,
            parsed=parsed,
            index_version=index_version,
            artifact_refs=artifact_refs,
        )
        if not result.get("indexed"):
            course_rag_service.mark_index_build_failed(course_id, index_version, str(result.get("reason") or "Indexing failed"))
            await update_status(job_id, "failed", error=str(result.get("reason") or "Indexing failed"))
            return

        await update_progress(job_id, 90, "verify")
        verify_started = asyncio.get_event_loop().time()
        verification = await verify_index_build(course_id, filename, index_version)
        await update_phase_timing(job_id, "verify", verify_started, asyncio.get_event_loop().time())
        if not verification["ok"]:
            course_rag_service.mark_index_build_failed(course_id, index_version, verification["error"])
            await update_status(job_id, "failed", error=verification["error"])
            return

        await update_progress(job_id, 97, "activate")
        activate_started = asyncio.get_event_loop().time()
        course_rag_service.finalize_index_build(course_id, index_version, activate=True)
        await update_phase_timing(job_id, "activate", activate_started, asyncio.get_event_loop().time())
        result.update(
            {
                "parser_used": parsed.parser_used,
                "quality_report": parsed.quality_report,
                "artifact_refs": artifact_refs,
                "index_version": index_version,
            }
        )
        await update_status(job_id, "done", result=result)
        logger.info("Indexing job %s completed: %s", job_id, result)
    except Exception as exc:
        logger.exception("Indexing job %s failed", job_id)
        current = await indexing_job_repo.find_job(job_id, {"course_id": 1, "index_version": 1})
        if current and current.get("index_version"):
            try:
                from backend.services.course_rag_service import course_rag_service

                course_rag_service.mark_index_build_failed(
                    str(current.get("course_id") or course_id),
                    str(current.get("index_version") or ""),
                    "Internal indexing error",
                )
            except Exception:
                logger.debug("Could not mark build failed for job=%s", job_id, exc_info=True)
        await update_status(job_id, "failed", error=str(exc) or "Internal indexing error")


async def _extract_with_timeout(
    *,
    job_id: str,
    source_path,
    parser_strategy: str,
    index_profile: str,
    use_fast_extract: bool,
):
    extract_started = asyncio.get_event_loop().time()
    loop = asyncio.get_running_loop()
    extraction_timeout = max(15.0, float(getattr(Config, "RAG_EXTRACTION_TIMEOUT_SECONDS", 180.0) or 180.0))
    try:
        parsed = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: extract_document_payload(
                    source_path,
                    parser_strategy=parser_strategy,
                    index_profile=index_profile,
                    use_fast=use_fast_extract,
                ),
            ),
            timeout=extraction_timeout,
        )
    except asyncio.TimeoutError as exc:
        raise RuntimeError(
            f"Document extraction timed out after {int(extraction_timeout)} seconds; "
            "try the Fast parser or split the file into smaller parts."
        ) from exc
    await update_phase_timing(job_id, "extract", extract_started, asyncio.get_event_loop().time())
    return parsed


async def _build_index(*, job_id: str, course_id: str, filename: str, chapter_id: str, parsed, index_version: str, artifact_refs):
    from backend.services.course_rag_service import course_rag_service

    await update_progress(job_id, 65, "indexing")
    loop = asyncio.get_event_loop()

    def progress_cb(pct: int):
        mapped = 65 + int(pct * 0.2)
        asyncio.run_coroutine_threadsafe(update_progress(job_id, mapped, "indexing"), loop)

    index_started = asyncio.get_event_loop().time()
    result = await asyncio.get_event_loop().run_in_executor(
        None,
        lambda: course_rag_service.index_document(
            course_id,
            filename,
            parsed.normalized_markdown,
            chapter_id,
            progress_cb,
            index_version=index_version,
            source_hash=build_source_hash(parsed),
            normalized_hash=hashlib.sha256(parsed.normalized_markdown.encode("utf-8")).hexdigest(),
            parser_used=parsed.parser_used,
            parser_strategy=parsed.parser_strategy,
            quality_report=parsed.quality_report,
            structure=parsed.structure,
            artifact_refs=artifact_refs,
            page_count=int(parsed.quality_report.get("page_count") or 1),
        ),
    )
    await update_phase_timing(job_id, "index", index_started, asyncio.get_event_loop().time())
    return result


def _write_diagnostics(*, course_id: str, filename: str, job_id: str, parsed, artifact_refs, index_version: str) -> None:
    from backend.services.course_rag_service import course_rag_service

    course_rag_service._store_manager.write_diagnostics(
        course_id,
        filename,
        {
            "job_id": job_id,
            "course_id": course_id,
            "doc_name": filename,
            "parser_used": parsed.parser_used,
            "parser_strategy": parsed.parser_strategy,
            "fallback_chain": parsed.fallback_chain,
            "quality_report": parsed.quality_report,
            "artifact_refs": artifact_refs,
            "index_version": index_version,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
    )
