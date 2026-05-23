"""Course material indexing endpoints — teacher only."""

import logging
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request

from backend.config import Config
from backend.core.database import db
from backend.core.dependencies import require_teacher_or_admin

from .router import ai_router

logger = logging.getLogger(__name__)


async def _verify_course_ownership(user: dict, course_id: str) -> None:
    """Verify that a teacher owns the given course_id. Admins bypass the check.

    Raises HTTPException(403) if the teacher does not own the course.
    """
    role = user.get("role", "student")
    if role == "admin":
        return  # admins may manage any course

    from backend.services.enrollment_service import get_user_course_profile
    try:
        profile = await get_user_course_profile(user)
        owned_ids = {str(c.get("courseId") or c.get("id") or "") for c in profile.get("courses", [])}
        if course_id not in owned_ids:
            raise HTTPException(403, "You do not own this course")
    except HTTPException:
        raise
    except Exception:
        # If we cannot resolve ownership, fail-closed
        raise HTTPException(403, "Unable to verify course ownership")


@ai_router.get("/index-course/summary")
async def index_course_summary(user: dict = Depends(require_teacher_or_admin)):
    """Return a summary of all courses with indexed documents. Teachers / admins only."""
    from backend.services.course_rag_service import course_rag_service

    return {"courses": course_rag_service.get_index_summary()}


@ai_router.post("/index-course/{course_id}")
async def index_course_material(
    course_id: str,
    request: Request,
    user: dict = Depends(require_teacher_or_admin),
):
    """Upload a PDF or text file and index it into the course vector store.

    Only teachers / admins may call this endpoint.
    Accepts multipart/form-data with a single file field named ``file``.
    Returns a job_id for async status polling.
    """
    await _verify_course_ownership(user, course_id)

    form = await request.form()
    upload = form.get("file")
    if upload is None:
        raise HTTPException(400, "No file provided")

    chapter_id = str(form.get("chapter_id") or "").strip() or None
    use_fast_extract = str(form.get("use_fast_extract") or "").lower() in ("true", "1", "yes")

    filename: str = getattr(upload, "filename", "untitled")
    content_bytes: bytes = await upload.read()
    if len(content_bytes) == 0:
        raise HTTPException(400, "Empty file")
    if len(content_bytes) > 20 * 1024 * 1024:  # 20 MB limit
        raise HTTPException(413, "File too large (max 20 MB)")

    from backend.services.indexing_job_service import create_job

    user_id = str(user.get("_id", user.get("id", "")))
    job = await create_job(course_id, filename, content_bytes, user_id, chapter_id=chapter_id, use_fast_extract=use_fast_extract)
    return job


@ai_router.get("/index-course/job/{job_id}")
async def get_indexing_job_status(
    job_id: str,
    user: dict = Depends(require_teacher_or_admin),
):
    """Poll the status of an async indexing job."""
    from backend.services.indexing_job_service import get_job_status

    job = await get_job_status(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@ai_router.get("/index-course/{course_id}")
async def list_indexed_documents(
    course_id: str,
    user: dict = Depends(require_teacher_or_admin),
):
    """List all indexed documents for a course. Teachers / admins only."""
    await _verify_course_ownership(user, course_id)

    from backend.services.course_rag_service import course_rag_service

    docs = course_rag_service.list_indexed_documents(course_id)
    logger.debug("list_indexed_documents course=%s returning %d docs", course_id, len(docs))
    return {"course_id": course_id, "documents": docs}


@ai_router.delete("/index-course/{course_id}/{doc_name}")
async def remove_indexed_document(
    course_id: str,
    doc_name: str,
    user: dict = Depends(require_teacher_or_admin),
):
    """Remove a single document from the course vector store. Teachers / admins only."""
    await _verify_course_ownership(user, course_id)

    from backend.services.course_rag_service import course_rag_service

    removed = course_rag_service.remove_document(course_id, doc_name)
    if not removed:
        raise HTTPException(404, "Document not found in index")

    now = datetime.now(timezone.utc)

    # Invalidate old indexing jobs so re-uploading the same file won't be
    # short-circuited by the duplicate detection in indexing_job_service.
    await db.indexing_jobs.update_many(
        {
            "course_id": course_id,
            "filename": doc_name,
            "status": "done",
        },
        {"$set": {"status": "deleted", "updated_at": now}},
    )

    await db.file_assets.update_many(
        {
            "file_type": "knowledge_source",
            "course_id": course_id,
            "filename": doc_name,
            "status": {"$ne": "hard_deleted"},
        },
        {
            "$set": {
                "status": "soft_deleted",
                "deleted_at": now,
                "updated_at": now,
                "delete_reason": "Removed from course index",
            }
        },
    )
    return {"ok": True}


@ai_router.post("/index-course/{course_id}/test-retrieval")
async def test_retrieval(
    course_id: str,
    body: dict,
    user: dict = Depends(require_teacher_or_admin),
):
    """Test retrieval quality: given a query, return top-k chunks from the course.

    Body: { "query": str, "top_k": int (optional, default 5) }
    Teachers / admins only.
    """
    await _verify_course_ownership(user, course_id)

    query = str(body.get("query", "")).strip()
    if not query:
        raise HTTPException(400, "Query is required")

    chapter_id = str(body.get("chapter_id", "") or "").strip()
    top_k = min(int(body.get("top_k", 5)), 20)

    from backend.services.course_rag_service import course_rag_service
    import time

    start = time.perf_counter()
    results = await course_rag_service.retrieve_for_student(
        student_id="test_teacher",
        query=query,
        top_k=top_k,
        course_ids=[course_id],
        chapter_id=chapter_id,
    )
    latency_ms = round((time.perf_counter() - start) * 1000, 1)

    return {
        "query": query,
        "course_id": course_id,
        "top_k": top_k,
        "latency_ms": latency_ms,
        "results": results,
    }
