import asyncio
import json
import re
from typing import Any

from backend.services.ai_gateway_service import AIGatewayService


class PresentonAdapterService:
    def __init__(self, provider: str):
        self.provider = provider
        self.ai = AIGatewayService()

    @staticmethod
    def _safe_json_loads(raw: str) -> dict[str, Any] | None:
        text = (raw or "").strip()
        if not text:
            return None

        # Handle fenced code blocks.
        if "```" in text:
            parts = text.split("```")
            for chunk in parts:
                candidate = chunk.strip()
                if candidate.startswith("json"):
                    candidate = candidate[4:].strip()
                if candidate.startswith("{") and candidate.endswith("}"):
                    try:
                        return json.loads(candidate)
                    except json.JSONDecodeError:
                        pass

        # Extract first JSON object if model adds extra text.
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return None

    async def check_provider_health(self) -> tuple[bool, str]:
        return await self.ai.check_provider_health(self.provider)

    async def generate_outline(self, source_text: str, total_pages: int) -> list[dict[str, Any]]:
        prompt = (
            "You are a presentation planner. Generate a JSON object with key 'slides' as an array of "
            f"exactly {total_pages} items. Each item must include: title (string), objective (string), "
            "key_points (array of 3-5 concise strings). Return only JSON.\n\n"
            "Source content:\n"
            f"{source_text[:12000]}"
        )
        raw = await self.ai.chat_with_provider(message=prompt, provider=self.provider, context=None)
        parsed = self._safe_json_loads(raw) or {}
        slides = parsed.get("slides") if isinstance(parsed, dict) else None
        if isinstance(slides, list) and slides:
            return slides[:total_pages]

        # Fallback outline if model output is malformed.
        fallback = []
        for idx in range(total_pages):
            fallback.append(
                {
                    "title": f"Slide {idx + 1}",
                    "objective": "Explain one key idea clearly",
                    "key_points": [
                        "Core concept",
                        "Why it matters",
                        "Practical takeaway",
                    ],
                }
            )
        return fallback

    async def generate_slide_content(
        self,
        outline_item: dict[str, Any],
        num_of_bullets: int,
        words_each_bullet: int,
        slide_number: int,
    ) -> dict[str, Any]:
        title = str(outline_item.get("title") or f"Slide {slide_number}")
        objective = str(outline_item.get("objective") or "")
        key_points = outline_item.get("key_points") if isinstance(outline_item.get("key_points"), list) else []

        prompt = (
            "Generate one slide JSON with fields: title, content, latex, chart_type, chart_reasoning. "
            f"content must have exactly {num_of_bullets} bullets, each <= {words_each_bullet} words. "
            "latex must be array, chart_reasoning must be array of one string. Return only JSON.\n\n"
            f"Title: {title}\nObjective: {objective}\nKey points: {json.dumps(key_points, ensure_ascii=False)}"
        )
        raw = await self.ai.chat_with_provider(message=prompt, provider=self.provider, context=None)
        parsed = self._safe_json_loads(raw)

        if not isinstance(parsed, dict):
            parsed = {}

        bullets = parsed.get("content") if isinstance(parsed.get("content"), list) else []
        bullets = [str(x).strip() for x in bullets if str(x).strip()]
        if len(bullets) < num_of_bullets:
            seed = [
                f"{title}: key takeaway {i + 1}"
                for i in range(num_of_bullets)
            ]
            bullets = (bullets + seed)[:num_of_bullets]
        else:
            bullets = bullets[:num_of_bullets]

        slide = {
            "slide_number": slide_number,
            "title": str(parsed.get("title") or title),
            "content": bullets,
            "latex": parsed.get("latex") if isinstance(parsed.get("latex"), list) else [],
            "chart_type": str(parsed.get("chart_type") or "No Chart"),
            "chart_reasoning": parsed.get("chart_reasoning") if isinstance(parsed.get("chart_reasoning"), list) else [],
        }
        return slide

    async def generate_slides(
        self,
        outline: list[dict[str, Any]],
        num_of_bullets: int,
        words_each_bullet: int,
    ) -> list[dict[str, Any]]:
        semaphore = asyncio.Semaphore(4)

        async def _run(item: dict[str, Any], idx: int) -> dict[str, Any]:
            async with semaphore:
                return await self.generate_slide_content(
                    outline_item=item,
                    num_of_bullets=num_of_bullets,
                    words_each_bullet=words_each_bullet,
                    slide_number=idx + 1,
                )

        tasks = [_run(item, idx) for idx, item in enumerate(outline)]
        return await asyncio.gather(*tasks)
