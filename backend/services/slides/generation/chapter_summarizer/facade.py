from __future__ import annotations

import asyncio

import aiohttp

from backend.config import Config

from .api_client import MAX_CONCURRENT_LLM_CALLS, fetch_summary_payload
from .page_distribution import calculate_initial_points
from .prompts import SUMMARY_SYSTEM_PROMPT, build_summary_prompt
from .response_parser import build_failed_slide, parse_summary_result
from .script_generation import (
    build_fallback_script_data,
    extract_speaking_cues,
    generate_talking_scripts,
    normalize_slide_number,
    process_script_content,
)


class ChapterSummarizer:
    def __init__(self):
        self.url = "https://api.deepseek.com/v1/chat/completions"
        self.headers = {
            "Authorization": f"Bearer {Config.DEEPSEEK_API_KEY}",
            "Content-Type": "application/json",
        }
        self._semaphore = asyncio.Semaphore(MAX_CONCURRENT_LLM_CALLS)
        self.system_prompt = SUMMARY_SYSTEM_PROMPT

    def _get_prompt(self, target_pages, chapter_index, total_chapters, num_of_bullets=3, words_each_bullet=25):
        return build_summary_prompt(
            target_pages,
            chapter_index,
            total_chapters,
            num_of_bullets=num_of_bullets,
            words_each_bullet=words_each_bullet,
        )

    async def fetch_data(self, session, data):
        return await fetch_summary_payload(
            session=session,
            url=self.url,
            headers=self.headers,
            payload=data,
        )

    def _calculate_initial_points(self, highlights_data, total_pages):
        return calculate_initial_points(highlights_data, total_pages)

    async def _summarize_with_points(self, highlights_data, pages_distribution, num_of_bullets=3, words_each_bullet=25):
        data_list = [
            {
                "model": "deepseek-chat",
                "messages": [
                    {"role": "system", "content": self.system_prompt},
                    {
                        "role": "user",
                        "content": self._get_prompt(
                            pages_distribution[index],
                            index,
                            len(highlights_data),
                            num_of_bullets,
                            words_each_bullet,
                        )
                        + f"\nChapter Title: {item['sectionTitle']}\nContent: {item['text']}",
                    },
                ],
                "stream": False,
                "max_tokens": 1000,
                "temperature": 0.5,
            }
            for index, item in enumerate(highlights_data)
        ]

        final_results: list[dict] = []
        current_slide_number = 1
        async with aiohttp.ClientSession() as session:
            results = await asyncio.gather(*[self.fetch_data(session, data) for data in data_list])
            for index, result in enumerate(results):
                target_pages = pages_distribution[index]
                chapter_title = highlights_data[index].get("sectionTitle", f"Chapter {index + 1}")
                if result and "_error" not in result:
                    try:
                        slides = parse_summary_result(result)
                        for slide in slides:
                            slide["slide_number"] = current_slide_number
                            slide["_status"] = "success"
                            current_slide_number += 1
                            final_results.append(slide)
                        continue
                    except (KeyError, ValueError):
                        error_message = "parse_error"
                else:
                    error_message = result.get("_error", "unknown") if result else "no_response"

                for page_index in range(target_pages):
                    final_results.append(
                        build_failed_slide(
                            chapter_title=chapter_title,
                            slide_number=current_slide_number,
                            error_message=error_message,
                            continuation=page_index > 0,
                        )
                    )
                    current_slide_number += 1
        return final_results

    async def summarize_chapters(self, highlights_data, total_pages, num_of_bullets=3, words_each_bullet=25):
        pages_distribution = self._calculate_initial_points(highlights_data, total_pages)
        return await self._summarize_with_points(
            highlights_data,
            pages_distribution,
            num_of_bullets,
            words_each_bullet,
        )

    def summarize(self, highlights_data, total_pages, num_of_bullets=3, words_each_bullet=25):
        return asyncio.run(
            self.summarize_chapters(highlights_data, total_pages, num_of_bullets, words_each_bullet)
        )

    async def generate_talking_script(self, slides_results, script_style="academic", provider="local_ollama"):
        return await generate_talking_scripts(
            host=self,
            slides_results=slides_results,
            script_style=script_style,
            provider=provider,
        )

    def _process_script_content(self, raw_script):
        return process_script_content(raw_script)

    def _extract_speaking_cues(self, script):
        return extract_speaking_cues(script)

    def _normalize_slide_number(self, value):
        return normalize_slide_number(value)

    def _build_fallback_script_data(self, slide, script_style):
        return build_fallback_script_data(slide, script_style)

    def generate_script_sync(self, slides_results, script_style="academic"):
        return asyncio.run(self.generate_talking_script(slides_results, script_style))
