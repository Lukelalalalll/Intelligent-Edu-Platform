import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from backend.schemas import AnnotationPayload, SubmissionScoreSchema, FinalizeAnnotationsSchema
from backend.services.grading_service import (
    load_annotations, save_annotations, find_submission, render_annotations_to_pdf,
    upsert_grade, update_submission, find_submission_v2, load_courses,
)
from backend.core.security import get_current_user, can_access_course


grading_router = APIRouter(prefix="/grading", tags=["Grading"])
PERMISSION_DENIED = "Permission denied"


@grading_router.get("/courses")
async def get_courses(current_user: dict = Depends(get_current_user)):
    data = await load_courses()
    role = current_user.get("role")
    if role == "admin":
        return data
    filtered = [c for c in data.get("courses", []) if can_access_course(c, current_user)]
    return {"courses": filtered}


def _can_access_course(course: dict, user: dict) -> bool:
    return can_access_course(course, user)


async def _ensure_submission(submission_id: str):
    course, assignment, submission = await find_submission_v2(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    return course, assignment, submission


@grading_router.post("/annotations")
async def upsert_annotation(payload: AnnotationPayload, current_user: dict = Depends(get_current_user)):
    course, _, submission = await _ensure_submission(payload.submissionId)
    if not _can_access_course(course, current_user):
        raise HTTPException(status_code=403, detail=PERMISSION_DENIED)
    store = await load_annotations(payload.submissionId)
    ann = payload.annotation.copy()
    ann.setdefault("id", f"ann_{uuid.uuid4().hex}")
    ann.setdefault("timestamp", ann.get("timestamp"))

    annotations = store.get("annotations", [])
    existing_idx = next((idx for idx, item in enumerate(annotations) if item.get("id") == ann["id"]), None)
    if existing_idx is not None:
        annotations[existing_idx] = ann
    else:
        annotations.append(ann)

    store["annotations"] = annotations
    await save_annotations(payload.submissionId, store)
    render_annotations_to_pdf(payload.submissionId, submission, store.get("annotations", []))
    return {"status": "ok", "annotation": ann}


@grading_router.delete("/annotations/{annotation_id}")
async def delete_annotation(
    annotation_id: str,
    submission_id: str = Query(..., alias="submissionId"),
    current_user: dict = Depends(get_current_user),
):
    course, _, submission = await _ensure_submission(submission_id)
    if not _can_access_course(course, current_user):
        raise HTTPException(status_code=403, detail=PERMISSION_DENIED)
    store = await load_annotations(submission_id)
    annotations = [a for a in store.get("annotations", []) if a.get("id") != annotation_id]
    store["annotations"] = annotations
    await save_annotations(submission_id, store)
    render_annotations_to_pdf(submission_id, submission, store.get("annotations", []))
    return {"status": "deleted", "annotationId": annotation_id}


@grading_router.post("/submission/{submission_id}/score")
async def save_score(submission_id: str, payload: SubmissionScoreSchema, current_user: dict = Depends(get_current_user)):
    course, _, _ = await _ensure_submission(submission_id)
    if not _can_access_course(course, current_user):
        raise HTTPException(status_code=403, detail=PERMISSION_DENIED)

    # Persist to annotation store (legacy compat)
    store = await load_annotations(submission_id)
    store["totalScore"] = payload.totalScore
    store["rubricScores"] = payload.rubricScores
    store["overallFeedback"] = payload.overallFeedback
    if payload.gradedBy:
        store["gradedBy"] = payload.gradedBy
    await save_annotations(submission_id, store)

    # Persist to v2 grades collection & update submission status
    grader_id = payload.gradedBy or str(current_user.get("_id") or current_user.get("id") or "")
    try:
        await upsert_grade(submission_id, grader_id, {
            "totalScore": payload.totalScore,
            "rubricScores": payload.rubricScores,
            "overallFeedback": payload.overallFeedback,
            "gradingStatus": "draft",
        })
        await update_submission(submission_id, {"status": "graded"})
    except Exception:
        pass  # v2 write is best-effort during migration

    return {"status": "ok", "scores": store}


@grading_router.post("/submission/{submission_id}/annotations/finalize")
async def finalize_annotations(
    submission_id: str,
    payload: FinalizeAnnotationsSchema,
    current_user: dict = Depends(get_current_user),
):
    course, _, submission = await _ensure_submission(submission_id)
    if not _can_access_course(course, current_user):
        raise HTTPException(status_code=403, detail=PERMISSION_DENIED)

    store = await load_annotations(submission_id)
    normalized_annotations = []
    for ann in payload.annotations or []:
        item = dict(ann)
        item.setdefault("id", f"ann_{uuid.uuid4().hex}")
        item.setdefault("timestamp", item.get("timestamp"))
        normalized_annotations.append(item)

    store["annotations"] = normalized_annotations
    await save_annotations(submission_id, store)
    pdf_path = render_annotations_to_pdf(submission_id, submission, normalized_annotations)

    # Mark grade as final and submission as graded
    grader_id = str(current_user.get("_id") or current_user.get("id") or "")
    try:
        existing_grade = store.get("totalScore")
        if existing_grade is not None:
            await upsert_grade(submission_id, grader_id, {
                "totalScore": store.get("totalScore", 0),
                "rubricScores": store.get("rubricScores", {}),
                "overallFeedback": store.get("overallFeedback", ""),
                "gradingStatus": "final",
            })
        await update_submission(submission_id, {"status": "graded"})
    except Exception:
        pass  # v2 write is best-effort during migration

    return {
        "status": "ok",
        "annotations": normalized_annotations,
        "pdfPath": pdf_path,
    }
