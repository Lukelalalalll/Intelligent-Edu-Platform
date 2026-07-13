"""Course material indexing endpoints 鈥?teacher only."""

import logging

from fastapi import Depends, HTTPException, Request

from backend.core.dependencies import require_teacher_or_admin

from fastapi import APIRouter
router = APIRouter()

logger = logging.getLogger(__name__)


async def _verify_course_ownership(user: dict, course_id: str) -> None:
    """Verify that a teacher owns the given course_id. Admins bypass the check.

    Raises HTTPException(403) if the teacher does not own the course.
    """
    role = user.get("role", "student")
    if role == "admin":
        return  # admins may manage any course

    from backend.services.student.enrollment_service import get_user_course_profile
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


@router.get("/index-course/summary")
async def index_course_summary(user: dict = Depends(require_teacher_or_admin)):
    """Return a summary of all courses with indexed documents. Teachers / admins only."""
    from backend.services.course_rag_service import course_rag_service

    return {"courses": course_rag_service.get_index_summary()}


@router.post("/index-course/{course_id}")
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
    index_profile = str(form.get("index_profile") or "").strip().lower() or "quality"
    parser_strategy = str(form.get("parser_strategy") or "").strip().lower() or "auto"
    force_reindex = str(form.get("force_reindex") or "").lower() in ("true", "1", "yes")

    filename: str = getattr(upload, "filename", "untitled")
    content_bytes: bytes = await upload.read()
    if len(content_bytes) == 0:
        raise HTTPException(400, "Empty file")
    if len(content_bytes) > 20 * 1024 * 1024:  # 20 MB limit
        raise HTTPException(413, "File too large (max 20 MB)")

    from backend.services.rag.indexing_job_service import create_job

    user_id = str(user.get("_id", user.get("id", "")))
    job = await create_job(
        course_id,
        filename,
        content_bytes,
        user_id,
        chapter_id=chapter_id,
        use_fast_extract=use_fast_extract,
        index_profile=index_profile,
        parser_strategy=parser_strategy,
        force_reindex=force_reindex,
    )
    return job


@router.get("/index-course/job/{job_id}")
async def get_indexing_job_status(
    job_id: str,
    user: dict = Depends(require_teacher_or_admin),
):
    """Poll the status of an async indexing job."""
    from backend.services.rag.indexing_job_service import get_job_status

    job = await get_job_status(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@router.get("/index-course/{course_id}")
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


@router.get("/index-course/{course_id}/{doc_name}/diagnostics")
async def get_indexed_document_diagnostics(
    course_id: str,
    doc_name: str,
    user: dict = Depends(require_teacher_or_admin),
):
    await _verify_course_ownership(user, course_id)

    from backend.services.course_rag_service import course_rag_service

    diagnostics = course_rag_service.get_document_diagnostics(course_id, doc_name)
    if not diagnostics:
        raise HTTPException(404, "Document diagnostics not found")
    return diagnostics


@router.delete("/index-course/{course_id}/{doc_name}")
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

    from backend.services.files.file_asset_service import soft_delete_course_source_assets
    from backend.services.rag.indexing_job_service import mark_document_removed

    await mark_document_removed(course_id=course_id, filename=doc_name)
    await soft_delete_course_source_assets(course_id=course_id, filename=doc_name)
    return {"ok": True}


@router.post("/index-course/{course_id}/test-retrieval")
async def test_retrieval(
    course_id: str,
    body: dict,
    user: dict = Depends(require_teacher_or_admin),
):
    """Test retrieval quality: given a query, return top-k chunks from the course.

    Body: {
      "query": str,
      "top_k": int,
      "rag_profile": "low-latency" | "balanced" | "high-recall",
      "debug_retrieval": bool,
      "allow_web_correction": bool,
      "force_query_class": str
    }
    Teachers / admins only.
    """
    await _verify_course_ownership(user, course_id)

    query = str(body.get("query", "")).strip()
    if not query:
        raise HTTPException(400, "Query is required")

    chapter_id = str(body.get("chapter_id", "") or "").strip()
    top_k = min(int(body.get("top_k", 5)), 20)
    debug = bool(body.get("debug"))
    rag_profile = str(body.get("rag_profile", "balanced") or "balanced").strip().lower()
    debug_retrieval = bool(body.get("debug_retrieval", debug))
    allow_web_correction = bool(body.get("allow_web_correction", False))
    force_query_class = str(body.get("force_query_class", "") or "").strip()

    from backend.services.course_rag_service import course_rag_service
    import time

    start = time.perf_counter()
    detailed = await course_rag_service.retrieve_for_student_detailed(
        student_id="test_teacher",
        query=query,
        top_k=top_k,
        course_ids=[course_id],
        chapter_id=chapter_id,
        debug=debug,
        rag_profile=rag_profile,
        debug_retrieval=debug_retrieval,
        allow_web_correction=allow_web_correction,
        force_query_class=force_query_class,
    )
    latency_ms = round((time.perf_counter() - start) * 1000, 1)

    return {
        "query": query,
        "course_id": course_id,
        "top_k": top_k,
        "debug": debug,
        "rag_profile": rag_profile,
        "debug_retrieval": debug_retrieval,
        "allow_web_correction": allow_web_correction,
        "force_query_class": force_query_class,
        "active_index_version": course_rag_service.active_index_version(course_id),
        "latency_ms": latency_ms,
        "results": detailed.results,
        "retrieval_plan": detailed.retrieval_plan,
        "retrieval_trace": detailed.retrieval_trace,
        "retrieval_confidence": detailed.retrieval_confidence,
        "fallback_reason": detailed.fallback_reason,
        "evidence_spans": detailed.evidence_spans,
    }

