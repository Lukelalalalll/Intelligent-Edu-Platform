from __future__ import annotations

from .factory import create_app
from .manifests import STUDY_NOTES_APP_MANIFEST

app = create_app(**STUDY_NOTES_APP_MANIFEST.create_app_kwargs())
