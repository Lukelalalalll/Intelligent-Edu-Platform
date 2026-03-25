import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from backend.schemas import AnnotationPayload, SubmissionScoreSchema, FinalizeAnnotationsSchema
from backend.routes.grading_helpers import load_annotations, save_annotations, find_submission, render_annotations_to_pdf
from backend.core.security import get_current_user


grading_router = APIRouter(prefix="/api/teacher", tags=["Grading"])


def _can_access_course(course: dict, user: dict) -> bool:
    if user.get("role") == "admin":
        return True
    if user.get("role") != "teacher":
        return False

    user_id = str(user.get("id") or user.get("_id") or "")
    if str(course.get("teacherId") or "") == user_id:
        return True

    bound_courses = {str(cid).strip() for cid in (user.get("teacherCourseIds") or []) if str(cid).strip()}
    course_id = str(course.get("courseId") or course.get("id") or "").strip()
    if course_id in bound_courses:
        return True

    legacy_teacher = str(course.get("teacher") or "").strip().lower()
    username = str(user.get("username") or "").strip().lower()
    return bool(legacy_teacher and username and legacy_teacher == username)


def _ensure_submission(submission_id: str):
    course, assignment, submission = find_submission(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    return course, assignment, submission


@grading_router.post("/annotations")
def upsert_annotation(payload: AnnotationPayload, current_user: dict = Depends(get_current_user)):
    course, _, submission = _ensure_submission(payload.submissionId)
    if not _can_access_course(course, current_user):
        raise HTTPException(status_code=403, detail="Permission denied")
    store = load_annotations(payload.submissionId)
    ann = payload.annotation.copy()
    ann.setdefault("id", f"ann_{uuid.uuid4().hex[:8]}")
    ann.setdefault("timestamp", ann.get("timestamp"))

    annotations = store.get("annotations", [])
    existing_idx = next((idx for idx, item in enumerate(annotations) if item.get("id") == ann["id"]), None)
    if existing_idx is not None:
        annotations[existing_idx] = ann
    else:
        annotations.append(ann)

    store["annotations"] = annotations
    save_annotations(payload.submissionId, store)
    render_annotations_to_pdf(payload.submissionId, submission, store.get("annotations", []))
    return {"status": "ok", "annotation": ann}


@grading_router.delete("/annotations/{annotation_id}")
def delete_annotation(
    annotation_id: str,
    submissionId: str = Query(..., alias="submissionId"),
    current_user: dict = Depends(get_current_user),
):
    course, _, submission = _ensure_submission(submissionId)
    if not _can_access_course(course, current_user):
        raise HTTPException(status_code=403, detail="Permission denied")
    store = load_annotations(submissionId)
    annotations = [a for a in store.get("annotations", []) if a.get("id") != annotation_id]
    store["annotations"] = annotations
    save_annotations(submissionId, store)
    render_annotations_to_pdf(submissionId, submission, store.get("annotations", []))
    return {"status": "deleted", "annotationId": annotation_id}


@grading_router.post("/submission/{submission_id}/score")
def save_score(submission_id: str, payload: SubmissionScoreSchema, current_user: dict = Depends(get_current_user)):
    course, _, _ = _ensure_submission(submission_id)
    if not _can_access_course(course, current_user):
        raise HTTPException(status_code=403, detail="Permission denied")
    store = load_annotations(submission_id)
    store["totalScore"] = payload.totalScore
    store["rubricScores"] = payload.rubricScores
    store["overallFeedback"] = payload.overallFeedback
    if payload.gradedBy:
        store["gradedBy"] = payload.gradedBy
    save_annotations(submission_id, store)
    return {"status": "ok", "scores": store}


@grading_router.post("/submission/{submission_id}/annotations/finalize")
def finalize_annotations(
    submission_id: str,
    payload: FinalizeAnnotationsSchema,
    current_user: dict = Depends(get_current_user),
):
    course, _, submission = _ensure_submission(submission_id)
    if not _can_access_course(course, current_user):
        raise HTTPException(status_code=403, detail="Permission denied")

    store = load_annotations(submission_id)
    normalized_annotations = []
    for ann in payload.annotations or []:
        item = dict(ann)
        item.setdefault("id", f"ann_{uuid.uuid4().hex[:8]}")
        item.setdefault("timestamp", item.get("timestamp"))
        normalized_annotations.append(item)

    store["annotations"] = normalized_annotations
    save_annotations(submission_id, store)
    pdf_path = render_annotations_to_pdf(submission_id, submission, normalized_annotations)

    return {
        "status": "ok",
        "annotations": normalized_annotations,
        "pdfPath": pdf_path,
    }
