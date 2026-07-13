from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from backend.config import Config
from backend.core.database import db
from backend.repositories import indexing_job_repo

COLLECTION = "indexing_jobs"
INDEXING_DISPATCH_JOB_TYPE = "indexing.process"


def build_source_rel_path(*, course_id: str, job_id: str, filename: str) -> Path:
    return Path("uploads") / "knowledge_base" / course_id / f"{job_id}_{filename}"


def build_source_abs_path(*, course_id: str, job_id: str, filename: str) -> Path:
    return Path(Config.BASE_DIR) / build_source_rel_path(course_id=course_id, job_id=job_id, filename=filename)


def ensure_course_upload_dir(course_id: str) -> Path:
    course_dir = Path(Config.KNOWLEDGE_BASE_UPLOAD_DIR) / course_id
    course_dir.mkdir(parents=True, exist_ok=True)
    return course_dir


async def find_completed_duplicate(
    *,
    course_id: str,
    filename: str,
    content_hash: str,
    chapter_id: str,
) -> Optional[dict]:
    return await db[COLLECTION].find_one(
        {
            "course_id": course_id,
            "filename": filename,
            "content_hash": content_hash,
            "chapter_id": chapter_id,
            "status": "done",
        },
        sort=[("created_at", -1)],
    )


def build_job_document(
    *,
    job_id: str,
    course_id: str,
    filename: str,
    content_hash: str,
    file_size: int,
    user_id: str,
    chapter_id: str,
    use_fast_extract: bool,
    index_profile: str,
    parser_strategy: str,
    force_reindex: bool,
    source_rel_path: Path,
) -> dict:
    now = datetime.now(timezone.utc)
    return {
        "job_id": job_id,
        "course_id": course_id,
        "filename": filename,
        "content_hash": content_hash,
        "normalized_hash": "",
        "file_size": file_size,
        "user_id": user_id,
        "chapter_id": chapter_id,
        "use_fast_extract": use_fast_extract,
        "index_profile": index_profile,
        "parser_strategy": parser_strategy,
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


async def insert_job(job_doc: dict) -> None:
    await db[COLLECTION].insert_one(job_doc)


async def get_job_status(job_id: str) -> Optional[dict]:
    doc = await db[COLLECTION].find_one({"job_id": job_id}, {"_id": 0})
    if doc and "created_at" in doc:
        doc["created_at"] = doc["created_at"].isoformat()
    if doc and "updated_at" in doc:
        doc["updated_at"] = doc["updated_at"].isoformat()
    return doc


async def mark_document_removed(*, course_id: str, filename: str) -> None:
    await indexing_job_repo.mark_deleted_jobs(
        course_id=course_id,
        filename=filename,
        now=datetime.now(timezone.utc),
    )


async def update_status(job_id: str, status: str, **extra) -> None:
    update = {"status": status, "updated_at": datetime.now(timezone.utc)}
    update.update(extra)
    await db[COLLECTION].update_one({"job_id": job_id}, {"$set": update})


async def update_progress(job_id: str, progress: int, phase: str = "") -> None:
    fields: dict = {"progress": progress, "updated_at": datetime.now(timezone.utc)}
    if phase:
        fields["phase"] = phase
    await db[COLLECTION].update_one({"job_id": job_id}, {"$set": fields})


async def update_phase_timing(job_id: str, phase: str, started_at: float, ended_at: float) -> None:
    duration_ms = round(max(0.0, ended_at - started_at) * 1000, 1)
    await db[COLLECTION].update_one(
        {"job_id": job_id},
        {"$set": {f"phase_timings.{phase}": duration_ms, "updated_at": datetime.now(timezone.utc)}},
    )


async def set_job_dispatch_id(*, job_id: str, dispatch_job_id: str) -> None:
    await indexing_job_repo.set_dispatch_job_id(
        job_id=job_id,
        dispatch_job_id=dispatch_job_id,
        now=datetime.now(timezone.utc),
    )


async def load_job_user_id(job_id: str) -> str:
    return str((await indexing_job_repo.find_job(job_id, {"user_id": 1}) or {}).get("user_id", "system"))


async def update_processing_metadata(
    *,
    job_id: str,
    normalized_hash: str,
    parser_used: str,
    fallback_chain: list[str],
    quality_report: dict,
    artifact_refs: list[dict[str, str]],
    index_version: str,
) -> None:
    await db[COLLECTION].update_one(
        {"job_id": job_id},
        {
            "$set": {
                "normalized_hash": normalized_hash,
                "parser_used": parser_used,
                "fallback_chain": fallback_chain,
                "quality_report": quality_report,
                "artifact_refs": artifact_refs,
                "index_version": index_version,
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )


async def find_done_job_by_normalized_hash(
    *,
    course_id: str,
    normalized_hash: str,
    filename: str,
) -> Optional[dict]:
    return await db[COLLECTION].find_one(
        {
            "course_id": course_id,
            "normalized_hash": normalized_hash,
            "status": "done",
            "filename": {"$ne": filename},
        },
        sort=[("created_at", -1)],
    )
