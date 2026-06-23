from __future__ import annotations

import os

from .feature_flags import FeatureFlagSettingsSegment
from .shared import _BASE_DIR


class PathSettingsSegment(FeatureFlagSettingsSegment):
    @property
    def ALL_FOLDERS(self) -> list[str]:
        raw = [
            self.UPLOAD_FOLDER,
            self.MARKDOWN_FOLDER,
            self.HIGHLIGHTS_FOLDER,
            self.PPT_TEMPLATES_FOLDER,
            self.PPT_RESULTS_FOLDER,
            self.SCRIPT_RESULTS_FOLDER,
            os.path.join(_BASE_DIR, "uploads/sub1"),
            os.path.join(_BASE_DIR, "md/sub1"),
            os.path.join(_BASE_DIR, "highlights/sub1"),
            os.path.join(_BASE_DIR, "static", "ppt_results", "sub1"),
            os.path.join(_BASE_DIR, "static", "script_results", "sub1"),
            self.UPLOAD_FOLDER_SUB2,
            self.GENERATED_FOLDER_SUB2,
            self.SCREENSHOTS_FOLDER_SUB2,
            os.path.join(_BASE_DIR, "uploads/sub4"),
            os.path.join(_BASE_DIR, "static/sub4/results"),
            os.path.join(_BASE_DIR, "uploads/sub5"),
            os.path.join(_BASE_DIR, "generated/sub5"),
            self.KNOWLEDGE_BASE_UPLOAD_DIR,
            self.RAG_VECTORSTORE_DIR,
            os.path.join(_BASE_DIR, "uploads/submissions"),
            os.path.join(_BASE_DIR, "uploads/homeworks"),
        ]
        return list(dict.fromkeys(raw))
