from __future__ import annotations

import os
from datetime import datetime, timezone


def build_ppt_schema(*, title: str, selected_theme: str, resolved_provider: str, runtime, slides_results: list[dict]) -> dict:
    ppt_schema_slides = [
        {
            **slide,
            "tables": slide.get("tables") or [],
            "layout": slide.get("layout") or {"name": "Title and Content"},
        }
        for slide in slides_results
    ]
    return {
        "presentation_title": title,
        "theme": selected_theme,
        "slides": ppt_schema_slides,
        "metadata": {
            "provider": resolved_provider,
            "model": runtime.model,
            "provider_source": runtime.config_source,
            "theme": selected_theme,
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        },
    }


async def build_script_payload(
    *,
    req,
    slides_results: list[dict],
    resolved_provider: str,
    chapter_summarizer_cls,
    generate_talking_script_word_fn,
    config,
    title: str,
) -> dict | None:
    if not req.generate_talking_script:
        return None

    summarizer = chapter_summarizer_cls()
    scripts = await summarizer.generate_talking_script(
        slides_results,
        req.script_style,
        provider=resolved_provider,
    )
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"talking_script_{timestamp}.docx"
    output_path = os.path.join(config.SCRIPT_RESULTS_FOLDER, filename)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    generate_talking_script_word_fn(scripts, output_path, title)

    payload = {
        "total_scripts": len(scripts),
        "estimated_total_duration": f"{len(scripts) * 2} minutes",
    }
    if req.generate_word_document:
        payload["word_document"] = {
            "available": True,
            "filename": filename,
            "download_url": f"/slides/download_script/{filename}",
        }
    return payload


def build_success_result(
    *,
    slides_results: list[dict],
    ppt_schema: dict,
    runtime,
    resolved_provider: str,
    selected_theme: str,
    deck_manifest: dict,
    outline: list[dict],
    outline_to_markdown_fn,
    script_payload: dict | None,
) -> dict:
    result = {
        "status": "success",
        "results": slides_results,
        "ppt_schema": ppt_schema,
        "provider": resolved_provider,
        "provider_requested": runtime.requested_provider,
        "provider_resolved": runtime.provider_id,
        "provider_source": runtime.config_source,
        "provider_model": runtime.model,
        "fallback_events": [],
        "theme": selected_theme,
        "deck_id": deck_manifest["deck_id"],
        "outline_slides": [
            {
                "index": idx + 1,
                "title": item.get("title", ""),
                "objective": item.get("objective", ""),
                "key_points": item.get("key_points", []),
                "content": outline_to_markdown_fn(item, idx + 1),
            }
            for idx, item in enumerate(outline)
        ],
        "design_spec_url": deck_manifest["design_spec_url"],
        "spec_lock": deck_manifest["spec_lock"],
        "quality_report": deck_manifest["quality_report"],
        "slides": deck_manifest["slides"],
        "exports": deck_manifest["exports"],
        "provider_runtime": runtime.public_dict(),
    }
    if script_payload:
        result.update(script_payload)
    return result


def build_failed_result(*, exc: Exception, task_id: str, task: dict | None, runtime, deck_manifest: dict | None) -> dict:
    return {
        "status": "failed",
        "error": str(exc),
        "request_id": (task or {}).get("request_id", ""),
        "task_id": task_id,
        "provider_requested": runtime.requested_provider,
        "provider_resolved": runtime.provider_id,
        "provider_source": runtime.config_source,
        "provider_model": runtime.model,
        "deck_id": deck_manifest["deck_id"] if deck_manifest else "",
    }
