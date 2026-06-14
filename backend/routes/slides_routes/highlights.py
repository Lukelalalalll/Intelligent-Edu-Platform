from __future__ import annotations

import logging

from fastapi import Depends, HTTPException

from backend.core.security import get_current_user
from backend.schemas import ClassifyHighlightsSchema, SaveHighlightsSchema
from backend.services.slides import StepStatus, TaskTracker
from backend.services.slides_pipeline_service import load_highlights as _load_highlights_impl
from backend.services.slides_pipeline_service import save_highlights as _save_highlights_impl

from .router import slides_router

logger = logging.getLogger(__name__)


@slides_router.post("/save_highlights")
def save_highlights(req: SaveHighlightsSchema, user: dict = Depends(get_current_user)):
    try:
        saved_file = _save_highlights_impl(req.filename, req.highlights)
        return {"message": "Success", "file": saved_file}
    except Exception:
        logger.exception("Save highlights failed")
        raise HTTPException(status_code=500, detail="Internal server error")


@slides_router.post("/classify-highlights")
async def classify_highlights(req: ClassifyHighlightsSchema, user: dict = Depends(get_current_user)):
    tracker = TaskTracker(user_id=user.get("username", ""), task_type="classify_highlights")
    try:
        flat_highlights = []
        for section in req.highlights:
            section_title = section.get("sectionTitle", "")
            for item in section.get("highlights", []):
                flat_highlights.append(
                    {
                        "text": item.get("text", ""),
                        "id": item.get("id", ""),
                        "sectionTitle": section_title,
                    }
                )

        if not flat_highlights:
            return {"status": "success", "highlights": [], "stats": {}}

        from backend.services.slides.generation.highlight_classifier import HighlightClassifier

        classifier = HighlightClassifier()
        with tracker.step("classify_highlights", count=len(flat_highlights)):
            classified = classifier.classify(flat_highlights)

        category_counts: dict[str, int] = {}
        low_confidence = []
        for item in classified:
            category = item.get("category", "concept")
            category_counts[category] = category_counts.get(category, 0) + 1
            if item.get("confidence", 1.0) < 0.6:
                low_confidence.append(item["id"])

        tracker.finish(StepStatus.SUCCESS)
        await tracker.save()
        return {
            "status": "success",
            "highlights": classified,
            "stats": {
                "total": len(classified),
                "by_category": category_counts,
                "low_confidence_ids": low_confidence,
                "low_confidence_count": len(low_confidence),
            },
            "request_id": tracker.request_id,
        }
    except Exception:
        tracker.finish(StepStatus.FAILED)
        logger.exception("[%s] Highlight classification failed", tracker.request_id)
        raise HTTPException(status_code=500, detail="Internal server error")


@slides_router.get("/load_highlights/{filename}")
def load_highlights(filename: str, user: dict = Depends(get_current_user)):
    try:
        return {"highlights": _load_highlights_impl(filename)}
    except Exception:
        logger.exception("Failed to load highlights for %s", filename)
        raise HTTPException(status_code=500, detail="Internal server error")
