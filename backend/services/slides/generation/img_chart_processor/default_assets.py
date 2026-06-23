from __future__ import annotations

import os


def format_content_list(content_list) -> str:
    if not content_list:
        return "No content provided"
    return "\n".join(f"{index}. {content}" for index, content in enumerate(content_list, 1))


def generate_image_prompt(image_data: dict) -> str:
    title = image_data.get("title", "")
    content_list = image_data.get("content_list", [])
    ratio = "16:9" if image_data.get("ratio", 0) == 1 else "4:3"
    return (
        f'Create a professional image for: "{title}"\n\n'
        f"Content Points:\n{format_content_list(content_list)}\n\n"
        f"Requirements:\n- {ratio} aspect ratio\n"
        "- Professional, clean style suitable for presentations\n"
        "- Relevant to the slide content and visually appealing"
    ).strip()


def get_default_image_path(*, base_path: str, diagram_path: str, image_data: dict) -> str:
    ratio_suffix = "16-9" if image_data.get("ratio", 0) == 1 else "4-3"
    image_type = image_data.get("type", "image")
    if image_type == "diagram":
        type_prefix = "obj"
        asset_root = diagram_path
    else:
        type_prefix = "pic"
        asset_root = base_path
    return os.path.join(asset_root, f"{type_prefix}_{ratio_suffix}.png")
