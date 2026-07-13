from __future__ import annotations

import os
from datetime import datetime


def save_prompt_to_file(*, prompt: str, image_data: dict, prompt_type: str, prompt_save_dir: str) -> None:
    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        title = image_data.get("title", "untitled")
        if prompt_type == "image":
            type_identifier = "Image"
        elif prompt_type == "image_enhanced":
            type_identifier = "Image_Enhanced"
        elif prompt_type == "chart":
            type_identifier = str(image_data.get("chart_type", "unknown")).replace(" ", "_").replace("/", "_")
        else:
            type_identifier = "Unknown"
        safe_title = "".join(char for char in title if char.isalnum() or char in (" ", "-", "_")).strip()
        safe_title = safe_title.replace(" ", "_")[:50]
        filename = f"{timestamp}_{type_identifier}_{safe_title}.txt"
        filepath = os.path.join(prompt_save_dir, filename)
        with open(filepath, "w", encoding="utf-8") as handle:
            handle.write(prompt)
    except Exception as exc:
        print(f"Failed to save {prompt_type} prompt: {exc}")
