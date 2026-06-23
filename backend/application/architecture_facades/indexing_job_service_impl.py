"""
Async indexing job service.

Manages background document indexing tasks with status tracking in MongoDB.
Uses persistent dispatcher records plus a local bridge worker for now.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from backend.config import Config
from backend.core.database import db
from backend.repositories import indexing_job_repo
from backend.services.background_job_dispatcher import background_job_dispatcher
from backend.services.background_job_runtime import spawn_background_coro
from backend.services.files.file_asset_service import register_file_asset
from backend.services.rag.indexing_job_extractors import (
    ParsedDocumentArtifact,
    ParsedDocumentResult,
    extract_document_payload,
)

logger = logging.getLogger(__name__)

COLLECTION = "indexing_jobs"
INDEXING_DISPATCH_JOB_TYPE = "indexing.process"


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
    """Create a new indexing job and start processing in the background."""
    content_hash = hashlib.sha256(content_bytes).hexdigest()
    logger.debug("create_job: course=%s file=%s hash=%s", course_id, filename, content_hash[:12])

    profile = (index_profile or "").strip().lower() or (
        "fast" if use_fast_extract else str(getattr(Config, "RAG_INDEX_DEFAULT_PROFILE", "quality") or "quality")
    )
    strategy = (parser_strategy or "").strip().lower() or (
        "fast" if use_fast_extract else str(getattr(Config, "RAG_INDEX_DEFAULT_PARSER_STRATEGY", "auto") or "auto")
    )

    existing = None
    if not force_reindex:
        existing = await db[COLLECTION].find_one(
            {
                "course_id": course_id,
                "filename": filename,
                "content_hash": content_hash,
                "chapter_id": str(chapter_id or ""),
                "status": "done",
            },
            sort=[("created_at", -1)],
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
    now = datetime.now(timezone.utc)

    course_dir = Path(Config.KNOWLEDGE_BASE_UPLOAD_DIR) / course_id
    course_dir.mkdir(parents=True, exist_ok=True)
    source_name = f"{job_id}_{filename}"
    source_rel_path = Path("uploads") / "knowledge_base" / course_id / source_name
    source_abs_path = Path(Config.BASE_DIR) / source_rel_path
    source_abs_path.write_bytes(content_bytes)

    job_doc = {
        "job_id": job_id,
        "course_id": course_id,
        "filename": filename,
        "content_hash": content_hash,
        "normalized_hash": "",
        "file_size": len(content_bytes),
        "user_id": user_id,
        "chapter_id": str(chapter_id or ""),
        "use_fast_extract": use_fast_extract,
        "index_profile": profile,
        "parser_strategy": strategy,
        "force_reindex": bool(force_reindex),
        "status": "pending",
        "phase": "pending",
        "progress": 0,
        "error": None,
        "result": None,
        "phase_timings": {},
        "parser_used": "",
        "fallback_chain": [],
        "quality_report": {},
        "artifact_refs": [],
        "index_version": "",
        "schema_version": int(getattr(Config, "RAG_INDEX_SCHEMA_VERSION", 2) or 2),
        "created_at": now,
        "updated_at": now,
        "source_path": source_rel_path.as_posix(),
    }
    await db[COLLECTION].insert_one(job_doc)

    try:
        await register_file_asset(
            file_type="knowledge_source",
            storage_path=source_rel_path.as_posix(),
            size=len(content_bytes),
            owner_type="knowledge_document",
            owner_id=job_id,
            created_by=user_id,
            filename=filename,
            course_id=course_id,
            scope="knowledge",
            user_id=user_id,
            metadata={
                "job_id": job_id,
                "content_hash": content_hash,
                "chapter_id": str(chapter_id or ""),
            },
        )
    except Exception:
        logger.exception("Failed to register knowledge source file asset")

    dispatch_job = await background_job_dispatcher.enqueue(
        job_type=INDEXING_DISPATCH_JOB_TYPE,
        payload={
            "job_id": job_id,
            "course_id": course_id,
            "filename": filename,
            "chapter_id": str(chapter_id or ""),
            "use_fast_extract": bool(use_fast_extract),
            "index_profile": profile,
            "parser_strategy": strategy,
            "force_reindex": bool(force_reindex),
        },
        metadata={"owner_collection": COLLECTION, "owner_job_id": job_id},
    )
    await indexing_job_repo.set_dispatch_job_id(
        job_id=job_id,
        dispatch_job_id=dispatch_job["job_id"],
        now=now,
    )
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


async def get_job_status(job_id: str) -> Optional[dict]:
    """Return the current status of an indexing job."""
    doc = await db[COLLECTION].find_one({"job_id": job_id}, {"_id": 0})
    if doc and "created_at" in doc:
        doc["created_at"] = doc["created_at"].isoformat()
    if doc and "updated_at" in doc:
        doc["updated_at"] = doc["updated_at"].isoformat()
    return doc


async def mark_document_removed(*, course_id: str, filename: str) -> None:
    now = datetime.now(timezone.utc)
    await indexing_job_repo.mark_deleted_jobs(course_id=course_id, filename=filename, now=now)


async def _update_status(job_id: str, status: str, **extra) -> None:
    update = {"status": status, "updated_at": datetime.now(timezone.utc)}
    update.update(extra)
    await db[COLLECTION].update_one({"job_id": job_id}, {"$set": update})


async def _update_progress(job_id: str, progress: int, phase: str = "") -> None:
    fields: dict = {"progress": progress, "updated_at": datetime.now(timezone.utc)}
    if phase:
        fields["phase"] = phase
    await db[COLLECTION].update_one({"job_id": job_id}, {"$set": fields})


async def _update_phase_timing(job_id: str, phase: str, started_at: float, ended_at: float) -> None:
    duration_ms = round(max(0.0, ended_at - started_at) * 1000, 1)
    await db[COLLECTION].update_one(
        {"job_id": job_id},
        {
            "$set": {
                f"phase_timings.{phase}": duration_ms,
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )


async def _run_dispatched_indexing_job(dispatch_job_id: str, job_id: str) -> None:
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
    await _process_job(
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


async def _process_job(
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

        await _update_status(job_id, "processing")
        await _update_progress(job_id, 5, "extracting")

        source_path = Path(Config.BASE_DIR) / "uploads" / "knowledge_base" / course_id / f"{job_id}_{filename}"

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
        extract_ended = asyncio.get_event_loop().time()
        await _update_phase_timing(job_id, "extract", extract_started, extract_ended)
        await _update_progress(job_id, 45, "normalizing")

        if not parsed.text.strip():
            await _update_status(job_id, "failed", error="Could not extract any text from the file")
            return

        normalized_hash = hashlib.sha256(parsed.normalized_markdown.encode("utf-8")).hexdigest()
        existing_normalized = await db[COLLECTION].find_one(
            {
                "course_id": course_id,
                "normalized_hash": normalized_hash,
                "status": "done",
                "filename": {"$ne": filename},
            },
            sort=[("created_at", -1)],
        )

        artifact_refs = await _register_artifacts(
            course_id=course_id,
            job_id=job_id,
            user_id=(await indexing_job_repo.find_job(job_id, {"user_id": 1}) or {}).get("user_id", "system"),
            filename=filename,
            artifacts=parsed.artifacts,
            normalized_hash=normalized_hash,
        )

        index_version = course_rag_service.create_index_version(course_id)

        await db[COLLECTION].update_one(
            {"job_id": job_id},
            {
                "$set": {
                    "normalized_hash": normalized_hash,
                    "parser_used": parsed.parser_used,
                    "fallback_chain": parsed.fallback_chain,
                    "quality_report": parsed.quality_report,
                    "artifact_refs": artifact_refs,
                    "index_version": index_version,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )

        diagnostics_payload = {
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
        }
        course_rag_service._store_manager.write_diagnostics(course_id, filename, diagnostics_payload)

        if existing_normalized:
            await _update_progress(job_id, 80, "reusing_index")
            reuse_result = await _reuse_existing_index(
                course_id=course_id,
                filename=filename,
                chapter_id=chapter_id,
                source_hash=hashlib.sha256(parsed.text.encode("utf-8")).hexdigest(),
                normalized_hash=normalized_hash,
                parsed=parsed,
                index_version=index_version,
                artifact_refs=artifact_refs,
                existing_job=existing_normalized,
            )
            finalize_started = asyncio.get_event_loop().time()
            course_rag_service.finalize_index_build(course_id, index_version, activate=True)
            finalize_ended = asyncio.get_event_loop().time()
            await _update_phase_timing(job_id, "activate", finalize_started, finalize_ended)
            await _update_status(
                job_id,
                "done",
                result=reuse_result,
                parser_used=parsed.parser_used,
                quality_report=parsed.quality_report,
                artifact_refs=artifact_refs,
                index_version=index_version,
            )
            return

        await _update_progress(job_id, 55, "quality_gate")
        quality_ok = parsed.quality_report.get("quality_status") != "poor"
        if not quality_ok:
            course_rag_service.mark_index_build_failed(course_id, index_version, "Quality gate failed")
            await _update_status(job_id, "failed", error="Document extraction quality too poor to index")
            return

        await _update_progress(job_id, 65, "indexing")
        loop = asyncio.get_event_loop()

        def _progress_cb(pct: int):
            mapped = 65 + int(pct * 0.2)
            asyncio.run_coroutine_threadsafe(_update_progress(job_id, mapped, "indexing"), loop)

        index_started = asyncio.get_event_loop().time()
        result = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: course_rag_service.index_document(
                course_id,
                filename,
                parsed.normalized_markdown,
                chapter_id,
                _progress_cb,
                index_version=index_version,
                source_hash=hashlib.sha256(parsed.text.encode("utf-8")).hexdigest(),
                normalized_hash=normalized_hash,
                parser_used=parsed.parser_used,
                parser_strategy=parsed.parser_strategy,
                quality_report=parsed.quality_report,
                structure=parsed.structure,
                artifact_refs=artifact_refs,
                page_count=int(parsed.quality_report.get("page_count") or 1),
            ),
        )
        index_ended = asyncio.get_event_loop().time()
        await _update_phase_timing(job_id, "index", index_started, index_ended)

        if not result.get("indexed"):
            course_rag_service.mark_index_build_failed(course_id, index_version, str(result.get("reason") or "Indexing failed"))
            await _update_status(job_id, "failed", error=str(result.get("reason") or "Indexing failed"))
            return

        await _update_progress(job_id, 90, "verify")
        verify_started = asyncio.get_event_loop().time()
        verification = await _verify_index_build(course_id, filename, index_version)
        verify_ended = asyncio.get_event_loop().time()
        await _update_phase_timing(job_id, "verify", verify_started, verify_ended)
        if not verification["ok"]:
            course_rag_service.mark_index_build_failed(course_id, index_version, verification["error"])
            await _update_status(job_id, "failed", error=verification["error"])
            return

        await _update_progress(job_id, 97, "activate")
        activate_started = asyncio.get_event_loop().time()
        course_rag_service.finalize_index_build(course_id, index_version, activate=True)
        activate_ended = asyncio.get_event_loop().time()
        await _update_phase_timing(job_id, "activate", activate_started, activate_ended)

        result.update(
            {
                "parser_used": parsed.parser_used,
                "quality_report": parsed.quality_report,
                "artifact_refs": artifact_refs,
                "index_version": index_version,
            }
        )
        await _update_status(job_id, "done", result=result)
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
        await _update_status(job_id, "failed", error=str(exc) or "Internal indexing error")


async def _register_artifacts(
    *,
    course_id: str,
    job_id: str,
    user_id: str,
    filename: str,
    artifacts: list[ParsedDocumentArtifact],
    normalized_hash: str,
) -> list[dict[str, str]]:
    artifact_refs: list[dict[str, str]] = []
    course_dir = Path(Config.KNOWLEDGE_BASE_UPLOAD_DIR) / course_id / "artifacts" / job_id
    course_dir.mkdir(parents=True, exist_ok=True)

    for artifact in artifacts:
        suffix = ".json" if artifact.kind.endswith("json") else ".md"
        artifact_name = f"{artifact.kind}{suffix}"
        artifact_rel = Path("uploads") / "knowledge_base" / course_id / "artifacts" / job_id / artifact_name
        artifact_abs = Path(Config.BASE_DIR) / artifact_rel
        artifact_abs.write_text(artifact.content, encoding="utf-8")
        try:
            asset = await register_file_asset(
                file_type=f"knowledge_{artifact.kind}",
                storage_path=artifact_rel.as_posix(),
                size=len(artifact.content.encode("utf-8")),
                owner_type="knowledge_document",
                owner_id=job_id,
                created_by=user_id,
                filename=f"{filename}:{artifact.filename}",
                course_id=course_id,
                scope="knowledge",
                user_id=user_id,
                metadata={"job_id": job_id, "normalized_hash": normalized_hash, "artifact_kind": artifact.kind},
            )
            artifact_refs.append(
                {
                    "kind": artifact.kind,
                    "file_id": str(asset.get("file_id") or ""),
                    "storage_path": artifact_rel.as_posix(),
                }
            )
        except Exception:
            logger.exception("Failed to register artifact asset for %s", artifact.filename)
            artifact_refs.append({"kind": artifact.kind, "file_id": "", "storage_path": artifact_rel.as_posix()})
    return artifact_refs


async def _reuse_existing_index(
    *,
    course_id: str,
    filename: str,
    chapter_id: str,
    source_hash: str,
    normalized_hash: str,
    parsed: ParsedDocumentResult,
    index_version: str,
    artifact_refs: list[dict[str, str]],
    existing_job: dict,
) -> dict[str, object]:
    from backend.services.course_rag_service import course_rag_service

    diagnostics = course_rag_service.get_document_diagnostics(course_id, str(existing_job.get("filename") or filename))
    existing_doc_name = str(existing_job.get("filename") or filename)
    active_docs = {doc["doc_name"]: doc for doc in course_rag_service.list_indexed_documents(course_id)}
    existing_doc = active_docs.get(existing_doc_name)
    if not existing_doc:
        raise RuntimeError("Normalized duplicate found but no active document metadata to reuse")

    source_active_version = course_rag_service.active_index_version(course_id)
    source_docs_meta = course_rag_service._store_manager.documents_meta(course_id, source_active_version)
    source_doc_meta = dict(source_docs_meta.get(existing_doc_name) or {})
    if not source_doc_meta:
        raise RuntimeError("Source document metadata unavailable for normalized index reuse")

    chunk_ids = list(source_doc_meta.get("chunk_ids") or [])
    if not chunk_ids:
        raise RuntimeError("Source document metadata has no chunk ids to reuse")

    store = course_rag_service._store_manager.get_store(course_id, source_active_version)
    data = store.get(ids=chunk_ids, include=["documents", "metadatas"])
    docs = list(data.get("documents") or [])
    metas = list(data.get("metadatas") or [])
    ids = list(data.get("ids") or [])
    if not ids or len(ids) != len(docs):
        raise RuntimeError("Could not materialize normalized duplicate nodes for reuse")

    target_store = course_rag_service._store_manager.get_store(course_id, index_version)
    new_ids = []
    new_metadatas = []
    texts = []
    for source_id, source_text, source_meta in zip(ids, docs, metas):
        source_meta = dict(source_meta or {})
        chunk_stable_id = str(source_meta.get("chunk_stable_id") or source_id)
        new_id = f"{chunk_stable_id}:{filename}"
        new_meta = dict(source_meta)
        new_meta.update(
            {
                "doc_name": filename,
                "chapter_id": chapter_id,
                "index_version": index_version,
                "parser_used": parsed.parser_used,
            }
        )
        new_ids.append(new_id)
        new_metadatas.append(new_meta)
        texts.append(source_text)

    batch_size = 32
    for start in range(0, len(texts), batch_size):
        end = min(start + batch_size, len(texts))
        target_store.add_texts(
            texts=texts[start:end],
            ids=new_ids[start:end],
            metadatas=new_metadatas[start:end],
        )

    cloned_meta = course_rag_service._store_manager.clone_document_metadata(
        course_id,
        from_doc_name=existing_doc_name,
        to_doc_name=filename,
        index_version=index_version,
        overrides={
            "source_hash": source_hash,
            "normalized_hash": normalized_hash,
            "hash": normalized_hash,
            "chunk_ids": new_ids,
            "chapter_id": chapter_id,
            "indexed_at": datetime.now(timezone.utc).isoformat(),
            "index_version": index_version,
            "parser_used": parsed.parser_used,
            "parser_strategy": parsed.parser_strategy,
            "quality_report": parsed.quality_report,
            "artifact_refs": artifact_refs,
            "page_count": int(parsed.quality_report.get("page_count") or source_doc_meta.get("page_count") or 1),
            "build_status": "indexed",
        },
    )
    course_rag_service._store_manager.write_diagnostics(
        course_id,
        filename,
        {
            **diagnostics,
            "job_id": existing_job.get("job_id", ""),
            "course_id": course_id,
            "doc_name": filename,
            "parser_used": parsed.parser_used,
            "parser_strategy": parsed.parser_strategy,
            "fallback_chain": parsed.fallback_chain,
            "quality_report": parsed.quality_report,
            "artifact_refs": artifact_refs,
            "index_version": index_version,
            "reused_from_job_id": existing_job.get("job_id", ""),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    return {
        "indexed": True,
        "chunk_count": int(cloned_meta.get("chunk_count", 0) or 0),
        "index_version": index_version,
        "duplicate": False,
        "reused_normalized_index": True,
    }


async def _verify_index_build(course_id: str, filename: str, index_version: str) -> dict[str, str | bool]:
    from backend.services.course_rag_service import course_rag_service

    docs = course_rag_service._store_manager.documents_meta(course_id, index_version)
    if filename not in docs:
        return {"ok": False, "error": "Indexed document missing from version metadata"}
    doc = docs[filename]
    if int(doc.get("chunk_count", 0) or 0) <= 0:
        return {"ok": False, "error": "Indexed document has zero nodes"}

    store = course_rag_service._store_manager.get_store(course_id, index_version)
    try:
        data = store.get(where={"doc_name": {"$eq": filename}}, include=["metadatas"])
    except Exception as exc:
        return {"ok": False, "error": f"Could not query built index: {exc}"}
    ids = data.get("ids") or []
    if not ids:
        return {"ok": False, "error": "No vector nodes found for indexed document"}
    return {"ok": True, "error": ""}

