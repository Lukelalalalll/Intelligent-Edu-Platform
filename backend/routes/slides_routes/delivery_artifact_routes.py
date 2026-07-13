from __future__ import annotations

import json
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse

from backend.core.ai_provider import list_provider_statuses
from backend.core.security import get_current_user
from backend.services.slides.delivery_service import (
    create_delivery_job,
    get_delivery_artifact,
    get_delivery_job,
)

from .router import SlidesDeliveryJobSchema

router = APIRouter()


def _delivery_module():
    from . import delivery as delivery_module

    return delivery_module


@router.post("/delivery/jobs")
async def create_slides_delivery_job(
    payload: SlidesDeliveryJobSchema,
    user: dict = Depends(get_current_user),
):
    return await create_delivery_job(payload=payload, user=user)


@router.get("/provider-health")
async def slides_provider_health(
    provider: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    delivery_module = _delivery_module()
    runtime = await delivery_module._resolve_ppt_generator_runtime(
        provider or "auto",
        feature="slides.provider_health",
        user=user,
        require_healthy=False,
    )
    adapter = delivery_module.PptGeneratorAdapterService(runtime=runtime)
    healthy, message = await adapter.check_provider_health()
    return {
        "success": healthy,
        "provider": runtime.provider_id,
        "requested_provider": runtime.requested_provider,
        "source": runtime.config_source,
        "model": runtime.model,
        "message": message,
    }


@router.get("/providers")
async def slides_providers(user: dict = Depends(get_current_user)):
    return {"providers": [status.public_dict() for status in await list_provider_statuses(user)]}


def _deck_dir(deck_id: str) -> str:
    delivery_module = _delivery_module()
    safe = "".join(ch for ch in deck_id if ch.isalnum() or ch in {"-", "_"})
    path = os.path.abspath(os.path.join(delivery_module.Config.PPT_RESULTS_FOLDER, "svg_decks", safe))
    root = os.path.abspath(os.path.join(delivery_module.Config.PPT_RESULTS_FOLDER, "svg_decks"))
    if os.path.commonpath([root, path]) != root:
        raise HTTPException(status_code=400, detail="Invalid deck id")
    return path


@router.get("/decks/{deck_id}")
async def get_svg_deck(deck_id: str, user: dict = Depends(get_current_user)):
    manifest_path = os.path.join(_deck_dir(deck_id), "manifest.json")
    if not os.path.isfile(manifest_path):
        raise HTTPException(status_code=404, detail="Deck not found")
    with open(manifest_path, "r", encoding="utf-8") as handle:
        return json.load(handle)


@router.get("/decks/{deck_id}/design-spec")
async def get_svg_deck_design_spec(deck_id: str, user: dict = Depends(get_current_user)):
    path = os.path.join(_deck_dir(deck_id), "design_spec.md")
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Design spec not found")
    with open(path, "r", encoding="utf-8") as handle:
        return PlainTextResponse(handle.read(), media_type="text/markdown")


@router.get("/decks/{deck_id}/slides/{slide_index}.svg")
async def get_svg_deck_slide(deck_id: str, slide_index: int, user: dict = Depends(get_current_user)):
    manifest_path = os.path.join(_deck_dir(deck_id), "manifest.json")
    if not os.path.isfile(manifest_path):
        raise HTTPException(status_code=404, detail="Deck not found")
    with open(manifest_path, "r", encoding="utf-8") as handle:
        manifest = json.load(handle)
    slide = next((item for item in manifest.get("slides", []) if int(item.get("index", 0)) == slide_index), None)
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")
    path = os.path.join(_deck_dir(deck_id), "svg_output", slide["filename"])
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Slide SVG not found")
    return FileResponse(path, media_type="image/svg+xml")


@router.get("/delivery/jobs/{job_id}")
async def get_slides_delivery_job(job_id: str, user: dict = Depends(get_current_user)):
    return await get_delivery_job(job_id=job_id, user=user)


@router.get("/delivery/jobs/{job_id}/artifact/{artifact_type}")
async def get_slides_delivery_artifact(
    job_id: str,
    artifact_type: str,
    user: dict = Depends(get_current_user),
):
    return await get_delivery_artifact(job_id=job_id, artifact_type=artifact_type, user=user)

