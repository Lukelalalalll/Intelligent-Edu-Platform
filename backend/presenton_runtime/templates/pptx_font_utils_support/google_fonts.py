from __future__ import annotations

import urllib
from typing import List, Optional, Sequence

import aiohttp

DEFAULT_GOOGLE_FONT_WEIGHTS = (400, 700)


def build_google_fonts_stylesheet_url(
    family_name: str,
    weights: Optional[Sequence[int]] = DEFAULT_GOOGLE_FONT_WEIGHTS,
    variants: Optional[Sequence[str]] = None,
) -> str:
    encoded_family = urllib.parse.quote_plus(family_name)
    requested_variants = set(variants or [])
    requested_weights = set(weights or [])
    if requested_variants:
        requested_weights = {400}
        if "bold" in requested_variants or "bold_italic" in requested_variants:
            requested_weights.add(700)
    if requested_weights:
        normalized_weights = sorted({int(weight) for weight in requested_weights if int(weight) > 0})
        if "italic" in requested_variants or "bold_italic" in requested_variants:
            italic_weights = set()
            if "italic" in requested_variants:
                italic_weights.add(400)
            if "bold_italic" in requested_variants:
                italic_weights.add(700)
            weights_param = ";".join(
                [*(f"0,{weight}" for weight in normalized_weights)] + [*(f"1,{weight}" for weight in sorted(italic_weights))]
            )
            return f"https://fonts.googleapis.com/css2?family={encoded_family}:ital,wght@{weights_param}&display=swap"
        weight_selector = ";".join(str(weight) for weight in normalized_weights)
        return f"https://fonts.googleapis.com/css2?family={encoded_family}:wght@{weight_selector}&display=swap"
    return f"https://fonts.googleapis.com/css2?family={encoded_family}&display=swap"


async def get_google_font_file_urls(family_name: str, api_key: str) -> List[str]:
    encoded_family = urllib.parse.quote_plus(family_name)
    api_url = f"https://www.googleapis.com/webfonts/v1/webfonts?family={encoded_family}&key={api_key}"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(api_url, timeout=aiohttp.ClientTimeout(total=20)) as resp:
                if resp.status != 200:
                    return []
                data = await resp.json()
    except Exception:
        return []

    items = data.get("items", []) or []
    if not items:
        return []
    urls: List[str] = []
    for _, url in ((items[0] or {}).get("files", {}) or {}).items():
        if not url:
            continue
        fixed_url = url.replace("http://", "https://")
        if fixed_url.lower().endswith((".ttf", ".otf")):
            urls.append(fixed_url)
    return urls


async def check_google_font_availability(
    font_name: str,
    variants: Optional[Sequence[str]] = None,
) -> bool:
    try:
        url = build_google_fonts_stylesheet_url(font_name, variants=variants)
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as response:
                if response.status != 200:
                    return False
                css = await response.text()
    except Exception as exc:
        print(f"Error checking Google Font availability for {font_name}: {exc}")
        return False
    return "@font-face" in css and "fonts.gstatic.com/l/font?kit=" not in css
