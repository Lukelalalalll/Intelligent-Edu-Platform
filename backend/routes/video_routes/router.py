from fastapi import APIRouter

router = APIRouter(prefix="/video", tags=["video"])

from . import uploads, generation, scripts, progress, history  # noqa: E402,F401
