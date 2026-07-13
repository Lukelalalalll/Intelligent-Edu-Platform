"""SVG search, download, and external fetch proxy endpoints."""
import logging
import re
from io import BytesIO

import requests
from fastapi import Depends, HTTPException
from fastapi.responses import Response, StreamingResponse

from backend.config import Config
from backend.core.safe_requests import safe_get
from backend.core.security import get_current_user
from backend.schemas import DownloadSvgSchema, SearchSvgSchema
from .router import diagram_router

logger = logging.getLogger(__name__)


@diagram_router.post("/search_svg")
def search_svg(req: SearchSvgSchema, user: dict = Depends(get_current_user)):
    if not Config.SERP_API_KEY:
        raise HTTPException(status_code=500, detail='SERP_API_KEY missing')

    query = (req.prompt or '').strip()
    if not query:
        raise HTTPException(status_code=400, detail='Prompt is required')

    query_variants = [
        f"{query} filetype:svg",
        f"{query} vector diagram svg",
        f"{query} site:lucid.co svg",
    ]

    dedup = {}
    try:
        for q in query_variants:
            params = {'engine': 'google', 'q': q, 'tbm': 'isch', 'api_key': Config.SERP_API_KEY}
            data = requests.get('https://serpapi.com/search', params=params, timeout=20).json()
            if data.get('error'):
                continue

            for item in data.get('images_results', [])[:25]:
                svg_url = item.get('original') or ''
                if not svg_url:
                    continue
                normalized = svg_url.lower()
                if '.svg' not in normalized and 'svg' not in normalized:
                    continue

                if svg_url in dedup:
                    continue
                dedup[svg_url] = {
                    'thumb': item.get('thumbnail') or svg_url,
                    'svg': svg_url,
                    'title': item.get('title', ''),
                }

            if len(dedup) >= 18:
                break

        results = list(dedup.values())[:18]
        if not results:
            raise HTTPException(status_code=404, detail='No SVG diagrams found for this query')
        return results
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        logger.exception("SVG search failed")
        raise HTTPException(status_code=500, detail="Internal server error")


@diagram_router.post("/download_svg")
def download_svg(req: DownloadSvgSchema, user: dict = Depends(get_current_user)):
    file_stream = BytesIO(req.svg.encode('utf-8'))
    return StreamingResponse(file_stream, media_type="image/svg+xml",
                             headers={"Content-Disposition": "attachment; filename=edited.svg"})


@diagram_router.get("/fetch_external_svg")
def fetch_external_svg(url: str, user: dict = Depends(get_current_user)):
    try:
        if not isinstance(url, str) or not re.match(r"^https?://", url.strip(), re.IGNORECASE):
            raise HTTPException(status_code=400, detail="Invalid URL")

        resp = safe_get(
            url,
            headers={
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'image/svg+xml,text/xml;q=0.9,*/*;q=0.8',
            },
            timeout=20,
        )
        resp.raise_for_status()

        content_type = (resp.headers.get('content-type') or '').lower()
        raw = resp.content or b''
        # Prefer UTF-8 explicitly; requests may misdetect SVG content-type as ISO-8859-1
        # which corrupts multi-byte characters (Chinese, special symbols, etc.)
        try:
            text = raw.decode('utf-8')
        except (UnicodeDecodeError, LookupError):
            fallback = resp.apparent_encoding or 'latin-1'
            text = raw.decode(fallback, errors='replace')
        if '<svg' not in text.lower() and 'image/svg+xml' not in content_type:
            raise HTTPException(status_code=400, detail="Target URL did not return SVG content")

        return Response(content=text, media_type="image/svg+xml; charset=utf-8")
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        logger.exception("SVG proxy fetch failed")
        raise HTTPException(status_code=500, detail="Internal server error")
