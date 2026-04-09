"""
Async indexing job service.

Manages background document indexing tasks with status tracking in MongoDB.
Uses asyncio.create_task for in-process background work (no Celery needed).
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from backend.core.database import db
from backend.config import Config
from backend.services.file_asset_service import register_file_asset

logger = logging.getLogger(__name__)

COLLECTION = "indexing_jobs"


async def create_job(
    course_id: str,
    filename: str,
    content_bytes: bytes,
    user_id: str,
) -> dict:
    """Create a new indexing job and start processing in the background.

    Returns the job document with id, status, etc.
    If an identical file (same course + filename + content hash) was already
    indexed, returns a fast "duplicate" response without re-indexing.
    """
    content_hash = hashlib.sha256(content_bytes).hexdigest()

    # Check for duplicate: same course, filename, content hash, already done
    existing = await db[COLLECTION].find_one({
        "course_id": course_id,
        "filename": filename,
        "content_hash": content_hash,
        "status": "done",
    }, sort=[("created_at", -1)])

    if existing:
        logger.info("Skipping duplicate index: course=%s file=%s hash=%s", course_id, filename, content_hash[:12])
        return {
            "job_id": existing["job_id"],
            "status": "done",
            "filename": filename,
            "content_hash": content_hash,
            "duplicate": True,
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
        "file_size": len(content_bytes),
        "user_id": user_id,
        "status": "pending",  # pending -> processing -> done | failed
        "error": None,
        "result": None,
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
            metadata={"job_id": job_id, "content_hash": content_hash},
        )
    except Exception:
        logger.exception("Failed to register knowledge source file asset")

    # Fire-and-forget background task
    asyncio.create_task(_process_job(job_id, course_id, filename))

    return {
        "job_id": job_id,
        "status": "pending",
        "filename": filename,
        "content_hash": content_hash,
    }


async def get_job_status(job_id: str) -> Optional[dict]:
    """Return the current status of an indexing job."""
    doc = await db[COLLECTION].find_one({"job_id": job_id}, {"_id": 0})
    if doc and "created_at" in doc:
        doc["created_at"] = doc["created_at"].isoformat()
    if doc and "updated_at" in doc:
        doc["updated_at"] = doc["updated_at"].isoformat()
    return doc


async def _update_status(job_id: str, status: str, **extra) -> None:
    update = {"status": status, "updated_at": datetime.now(timezone.utc)}
    update.update(extra)
    await db[COLLECTION].update_one({"job_id": job_id}, {"$set": update})


async def _process_job(
    job_id: str,
    course_id: str,
    filename: str,
) -> None:
    """Background coroutine that extracts text and indexes it."""
    try:
        await _update_status(job_id, "processing")

        source_path = Path(Config.BASE_DIR) / "uploads" / "knowledge_base" / course_id / f"{job_id}_{filename}"

        # Extract text (run blocking I/O in executor)
        text = await asyncio.get_event_loop().run_in_executor(
            None, _extract_text_from_path, source_path
        )

        if not text or not text.strip():
            await _update_status(job_id, "failed", error="Could not extract any text from the file")
            return

        # Index (also blocking — ChromaDB operations)
        from backend.services.course_rag_service import course_rag_service
        result = await asyncio.get_event_loop().run_in_executor(
            None, course_rag_service.index_document, course_id, filename, text
        )

        vectorstore_path = Path(Config.RAG_VECTORSTORE_DIR) / "courses" / course_id
        try:
            existing_vector_asset = await db.file_assets.find_one(
                {"file_type": "knowledge_vectorstore", "owner_type": "course", "owner_id": course_id}
            )
            if not existing_vector_asset:
                await register_file_asset(
                    file_type="knowledge_vectorstore",
                    storage_path=vectorstore_path.relative_to(Path(Config.BASE_DIR)).as_posix(),
                    size=0,
                    owner_type="course",
                    owner_id=course_id,
                    created_by="system",
                    filename=f"course_{course_id}_vectorstore",
                    course_id=course_id,
                    scope="knowledge",
                    metadata={"managed_by": "course_rag_service"},
                )
        except Exception:
            logger.exception("Failed to register vectorstore asset")

        await _update_status(job_id, "done", result=result)
        logger.info("Indexing job %s completed: %s", job_id, result)

    except Exception:
        logger.exception("Indexing job %s failed", job_id)
        await _update_status(job_id, "failed", error="Internal indexing error")


def _extract_text_from_path(source_path: Path) -> str:
    """Extract text from a persisted source file. Runs in thread executor."""
    suffix = source_path.suffix.lower()
    if suffix == ".pdf":
        from backend.utils.pdf_extractor import extract_text_from_pdf

        return extract_text_from_pdf(str(source_path))

    content_bytes = source_path.read_bytes()
    return content_bytes.decode("utf-8", errors="replace")
