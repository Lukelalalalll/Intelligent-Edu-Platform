"""Theme and placeholder template management routes."""
import logging
from fastapi import APIRouter, Depends, HTTPException
from backend.config import Config
from backend.core.security import get_current_user
from backend.services.slides import PPTTemplateManager

logger = logging.getLogger(__name__)
router = APIRouter()
public_router = APIRouter()


@router.get("/get_themes")
@public_router.get("/get_themes", include_in_schema=False)
def get_themes(user: dict = Depends(get_current_user)):
    try:
        manager = PPTTemplateManager(Config.PPT_TEMPLATES_FOLDER)
        return manager.get_available_themes()
    except Exception as e:
        logger.exception("Failed to list themes")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/get_placeholders/{theme_name}")
@public_router.get("/get_placeholders/{theme_name}", include_in_schema=False)
def get_placeholders(theme_name: str, user: dict = Depends(get_current_user)):
    try:
        manager = PPTTemplateManager(Config.PPT_TEMPLATES_FOLDER)
        return manager.get_placeholders(theme_name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("Failed to get placeholders for theme")
        raise HTTPException(status_code=500, detail="Internal server error")
