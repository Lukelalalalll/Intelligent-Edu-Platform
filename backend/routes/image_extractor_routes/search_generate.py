"""Google image search and AI image generation endpoints."""
import base64
import json
import logging
import os
from datetime import datetime, timezone

import requests
from fastapi import Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.core.database import compute_history_expires_at, db
from backend.core.safe_requests import safe_get
from backend.core.security import get_current_user
from .router import image_extractor_router, limiter

_logger = logging.getLogger(__name__)

SERPAPI_KEY = os.getenv("SERPAPI_KEY", "")
MAGIC_API_URL = os.getenv("MAGIC_API_URL", "https://api.magicstudio.com/api/ai-art-generator")


class SearchImagesSchema(BaseModel):
    query: str


class GenerateAiImagesSchema(BaseModel):
    prompt: str
    num_images: int = 4


@image_extractor_router.post("/search-google-images")
def api_search_google_images(req: SearchImagesSchema, user: dict = Depends(get_current_user)):
    query = req.query
    if not query:
        return JSONResponse({'success': False, 'error': 'No search query provided'})
    if not SERPAPI_KEY:
        return JSONResponse({'success': False, 'error': 'SERPAPI key not configured'})
    try:
        url = "https://serpapi.com/search.json"
        params = {
            "engine": "google",
            "q": query,
            "tbm": "isch",
            "ijn": 0,
            "num": 8,
            "safe": "active",
            "api_key": SERPAPI_KEY,
        }
        headers = {"User-Agent": "Mozilla/5.0"}
        response = requests.get(url, params=params, headers=headers, timeout=20)
        results = response.json().get("images_results", [])
        images = []
        for r in results[:8]:
            src = r.get("original") or r.get("thumbnail")
            if src:
                images.append({'src': src})
        return {'success': True, 'images': images}
    except Exception as e:
        return JSONResponse({'success': False, 'error': str(e)})


@image_extractor_router.post("/generate-ai-images")
@limiter.limit("10/minute")
async def api_generate_ai_images(request: Request, req: GenerateAiImagesSchema, user: dict = Depends(get_current_user)):
    prompt = req.prompt
    num_images = req.num_images
    if not prompt:
        return JSONResponse({'success': False, 'error': 'No prompt provided'})

    if not MAGIC_API_URL:
        # Mock logic — warn so operators notice in production
        _logger.warning("MAGIC_API_URL not set — returning placeholder images from picsum.photos")
        images = []
        for i in range(min(num_images, 8)):
            images.append({'src': f'https://picsum.photos/300/300?random={i + 100}&prompt={prompt}'})

        # ── save history ─────────────────────────────────────
        try:
            user_id = user.get("id", "")
            _exp = await compute_history_expires_at(user_id)
            _doc = {
                "user_id": user_id,
                "tool": "ai_image_generate",
                "params": {
                    "prompt": prompt,
                    "num_images": num_images,
                },
                "result_preview": f"Generated {len(images)} AI images (mock)",
                "result_full": json.dumps({"ai_images": images}),
                "created_at": datetime.now(timezone.utc),
            }
            if _exp is not None:
                _doc["expires_at"] = _exp
            await db.sub3_generation_history.insert_one(_doc)
        except Exception:
            _logger.warning("Failed to save AI-image generation history", exc_info=True)

        return {'success': True, 'images': images}

    try:
        headers = {
            "Accept": "image/png",
            "Origin": "https://magicstudio.com",
            "Referer": "https://magicstudio.com/",
            "User-Agent": "Mozilla/5.0",
        }
        images = []
        for i in range(min(num_images, 4)):
            try:
                payload = {
                    "prompt": prompt,
                    "num_images": 1,
                    "height": 768,
                    "width": 768,
                    "guidance_scale": 7.5,
                    "steps": 28,
                }
                response = requests.post(MAGIC_API_URL, data=payload, headers=headers, timeout=30)
                if response.status_code == 200 and response.content:
                    img_base64 = base64.b64encode(response.content).decode('utf-8')
                    images.append({'src': f"data:image/png;base64,{img_base64}"})
            except Exception:
                continue

        # ── save history ─────────────────────────────────────
        try:
            user_id = user.get("id", "")
            _exp = await compute_history_expires_at(user_id)
            _doc = {
                "user_id": user_id,
                "tool": "ai_image_generate",
                "params": {
                    "prompt": prompt,
                    "num_images": num_images,
                },
                "result_preview": f"Generated {len(images)} AI images",
                "result_full": json.dumps({"ai_images": images}),
                "created_at": datetime.now(timezone.utc),
            }
            if _exp is not None:
                _doc["expires_at"] = _exp
            await db.sub3_generation_history.insert_one(_doc)
        except Exception:
            _logger.warning("Failed to save AI-image generation history", exc_info=True)

        return {'success': True, 'images': images}
    except Exception as e:
        return JSONResponse({'success': False, 'error': str(e)})
