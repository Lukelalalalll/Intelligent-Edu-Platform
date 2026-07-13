"""Template mapping, validation, and quality-evaluation routes."""
import logging
from fastapi import APIRouter, HTTPException, Depends

from backend.core.security import get_current_user
from backend.schemas import MapToSlidesSchema, ValidateSlidesSchema, EvaluateQualitySchema

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/map-to-slides")
def map_summaries_to_slides_endpoint(req: MapToSlidesSchema, user: dict = Depends(get_current_user)):
    try:
        from backend.services.slides.output.template_mapper import map_summaries_to_slides, validate_presentation
        slides = map_summaries_to_slides(
            summaries=req.summaries,
            available_layouts=req.available_layouts,
            start_number=req.start_number,
        )
        quality = validate_presentation(slides)
        return {"status": "success", "slides": slides, "quality_report": quality}
    except Exception:
        logger.exception("Template mapping failed")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/validate-slides")
def validate_slides_endpoint(req: ValidateSlidesSchema, user: dict = Depends(get_current_user)):
    try:
        from backend.services.slides.output.template_mapper import validate_presentation
        return validate_presentation(req.slides)
    except Exception:
        logger.exception("Slide validation failed")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/evaluate-quality")
def evaluate_quality(req: EvaluateQualitySchema, user: dict = Depends(get_current_user)):
    from backend.services.slides.generation.quality_evaluator import evaluate_pipeline_run

    if not req.slides:
        raise HTTPException(status_code=400, detail="slides list is required")
    return evaluate_pipeline_run(highlights=req.highlights, slides=req.slides)
