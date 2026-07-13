from __future__ import annotations

import os
from typing import Literal

RENDERER_ERROR_CODE = "browser_renderer_unavailable"
RENDERER_CACHE_TTL_SECONDS = 30.0
PLAYWRIGHT_LAUNCH_ARGS = [
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--disable-setuid-sandbox",
]
TEMPLATE_DIR = os.path.join(
    os.path.dirname(__file__),
    "..",
    "..",
    "..",
    "static",
    "slides_themes",
)
SLIDE_TEMPLATE = "slide_template.html"
SLIDE_WIDTH = 1280
SLIDE_HEIGHT = 720
ThemeDraftLayout = Literal["cover", "content", "split", "quote"]
