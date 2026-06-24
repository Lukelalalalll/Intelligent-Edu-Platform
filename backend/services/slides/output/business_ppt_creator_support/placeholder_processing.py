from __future__ import annotations

import asyncio

from ..text_layout_engine import clean_bullets, log_slide_layout_audit
from .content_mapping import process_dynamic_layout_content


def process_business_placeholders(
    creator,
    slide,
    slide_data,
    presentation_title,
    prs=None,
    is_title_slide=False,
):
    del prs
    title = slide_data.get("title", "")
    content_list = clean_bullets(slide_data.get("content", []))
    slide_data = {**slide_data, "content": content_list}
    content_font_size, title_font_size = creator.content_processor.get_font_sizes(
        content_list,
        title,
    )
    log_slide_layout_audit(
        slide_idx=slide_data.get("slide_number", "?"),
        title=title,
        layout_name=getattr(getattr(slide, "slide_layout", None), "name", "unknown"),
        shape_w_pt=0,
        shape_h_pt=0,
        bullet_count=len(content_list),
        initial_pt=_font_pt_or_default(content_font_size),
        final_pt=_font_pt_or_default(content_font_size),
    )

    layout = getattr(slide, "custom_layout", None) or getattr(slide, "slide_layout", None)
    if layout and hasattr(layout, "is_dynamic") and layout.is_dynamic:
        process_dynamic_layout_content(
            creator,
            slide,
            slide_data,
            layout,
            title_font_size,
            content_font_size,
            presentation_title,
        )
        return

    creator.placeholder_processor.process_title_placeholders(
        slide,
        slide_data,
        title_font_size,
    )
    type2_placeholders = creator.placeholder_processor.collect_content_placeholders(slide)
    asyncio.run(creator.image_processor.process_image_placeholders(slide, slide_data))
    creator.placeholder_processor.apply_smart_content_distribution(
        type2_placeholders,
        content_list,
        content_font_size,
    )
    creator.slide_number_handler.add_slide_number(slide, slide_data, is_title_slide)
    creator.table_handler.process_tables_with_placeholders(
        slide,
        slide_data,
        presentation_title,
        creator.placeholder_processor,
    )
    creator.latex_processor.process_latex_formulas(
        slide,
        slide_data,
        creator.placeholder_processor,
    )


def _font_pt_or_default(font_size, default_pt=12.0):
    if font_size is None:
        return default_pt
    if hasattr(font_size, "pt"):
        return float(font_size.pt)
    try:
        return float(font_size)
    except (TypeError, ValueError):
        return default_pt
