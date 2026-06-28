from __future__ import annotations

from backend.ppt_generator_integration import mount_ppt_generator

from .factory import create_app
from .manifests import CORE_APP_MANIFEST

app = create_app(**CORE_APP_MANIFEST.create_app_kwargs())

mount_ppt_generator(app)
