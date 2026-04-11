"""Theme and placeholder template management routes."""
import logging
from fastapi import HTTPException
from backend.config import Config
from backend.services.slides import PPTTemplateManager
from .router import slides_router, public_slides_router

logger = logging.getLogger(__name__)


@slides_router.get("/get_themes")
@public_slides_router.get("/get_themes", include_in_schema=False)
def get_themes():
    try:
        manager = PPTTemplateManager(Config.PPT_TEMPLATES_FOLDER)
        return manager.get_available_themes()
    except Exception as e:
        logger.exception("Failed to list themes")
        raise HTTPException(status_code=500, detail="Internal server error")


@slides_router.get("/get_placeholders/{theme_name}")
@public_slides_router.get("/get_placeholders/{theme_name}", include_in_schema=False)
def get_placeholders(theme_name: str):
    try:
        manager = PPTTemplateManager(Config.PPT_TEMPLATES_FOLDER)
        return manager.get_placeholders(theme_name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("Failed to get placeholders for theme")
        raise HTTPException(status_code=500, detail="Internal server error")
