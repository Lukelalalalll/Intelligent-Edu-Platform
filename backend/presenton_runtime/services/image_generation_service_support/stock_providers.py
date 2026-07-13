import aiohttp
from fastapi import HTTPException

from utils.get_env import get_pexels_api_key_env, get_pixabay_api_key_env


class StockImageProviderMixin:
    async def get_image_from_pexels(
        self,
        prompt: str,
        api_key: str | None = None,
        limit: int = 1,
    ) -> str | list[str]:
        per_page = max(1, min(limit, 80))
        resolved_api_key = (api_key or get_pexels_api_key_env() or "").strip()

        async with aiohttp.ClientSession(trust_env=True) as session:
            response = await session.get(
                "https://api.pexels.com/v1/search",
                params={"query": prompt, "per_page": per_page},
                headers={"Authorization": resolved_api_key} if resolved_api_key else {},
                timeout=aiohttp.ClientTimeout(total=20),
            )

            if response.status in {401, 403}:
                raise HTTPException(status_code=401, detail="Invalid Pexels API key")
            if response.status != 200:
                error_text = await response.text()
                raise HTTPException(
                    status_code=502,
                    detail=f"Pexels request failed: {error_text}",
                )

            data = await response.json()
            photos = data.get("photos", [])
            image_urls = [
                photo.get("src", {}).get("large")
                for photo in photos
                if photo.get("src", {}).get("large")
            ]
            return image_urls[0] if limit <= 1 else image_urls[:limit]

    async def get_image_from_pixabay(
        self,
        prompt: str,
        api_key: str | None = None,
        limit: int = 1,
    ) -> str | list[str]:
        per_page = max(3, min(limit, 200))
        resolved_api_key = (api_key or get_pixabay_api_key_env() or "").strip()

        async with aiohttp.ClientSession(trust_env=True) as session:
            response = await session.get(
                "https://pixabay.com/api/",
                params={
                    "key": resolved_api_key,
                    "q": prompt[:99],
                    "image_type": "photo",
                    "per_page": per_page,
                },
                timeout=aiohttp.ClientTimeout(total=20),
            )

            if response.status in {401, 403}:
                error_text = await response.text()
                raise HTTPException(
                    status_code=401,
                    detail=f"Invalid Pixabay API key: {error_text}",
                )
            if response.status == 400:
                error_text = await response.text()
                if "api key" in error_text.lower():
                    raise HTTPException(
                        status_code=401,
                        detail=f"Invalid Pixabay API key: {error_text}",
                    )
                raise HTTPException(
                    status_code=400,
                    detail=f"Pixabay request invalid: {error_text}",
                )
            if response.status != 200:
                error_text = await response.text()
                raise HTTPException(
                    status_code=502,
                    detail=f"Pixabay request failed: {error_text}",
                )

            data = await response.json()
            hits = data.get("hits", [])
            image_urls = [
                hit.get("largeImageURL")
                for hit in hits
                if hit.get("largeImageURL")
            ]
            return image_urls[0] if limit <= 1 else image_urls[:limit]


__all__ = ["StockImageProviderMixin"]
