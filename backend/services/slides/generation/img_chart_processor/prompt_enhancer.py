from __future__ import annotations

import asyncio

import aiohttp

from .default_assets import format_content_list, generate_image_prompt
from .prompt_persistence import save_prompt_to_file


async def call_deepseek_for_prompt(*, api_key: str | None, base_url: str, image_data: dict) -> str:
    if not api_key:
        return generate_image_prompt(image_data)

    title = image_data.get("title", "")
    content_list = image_data.get("content_list", [])
    original_text = image_data.get("original_text", "")
    system_prompt = """
You are an expert image prompt engineer for text-to-image models.
Generate one concise descriptive sentence for a text-free image.
""".strip()
    user_prompt = f"""
Title: {title}
Content: {format_content_list(content_list)}
Context: {original_text[:800] if original_text else 'General business/academic presentation'}

Generate one descriptive sentence for a text-free image.
""".strip()
    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "max_tokens": 500,
        "temperature": 0,
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    timeout = aiohttp.ClientTimeout(total=30)

    async with aiohttp.ClientSession(timeout=timeout) as session:
        try:
            async with session.post(f"{base_url}/chat/completions", json=payload, headers=headers) as response:
                if response.status != 200:
                    raise RuntimeError(await response.text())
                result = await response.json()
                content = result["choices"][0]["message"]["content"].strip()
                if content.startswith("```"):
                    lines = content.split("\n")
                    if lines[0].startswith("```"):
                        lines = lines[1:]
                    if lines and lines[-1].strip() == "```":
                        lines = lines[:-1]
                    content = "\n".join(lines).strip()
                return content
        except asyncio.TimeoutError as exc:
            raise RuntimeError("DeepSeek API request timed out") from exc
        except Exception as exc:
            raise RuntimeError(f"DeepSeek API call failed: {exc}") from exc


async def generate_all_prompts_async(*, host, image_data_list: list[dict]) -> list[dict]:
    image_tasks = []
    chart_data = []
    for index, image_data in enumerate(image_data_list):
        if image_data.get("type") == "image":
            image_tasks.append(host._generate_image_prompt_with_deepseek_async(image_data, index))
        else:
            enhanced_data = image_data.copy()
            chart_reasoning = image_data.get("chart_reasoning", [])
            if chart_reasoning:
                chart_prompt = chart_reasoning[0]
                enhanced_data["enhanced_prompt"] = chart_prompt
                save_prompt_to_file(
                    prompt=chart_prompt,
                    image_data=image_data,
                    prompt_type="chart",
                    prompt_save_dir=host.prompt_save_dir,
                )
            else:
                enhanced_data["enhanced_prompt"] = "No chart reasoning provided"
            chart_data.append(enhanced_data)

    enhanced_image_data = await asyncio.gather(*image_tasks) if image_tasks else []
    ordered_data = []
    image_index = 0
    chart_index = 0
    for image_data in image_data_list:
        if image_data.get("type") == "image":
            ordered_data.append(enhanced_image_data[image_index])
            image_index += 1
        else:
            ordered_data.append(chart_data[chart_index])
            chart_index += 1
    return ordered_data
