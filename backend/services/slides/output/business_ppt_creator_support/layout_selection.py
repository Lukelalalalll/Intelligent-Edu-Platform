from __future__ import annotations

import os


def get_template_path(creator, theme):
    if theme.lower() == "business":
        return os.path.join(
            creator.template_base_path,
            f"{creator.template_name}.pptx",
        )
    return super(type(creator), creator)._get_template_path(theme)


def find_layout_by_name(creator, prs, layout_name):
    if "dynamic" not in layout_name.lower():
        return super(type(creator), creator)._find_layout_by_name(prs, layout_name)

    base_layout = None
    for layout in prs.slide_layouts:
        if layout.name == layout_name:
            base_layout = layout
            break

    if base_layout:
        return create_dynamic_layout(creator, base_layout)

    print(
        f"Warning: Base layout '{layout_name}' not found for dynamic layout '{layout_name}'"
    )
    return None


def create_dynamic_layout(creator, base_layout):
    group_templates = creator.layout_manager.analyze_layout_groups(base_layout)
    base_layout.group_templates = group_templates
    base_layout.is_dynamic = True
    return base_layout
