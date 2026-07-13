from __future__ import annotations

import asyncio
import json
import re

from .prompts import build_script_batch_content, build_script_system_prompt


def normalize_slide_number(value) -> int | None:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError, AttributeError):
        return None


def extract_speaking_cues(script: str) -> dict[str, int]:
    pauses = script.count("[PAUSE]")
    emphasis = script.count("[EMPHASIS]")
    slow_delivery = script.count("[SLOW]")
    return {
        "pauses": pauses,
        "emphasis": emphasis,
        "slow_delivery": slow_delivery,
        "total_cues": pauses + emphasis + slow_delivery,
    }


def build_fallback_script_data(slide: dict, script_style: str) -> dict:
    slide_number = normalize_slide_number(slide.get("slide_number")) or 0
    title = str(slide.get("title", f"Slide {slide_number}") or f"Slide {slide_number}")
    points = [str(point or "").strip() for point in (slide.get("content") or []) if str(point or "").strip()]
    intro = f"This slide introduces {title}."
    main_body = [f"Key point: {point}" for point in points] if points else ["Please explain the core idea shown on this slide."]
    conclusion = "In summary, this slide highlights the essential points to remember."
    full_script = "\n\n".join([intro] + main_body + [conclusion])
    return {
        "slide_number": slide_number,
        "slide_title": title,
        "slide_content_points": points,
        "talking_script": {
            "intro": intro,
            "main_body": main_body,
            "conclusion": conclusion,
            "full_text": full_script,
        },
        "estimated_duration": "45-60 seconds",
        "script_style": script_style,
        "word_count": len(full_script.split()),
        "speaking_cues": extract_speaking_cues(full_script),
    }


def process_script_content(raw_script: str) -> dict:
    paragraphs = [paragraph.strip() for paragraph in raw_script.split("\n\n") if paragraph.strip()]
    processed = {"intro": "", "main_body": [], "conclusion": "", "full_text": raw_script}
    if not paragraphs:
        return processed
    processed["intro"] = paragraphs[0]
    if len(paragraphs) > 2:
        processed["main_body"] = paragraphs[1:-1]
        processed["conclusion"] = paragraphs[-1]
    elif len(paragraphs) == 2:
        processed["conclusion"] = paragraphs[1]
    else:
        processed["main_body"] = [paragraphs[0]]
        processed["intro"] = ""
    return processed


async def generate_talking_scripts(*, host, slides_results: list[dict], script_style: str, provider: str) -> list[dict]:
    batch_size = 4
    batches = [slides_results[index : index + batch_size] for index in range(0, len(slides_results), batch_size)]
    data_list = [
        {
            "system_prompt": build_script_system_prompt(script_style),
            "batch_content": build_script_batch_content(batch),
        }
        for batch in batches
    ]

    from backend.services.ai_gateway_service.provider_factory import get_ai_gateway_service

    ai_service = get_ai_gateway_service()

    async def run_batch(data: dict) -> dict:
        async with host._semaphore:
            try:
                content = await ai_service.chat_with_provider(
                    message=data["batch_content"],
                    context={"system_override": data["system_prompt"]},
                    provider=provider,
                )
                return {"choices": [{"message": {"content": content}}]}
            except Exception as exc:
                return {"_error": str(exc)}

    results = await asyncio.gather(*[run_batch(data) for data in data_list])
    final_scripts: list[dict] = []

    for batch_index, result in enumerate(results):
        batch = batches[batch_index]
        if not result or "_error" in result:
            for slide in batch:
                final_scripts.append(build_fallback_script_data(slide, script_style))
            continue

        script_content = ""
        try:
            script_content = str(result["choices"][0]["message"]["content"] or "").strip()
            fenced_match = re.search(r"```(?:json)?\s*(\{[\s\S]*\})\s*```", script_content, flags=re.IGNORECASE)
            if fenced_match:
                script_content = fenced_match.group(1).strip()
            else:
                brace_start = script_content.find("{")
                brace_end = script_content.rfind("}")
                if brace_start >= 0 and brace_end > brace_start:
                    script_content = script_content[brace_start : brace_end + 1]

            scripts_list = json.loads(script_content).get("scripts", [])
            if not isinstance(scripts_list, list):
                scripts_list = []
            processed_numbers: set[int] = set()

            for index, script_item in enumerate(scripts_list):
                if not isinstance(script_item, dict):
                    continue
                slide_number = normalize_slide_number(script_item.get("slide_number"))
                original_slide = None
                if slide_number is not None:
                    for slide in batch:
                        if normalize_slide_number(slide.get("slide_number")) == slide_number:
                            original_slide = slide
                            break
                if original_slide is None:
                    model_title = str(script_item.get("slide_title", "") or "").strip().lower()
                    if model_title:
                        for slide in batch:
                            if str(slide.get("title", "") or "").strip().lower() == model_title:
                                original_slide = slide
                                slide_number = normalize_slide_number(slide.get("slide_number"))
                                break
                if original_slide is None and index < len(batch):
                    original_slide = batch[index]
                    slide_number = normalize_slide_number(original_slide.get("slide_number"))
                if not original_slide or slide_number is None:
                    continue

                intro = str(script_item.get("introduction", "") or "").strip()
                main_content = script_item.get("main_content", "")
                if isinstance(main_content, list):
                    main_content_text = "\n\n".join(
                        str(item or "").strip() for item in main_content if str(item or "").strip()
                    )
                    main_body = [str(item or "").strip() for item in main_content if str(item or "").strip()]
                else:
                    main_content_text = str(main_content or "").strip()
                    main_body = [main_content_text] if main_content_text else []
                conclusion = str(script_item.get("conclusion", "") or "").strip()
                full_script = "\n\n".join(part for part in [intro, main_content_text, conclusion] if part).strip()
                if not full_script:
                    final_scripts.append(build_fallback_script_data(original_slide, script_style))
                    processed_numbers.add(slide_number)
                    continue

                final_scripts.append(
                    {
                        "slide_number": slide_number,
                        "slide_title": script_item.get("slide_title", original_slide["title"]),
                        "slide_content_points": original_slide["content"],
                        "talking_script": {
                            "intro": intro,
                            "main_body": main_body,
                            "conclusion": conclusion,
                            "full_text": full_script,
                        },
                        "estimated_duration": script_item.get("estimated_duration", "45-60 seconds"),
                        "script_style": script_style,
                        "word_count": len(full_script.split()),
                        "speaking_cues": extract_speaking_cues(full_script),
                    }
                )
                processed_numbers.add(slide_number)

            for slide in batch:
                slide_number = normalize_slide_number(slide.get("slide_number"))
                if slide_number is None or slide_number in processed_numbers:
                    continue
                final_scripts.append(build_fallback_script_data(slide, script_style))
        except (KeyError, json.JSONDecodeError, TypeError, ValueError):
            for slide in batch:
                final_scripts.append(build_fallback_script_data(slide, script_style))

    final_scripts.sort(key=lambda item: item["slide_number"])
    return final_scripts
