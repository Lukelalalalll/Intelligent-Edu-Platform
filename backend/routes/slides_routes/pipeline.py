"""Compatibility module for the split slides pipeline routes."""

from .parse import parse_md, combine_sections  # noqa: F401
from .highlights import save_highlights, classify_highlights, load_highlights  # noqa: F401
from .artifacts import download_ppt, download_combined, download_script, download_html  # noqa: F401
from .generation import (  # noqa: F401
    process_ppt,
    coze_generate_outline,
    process_text,
    summarize_highlights,
    summarize_chapters,
    generate_talking_script,
    list_themes,
    generate_render,
)
from .legacy import legacy_download_script, legacy_download_ppt  # noqa: F401
