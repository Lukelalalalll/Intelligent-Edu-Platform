from __future__ import annotations


async def generate_outline_and_slides(
    *,
    req,
    adapter,
    task_id: str,
    presenton_task_service,
    extract_source_text_and_chapters_fn,
    normalize_outline_slides_fn,
) -> tuple[list[dict], list[dict]]:
    source_text, chapter_data_clean = extract_source_text_and_chapters_fn(req.content, req.chapterData)
    if not source_text and not req.outlineSlides:
        raise RuntimeError("content or chapterData is required")

    pages_seed = len(req.outlineSlides) if req.outlineSlides else int(req.total_pages or 8)
    pages = max(1, min(int(pages_seed or 8), 40))
    bullets = max(1, min(int(req.num_of_bullets or 3), 6))
    words = max(8, min(int(req.words_each_bullet or 15), 80))

    if req.outlineSlides:
        await presenton_task_service.add_event(
            task_id,
            "step_start",
            "outline",
            "Applying edited outline",
            progress=25,
        )
        outline = normalize_outline_slides_fn(req.outlineSlides, pages)
        await presenton_task_service.add_event(
            task_id,
            "step_done",
            "outline",
            f"Using edited outline with {len(outline)} slides",
            progress=45,
            payload={"outline_source": "edited"},
        )
    else:
        await presenton_task_service.add_event(
            task_id,
            "step_start",
            "outline",
            "Generating outline",
            progress=25,
        )
        outline = await adapter.generate_outline(
            source_text=source_text,
            total_pages=pages,
            chapter_data=chapter_data_clean,
        )
        await presenton_task_service.add_event(
            task_id,
            "step_done",
            "outline",
            f"Outline generated with {len(outline)} slides",
            progress=45,
        )

    await presenton_task_service.add_event(
        task_id,
        "step_start",
        "slide_content",
        "Generating slide content",
        progress=55,
    )
    slides_results = await adapter.generate_slides(
        outline=outline,
        num_of_bullets=bullets,
        words_each_bullet=words,
    )
    await presenton_task_service.add_event(
        task_id,
        "step_done",
        "slide_content",
        f"Generated content for {len(slides_results)} slides",
        progress=78,
    )
    return outline, slides_results
