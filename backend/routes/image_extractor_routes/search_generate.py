"""Google image search and AI image generation endpoints."""
import base64
import json
import logging
import os
from datetime import datetime, timezone

import httpx
from fastapi import Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.application.architecture_facades.user_profile.ai_config import (
    load_multimodal_bigmodel_runtime_config,
    load_multimodal_openai_runtime_config,
)
from backend.core.database import compute_history_expires_at, db
from backend.core.safe_requests import safe_get, safe_post
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
    provider: str | None = "auto"


async def _generate_openai_compatible_images(
    *,
    provider: str,
    config: dict,
    prompt: str,
    count: int,
) -> tuple[list[dict], dict]:
    api_key = str(config.get("api_key") or "").strip()
    if not api_key:
        raise RuntimeError(f"{provider} multimodal API key is not configured")
    base_url = str(config.get("base_url") or "").rstrip("/")
    model = str(config.get("model") or "").strip()
    if not base_url or not model:
        raise RuntimeError(f"{provider} multimodal model/base_url is not configured")

    payload = {
        "model": model,
        "prompt": prompt,
        "n": max(1, min(int(count or 1), 8)),
        "size": "1024x1024",
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(f"{base_url}/images/generations", headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()

    images: list[dict] = []
    for item in data.get("data", []) or []:
        if item.get("b64_json"):
            images.append({
                "src": f"data:image/png;base64,{item['b64_json']}",
                "caption": item.get("revised_prompt") or prompt,
            })
        elif item.get("url"):
            images.append({
                "src": item["url"],
                "caption": item.get("revised_prompt") or prompt,
            })
    if not images:
        raise RuntimeError(f"{provider} returned no generated images")
    return images[:max(1, min(int(count or 1), 8))], {
        "provider": provider,
        "provider_source": "user_ai_config",
        "model": model,
        "fallback_used": False,
    }


def _generate_magicstudio_images(prompt: str, num_images: int) -> list[dict]:
    if not MAGIC_API_URL:
        return []
    headers = {
        "Accept": "image/png",
        "Origin": "https://magicstudio.com",
        "Referer": "https://magicstudio.com/",
        "User-Agent": "Mozilla/5.0",
    }
    images = []
    for _ in range(min(num_images, 4)):
        try:
            payload = {
                "prompt": prompt,
                "num_images": 1,
                "height": 768,
                "width": 768,
                "guidance_scale": 7.5,
                "steps": 28,
            }
            response = safe_post(
                MAGIC_API_URL,
                data=payload,
                headers=headers,
                timeout=30,
                allowed_content_types=("image/",),
                max_response_bytes=10 * 1024 * 1024,
            )
            if response.status_code == 200 and response.content:
                img_base64 = base64.b64encode(response.content).decode("utf-8")
                images.append({"src": f"data:image/png;base64,{img_base64}", "caption": prompt})
        except Exception:
            continue
    return images


def _generate_mock_images(prompt: str, num_images: int) -> list[dict]:
    return [
        {"src": f"https://picsum.photos/300/300?random={i + 100}", "caption": prompt}
        for i in range(min(num_images, 8))
    ]


async def generate_ai_images_for_diagram(
    *,
    prompt: str,
    num_images: int,
    user: dict,
    provider: str | None = "auto",
) -> tuple[list[dict], dict]:
    count = max(1, min(int(num_images or 1), 8))
    requested = str(provider or "auto").strip().lower()
    warning_parts: list[str] = []
    if requested not in {"auto", "openai", "bigmodel"}:
        warning_parts.append(
            f"Provider {requested} does not support diagram image generation; using multimodal auto chain."
        )
        requested = "auto"

    candidate_names = ["openai", "bigmodel"] if requested == "auto" else [requested]
    for name in candidate_names:
        try:
            config = (
                await load_multimodal_openai_runtime_config(user)
                if name == "openai"
                else await load_multimodal_bigmodel_runtime_config(user)
            )
            if not config.get("api_key_set") and not config.get("api_key"):
                warning_parts.append(f"{name} multimodal config is not available.")
                continue
            images, meta = await _generate_openai_compatible_images(
                provider=name,
                config=config,
                prompt=prompt,
                count=count,
            )
            meta.update({"requested_provider": provider or "auto", "warning": ""})
            return images, meta
        except Exception as exc:  # noqa: BLE001
            warning_parts.append(f"{name} multimodal generation failed: {exc}")

    degraded_warning = " ".join(part for part in warning_parts if part).strip()
    magic_images = _generate_magicstudio_images(prompt, count)
    if magic_images:
        return magic_images, {
            "provider": "legacy_magicstudio",
            "provider_source": "legacy_magicstudio",
            "model": "magicstudio-ai-art-generator",
            "requested_provider": provider or "auto",
            "fallback_used": True,
            "warning": degraded_warning
            or "No configured multimodal provider was available; used legacy MagicStudio fallback.",
        }

    _logger.warning("No multimodal or MagicStudio image provider available — returning placeholder images")
    return _generate_mock_images(prompt, count), {
        "provider": "mock_placeholder",
        "provider_source": "mock",
        "model": "picsum-placeholder",
        "requested_provider": provider or "auto",
        "fallback_used": True,
        "warning": degraded_warning
        or "No configured multimodal provider was available; used mock placeholder images.",
    }


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
        response = safe_get(
            url,
            params=params,
            headers=headers,
            timeout=20,
            allowed_content_types=("application/json", "text/json"),
            max_response_bytes=2 * 1024 * 1024,
        )
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

    try:
        images, meta = await generate_ai_images_for_diagram(
            prompt=prompt,
            num_images=num_images,
            user=user,
            provider=req.provider or "auto",
        )

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
                    "provider": meta.get("provider"),
                    "provider_source": meta.get("provider_source"),
                    "requested_provider": meta.get("requested_provider"),
                    "model": meta.get("model"),
                    "fallback_used": meta.get("fallback_used"),
                },
                "result_preview": f"Generated {len(images)} AI images ({meta.get('provider')})",
                "result_full": json.dumps({"ai_images": images, "meta": meta}),
                "created_at": datetime.now(timezone.utc),
            }
            if _exp is not None:
                _doc["expires_at"] = _exp
            await db.sub3_generation_history.insert_one(_doc)
        except Exception:
            _logger.warning("Failed to save AI-image generation history", exc_info=True)

        return {'success': True, 'images': images, 'meta': meta}
    except Exception as e:
        return JSONResponse({'success': False, 'error': str(e)})
