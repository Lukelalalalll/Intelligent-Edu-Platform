"""Course material indexing endpoints — teacher only."""

import logging
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request

from backend.config import Config
from backend.core.database import db
from backend.core.security import get_current_user

from .router import ai_router

logger = logging.getLogger(__name__)


async def _verify_course_ownership(user: dict, course_id: str) -> None:
    """Verify that a teacher owns the given course_id. Admins bypass the check.

    Raises HTTPException(403) if the teacher does not own the course.
    """
    role = user.get("role", "student")
    if role == "admin":
        return  # admins may manage any course

    from backend.routes.auth_routes import get_profile_courses
    try:
        profile = await get_profile_courses(user)
        owned_ids = {str(c.get("courseId") or c.get("id") or "") for c in profile.get("courses", [])}
        if course_id not in owned_ids:
            raise HTTPException(403, "You do not own this course")
    except HTTPException:
        raise
    except Exception:
        # If we cannot resolve ownership, fail-closed
        raise HTTPException(403, "Unable to verify course ownership")


@ai_router.get("/index-course/summary")
async def index_course_summary(user: dict = Depends(get_current_user)):
    """Return a summary of all courses with indexed documents. Teachers / admins only."""
    if user.get("role", "student") not in ("teacher", "admin"):
        raise HTTPException(403, "Only teachers can view index summary")

    from backend.services.course_rag_service import course_rag_service

    return {"courses": course_rag_service.get_index_summary()}


@ai_router.post("/index-course/{course_id}")
async def index_course_material(
    course_id: str,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Upload a PDF or text file and index it into the course vector store.

    Only teachers / admins may call this endpoint.
    Accepts multipart/form-data with a single file field named ``file``.
    Returns a job_id for async status polling.
    """
    if user.get("role", "student") not in ("teacher", "admin"):
        raise HTTPException(403, "Only teachers can index course materials")

    await _verify_course_ownership(user, course_id)

    form = await request.form()
    upload = form.get("file")
    if upload is None:
        raise HTTPException(400, "No file provided")

    chapter_id = str(form.get("chapter_id") or "").strip()
    if not chapter_id:
        raise HTTPException(400, "chapter_id is required. Please select a chapter before upload.")

    chapter = await db.diagnostic_chapters.find_one(
        {
            "chapter_id": chapter_id,
            "course_id": course_id,
            "diagnostic_enabled": True,
        },
        {"_id": 1},
    )
    if not chapter:
        raise HTTPException(404, "Selected chapter not found for this course or is disabled")

    filename: str = getattr(upload, "filename", "untitled")
    content_bytes: bytes = await upload.read()
    if len(content_bytes) == 0:
        raise HTTPException(400, "Empty file")
    if len(content_bytes) > 20 * 1024 * 1024:  # 20 MB limit
        raise HTTPException(413, "File too large (max 20 MB)")

    from backend.services.indexing_job_service import create_job

    user_id = str(user.get("_id", user.get("id", "")))
    job = await create_job(course_id, filename, content_bytes, user_id, chapter_id=chapter_id)
    return job


@ai_router.get("/index-course/job/{job_id}")
async def get_indexing_job_status(
    job_id: str,
    user: dict = Depends(get_current_user),
):
    """Poll the status of an async indexing job."""
    if user.get("role", "student") not in ("teacher", "admin"):
        raise HTTPException(403, "Only teachers can check indexing status")

    from backend.services.indexing_job_service import get_job_status

    job = await get_job_status(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@ai_router.get("/index-course/{course_id}")
async def list_indexed_documents(
    course_id: str,
    user: dict = Depends(get_current_user),
):
    """List all indexed documents for a course. Teachers / admins only."""
    if user.get("role", "student") not in ("teacher", "admin"):
        raise HTTPException(403, "Only teachers can view indexed materials")

    await _verify_course_ownership(user, course_id)

    from backend.services.course_rag_service import course_rag_service

    docs = course_rag_service.list_indexed_documents(course_id)
    return {"course_id": course_id, "documents": docs}


@ai_router.delete("/index-course/{course_id}/{doc_name}")
async def remove_indexed_document(
    course_id: str,
    doc_name: str,
    user: dict = Depends(get_current_user),
):
    """Remove a single document from the course vector store. Teachers / admins only."""
    if user.get("role", "student") not in ("teacher", "admin"):
        raise HTTPException(403, "Only teachers can remove indexed materials")

    await _verify_course_ownership(user, course_id)

    from backend.services.course_rag_service import course_rag_service

    removed = course_rag_service.remove_document(course_id, doc_name)
    if not removed:
        raise HTTPException(404, "Document not found in index")

    now = datetime.now(timezone.utc)
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
    user: dict = Depends(get_current_user),
):
    """Test retrieval quality: given a query, return top-k chunks from the course.

    Body: { "query": str, "top_k": int (optional, default 5) }
    Teachers / admins only.
    """
    if user.get("role", "student") not in ("teacher", "admin"):
        raise HTTPException(403, "Only teachers can test retrieval")

    await _verify_course_ownership(user, course_id)

    query = str(body.get("query", "")).strip()
    if not query:
        raise HTTPException(400, "Query is required")

    chapter_id = str(body.get("chapter_id", "") or "").strip()
    top_k = min(int(body.get("top_k", 5)), 20)

    from backend.services.course_rag_service import course_rag_service
    import time

    start = time.perf_counter()
    results = course_rag_service.retrieve_for_student(
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
