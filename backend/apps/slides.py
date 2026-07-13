from __future__ import annotations

from .factory import create_app
from .manifests import SLIDES_APP_MANIFEST

app = create_app(**SLIDES_APP_MANIFEST.create_app_kwargs())

