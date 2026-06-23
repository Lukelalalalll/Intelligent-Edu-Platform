from __future__ import annotations

import json


def parse_summary_result(result: dict) -> list[dict]:
    output_str = result["choices"][0]["message"]["content"].strip("```json\n").strip("```")
    output_dict = json.loads(output_str)
    return list(output_dict["slides"])


def build_failed_slide(*, chapter_title: str, slide_number: int, error_message: str, continuation: bool) -> dict:
    return {
        "slide_number": slide_number,
        "title": chapter_title if not continuation else f"{chapter_title} (cont.)",
        "content": ["[Content generation failed - please retry this chapter]"],
        "latex": [],
        "chart_type": "No Chart",
        "chart_reasoning": [],
        "_status": "failed",
        "_error": error_message,
    }
