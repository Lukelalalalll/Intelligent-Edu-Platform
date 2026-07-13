from __future__ import annotations

from .factory import create_app
from .manifests import HIGHLIGHTER_APP_MANIFEST, highlighter_router

app = create_app(**HIGHLIGHTER_APP_MANIFEST.create_app_kwargs())
