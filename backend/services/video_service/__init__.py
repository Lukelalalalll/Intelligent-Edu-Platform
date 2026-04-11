"""video_service package — re-exports all public symbols for backward compatibility."""

from .types import BACKEND_ROOT, get_task, new_task  # noqa: F401
from .extract import (  # noqa: F401
    extract_text_from_pdf,
    extract_text_from_md_txt,
)
from .script import (  # noqa: F401
    generate_scripts,
    generate_slide_contents,
    optimize_full_script,
    smart_extract,
)
from .pipeline import run_video_pipeline  # noqa: F401
