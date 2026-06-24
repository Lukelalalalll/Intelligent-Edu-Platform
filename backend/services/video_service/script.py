"""Step B — AI script generation and slide content generation."""
from __future__ import annotations

from .script_support.arc_planning import plan_narrative_arc, weave_narrative_arc
from .script_support.json_parsing import parse_json_object as _parse_json_object
from .script_support.extract_orchestration import smart_extract
from .script_support.script_generation import generate_scripts
from .script_support.segmentation import optimize_full_script
from .script_support.slide_content_generation import generate_slide_contents

__all__ = [
    "_parse_json_object",
    "generate_scripts",
    "optimize_full_script",
    "smart_extract",
    "generate_slide_contents",
    "plan_narrative_arc",
    "weave_narrative_arc",
]
