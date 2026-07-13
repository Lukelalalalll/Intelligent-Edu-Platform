"""
Structured Highlight Classifier — Classifies raw highlights into semantic categories
with confidence scores, enabling batch filtering and improved summarization quality.

Categories:
- definition: Technical terms, formal definitions
- concept: Core ideas, principles, frameworks
- formula: Mathematical expressions, equations
- example: Case studies, concrete instances
- conclusion: Key findings, takeaways, results
- caution: Warnings, limitations, edge cases, caveats

Each highlight gets: original text, category, confidence (0-1), reasoning snippet.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import aiohttp

from backend.config import Config

logger = logging.getLogger(__name__)

CATEGORIES = ["definition", "concept", "formula", "example", "conclusion", "caution"]

SYSTEM_PROMPT = """You are an expert academic content classifier. Given a list of highlighted text excerpts from educational material, classify each one into exactly ONE of the following categories:

- definition: Technical terms, formal definitions, specifications
- concept: Core ideas, principles, theoretical frameworks, abstract notions
- formula: Mathematical expressions, equations, quantitative relationships
- example: Case studies, concrete instances, illustrations, demonstrations
- conclusion: Key findings, takeaways, results, summaries
- caution: Warnings, limitations, edge cases, caveats, common mistakes

For each highlight, output:
1. "category": one of the 6 categories above
2. "confidence": a float 0.0-1.0 indicating classification certainty
3. "reason": a brief (≤10 word) explanation of why this category

Output ONLY a JSON array (no markdown, no explanation):
[
  {"index": 0, "category": "concept", "confidence": 0.92, "reason": "describes core theoretical principle"},
  ...
]"""


class HighlightClassifier:
    """Classify highlight texts into structured categories using LLM."""

    def __init__(self):
        self.url = "https://api.deepseek.com/v1/chat/completions"
        self.headers = {
            "Authorization": f"Bearer {Config.DEEPSEEK_API_KEY}",
            "Content-Type": "application/json",
        }

    async def classify_async(self, highlights: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """
        Classify a list of highlights.

        Args:
            highlights: list of {"text": str, "id": str, "sectionTitle": str}

        Returns:
            Same highlights enriched with "category", "confidence", "reason" fields.
        """
        if not highlights:
            return []

        # Build user prompt with numbered highlights
        lines = []
        for i, h in enumerate(highlights):
            text = h.get("text", "").strip()
            section = h.get("sectionTitle", "")
            lines.append(f"[{i}] (Section: {section}) {text}")

        user_content = f"Classify these {len(highlights)} highlights:\n\n" + "\n".join(lines)

        data = {
            "model": "deepseek-chat",
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            "stream": False,
            "max_tokens": min(len(highlights) * 80, 4000),
            "temperature": 0.2,
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.url, json=data, headers=self.headers,
                    ssl=False, timeout=aiohttp.ClientTimeout(total=60)
                ) as resp:
                    resp.raise_for_status()
                    result = await resp.json()

            raw = result["choices"][0]["message"]["content"].strip()
            raw = raw.strip("`").removeprefix("json").strip()
            classifications = json.loads(raw)

            # Build lookup by index
            cls_map: dict[int, dict] = {}
            for c in classifications:
                idx = c.get("index", -1)
                if 0 <= idx < len(highlights):
                    cls_map[idx] = {
                        "category": c.get("category", "concept") if c.get("category") in CATEGORIES else "concept",
                        "confidence": max(0.0, min(1.0, float(c.get("confidence", 0.5)))),
                        "reason": str(c.get("reason", ""))[:100],
                    }

            # Merge back
            enriched = []
            for i, h in enumerate(highlights):
                entry = {**h}
                if i in cls_map:
                    entry.update(cls_map[i])
                else:
                    entry["category"] = "concept"
                    entry["confidence"] = 0.5
                    entry["reason"] = "classification unavailable"
                enriched.append(entry)

            return enriched

        except Exception as e:
            logger.exception("Highlight classification failed, returning defaults")
            # Fallback: return all as 'concept' with low confidence
            return [
                {**h, "category": "concept", "confidence": 0.3, "reason": "classification failed"}
                for h in highlights
            ]

    def classify(self, highlights: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Synchronous wrapper for classify_async."""
        return asyncio.run(self.classify_async(highlights))
