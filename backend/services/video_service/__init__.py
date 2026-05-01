"""video_service package — re-exports all public symbols for backward compatibility."""

from .types import BACKEND_ROOT, get_task, new_task, _tasks  # noqa: F401
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
from .brand import build_brand_assets, BRAND_KITS  # noqa: F401
from .avatar import apply_avatar, is_wav2lip_available, is_latentsync_available  # noqa: F401
from .quiz_generator import generate_chapters, generate_quiz_markers, save_quiz_data  # noqa: F401
