from __future__ import annotations

import sys
from pathlib import Path


_PRESENTON_RUNTIME_ROOT = Path(__file__).resolve().parents[1] / "presenton_runtime"
if str(_PRESENTON_RUNTIME_ROOT) not in sys.path:
    sys.path.insert(0, str(_PRESENTON_RUNTIME_ROOT))

from utils.presentation_request import infer_requested_slide_count


def test_infer_requested_slide_count_from_attached_file_prompt():
    count = infer_requested_slide_count(
        "make a ten page ppt of my attached file",
        maximum=50,
    )

    assert count == 10


def test_infer_requested_slide_count_from_explicit_slide_phrase():
    count = infer_requested_slide_count(
        "Create a deck with 12 slides about the uploaded quarterly report",
        maximum=50,
    )

    assert count == 12


def test_does_not_confuse_source_document_page_reference_for_slide_count():
    count = infer_requested_slide_count(
        "Summarize the first 10 pages of the attached file into a concise overview",
        maximum=50,
    )

    assert count is None


def test_infer_requested_slide_count_from_hyphenated_slide_phrase():
    count = infer_requested_slide_count(
        "Please create a 10-slide presentation based on the attached file",
        maximum=50,
    )

    assert count == 10


def test_infer_requested_slide_count_from_chinese_prompt():
    count = infer_requested_slide_count(
        "\u505a\u4e00\u4e2a10\u9875PPT\u603b\u7ed3\u8fd9\u4efd\u9644\u4ef6",
        maximum=50,
    )

    assert count == 10
