from __future__ import annotations

import os
from typing import Optional

from backend.core.safe_requests import safe_get


def search_diagram_images(*, serp_api_key: str | None, prompt: str, max_results: int = 5) -> list[str]:
    if not serp_api_key:
        print("SerpAPI key not configured for search fallback")
        return []
    try:
        response = safe_get(
            "https://serpapi.com/search",
            params={
                "engine": "google",
                "q": f"{prompt} diagram chart flowchart infographic",
                "tbm": "isch",
                "api_key": serp_api_key,
                "num": max_results,
            },
            timeout=30,
            allowed_content_types=("application/json", "text/json"),
            max_response_bytes=2 * 1024 * 1024,
        )
        payload = response.json()
        if "error" in payload:
            print(f"Search API error: {payload['error']}")
            return []
        return [
            item["original"]
            for item in payload.get("images_results", [])[:max_results]
            if "original" in item
        ]
    except Exception as exc:
        print(f"Search failed: {exc}")
        return []


def search_diagram_fallback(
    *,
    serp_api_key: str | None,
    prompt: str,
    output_dir: str,
    timestamp: str,
    random_num: int,
) -> Optional[str]:
    try:
        search_results = search_diagram_images(serp_api_key=serp_api_key, prompt=prompt)
        if not search_results:
            print("No search results found")
            return None
        image_url = search_results[0]
        image_path = os.path.join(output_dir, f"searched_diagram_{timestamp}_{random_num}.jpg")
        response = safe_get(
            image_url,
            timeout=30,
            allowed_content_types=("image/",),
            max_response_bytes=10 * 1024 * 1024,
        )
        if response.status_code == 200:
            with open(image_path, "wb") as handle:
                handle.write(response.content)
            return image_path
        print(f"Failed to download image: HTTP {response.status_code}")
        return None
    except Exception as exc:
        print(f"Search fallback failed: {exc}")
        return None
