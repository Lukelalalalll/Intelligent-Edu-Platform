"""video_service package: re-exports public symbols for backward compatibility."""

from .types import BACKEND_ROOT, get_task, new_task, get_script_job, new_script_job, _tasks, _script_jobs  # noqa: F401
from .extract import extract_text_from_pdf, extract_text_from_md_txt  # noqa: F401
from .script import generate_scripts, generate_slide_contents, optimize_full_script, smart_extract  # noqa: F401
from .pipeline import run_video_pipeline  # noqa: F401
from .brand import build_brand_assets, BRAND_KITS  # noqa: F401
from .avatar import apply_avatar, is_wav2lip_available, is_latentsync_available  # noqa: F401
from .quiz_generator import generate_chapters, generate_quiz_markers, save_quiz_data  # noqa: F401
from .project_service import VideoProjectService, VIDEO_RENDER_JOB_TYPE  # noqa: F401
from .script_job_service import VideoScriptJobService  # noqa: F401
from .comfyui_adapter import ComfyUIWanVideoAdapter  # noqa: F401
