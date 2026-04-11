"""Step B — AI script generation and slide content generation."""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Optional

from .types import logger

# ── Narration script prompts ──

SCRIPT_PROMPT_ZH = """你是一名大学教授，正在录制教学视频。{audience_hint}
以下是某一页或某段的原始内容：

{content}

{rag_context}
请为这段内容生成一段 60~100 字的口语化讲解旁白（中文），适合 TTS 朗读。
要求：自然流畅，保留关键概念，避免使用"这一页"等视觉指示词。
只输出旁白正文，不要任何前缀说明。"""

SCRIPT_PROMPT_EN = """You are a university professor recording a teaching video. {audience_hint}
Below is the raw content from one slide or section:

{content}

{rag_context}
Generate a 40-80 word spoken narration in English suitable for TTS.
Keep it natural, retain key concepts, avoid phrases like "on this slide".
Output only the narration text, no prefixes."""

SPLIT_PROMPT_ZH = """你是一名教学设计师。{audience_hint}
以下是一段课程内容：
{text}

请将其拆分为 {n} 个教学段落，每段 60~100 字口语化旁白（中文），适合TTS朗读。
以 JSON 数组格式输出，每个元素是一段旁白字符串。只输出 JSON，不要其他内容。"""

SPLIT_PROMPT_EN = """You are an instructional designer. {audience_hint}
Below is some course content:
{text}

Split it into {n} teaching segments, each 40-80 words of spoken English suitable for TTS.
Output as a JSON array of strings. Output ONLY the JSON, nothing else."""

# ── Audience presets ──
AUDIENCE_HINTS: dict[str, dict[str, str]] = {
    "student":    {"zh": "面向本科生，口语化，概念解释清楚，举例说明。",
                   "en": "Target audience: undergraduates. Use plain language, explain concepts clearly, give examples."},
    "teacher":    {"zh": "面向教师同行，可使用专业术语，深度分析，引用文献。",
                   "en": "Target audience: fellow educators. Use professional terminology, deep analysis, cite references."},
    "researcher": {"zh": "面向研究者，聚焦方法论，引用相关研究，严谨表述。",
                   "en": "Target audience: researchers. Focus on methodology, cite related work, be rigorous."},
    "general":    {"zh": "面向大众，通俗易懂，避免专业术语，生动有趣。",
                   "en": "Target audience: general public. Keep it accessible, avoid jargon, be engaging."},
}

# ── Slide content prompt (generates structured title+bullets+layoutType) ──
SLIDE_PROMPT_ZH = """你是教学视频编导。{audience_hint}
以下是本课程的背景参考资料（来自RAG检索）：
{rag_context}

以下是本段的旁白脚本：
{script}

请为本段视频幻灯片生成结构化内容（JSON），要求：
- title: 一行标题（≤20字），高度概括本段主题
- bullets: 3~5 条要点，每条 ≤25 字
- layoutType: 推荐最适合本段的幻灯片布局，从以下6种中选一个：
  "title-bullets"(标准列表), "image-left"(左图右文), "image-right"(右文左图),
  "image-top"(顶部大图), "big-quote"(大引用/金句), "two-column"(双栏对比)
  选择依据：概念讲解用title-bullets，对比分析用two-column，核心金句用big-quote，需要图示的用image-*
- quoteText: 如果layoutType是"big-quote"，提供一句精炼的核心金句（≤40字）
- col1Title/col1Bullets/col2Title/col2Bullets: 如果layoutType是"two-column"，提供左右两栏标题和要点

只输出 JSON 对象，形如 {{"title":"...","bullets":["..."],"layoutType":"title-bullets"}}"""

SLIDE_PROMPT_EN = """You are a teaching video director. {audience_hint}
Background reference material (from RAG retrieval):
{rag_context}

Narration script for this segment:
{script}

Generate structured slide content (JSON):
- title: one-line heading (≤60 chars) summarising this segment
- bullets: 3-5 key points, each ≤60 chars
- layoutType: recommend the best slide layout from these 6:
  "title-bullets"(standard list), "image-left"(left image), "image-right"(right image),
  "image-top"(top image), "big-quote"(key quote), "two-column"(two-column compare)
- quoteText: if layoutType is "big-quote", provide a concise key quote (≤80 chars)
- col1Title/col1Bullets/col2Title/col2Bullets: if layoutType is "two-column", provide both columns

Output ONLY a JSON object like {{"title":"...","bullets":["..."],"layoutType":"title-bullets"}}"""


async def _call_ai(prompt: str, provider: str = "local_ollama") -> str:
    """Call AI via the project's AIGatewayService — supports both local_ollama and coze."""
    from backend.services.ai_gateway_service import AIGatewayService
    svc = AIGatewayService()
    return await svc.chat_with_provider(
        message=prompt,
        context={"system_override": "You are a helpful teaching video script writer."},
        provider=provider,
    )


async def generate_scripts(
    chunks: list[str], lang: str = "zh", provider: str = "local_ollama",
    audience: str = "student",
) -> list[str]:
    """Generate narration scripts for all chunks concurrently."""
    template = SCRIPT_PROMPT_ZH if lang == "zh" else SCRIPT_PROMPT_EN
    hint = AUDIENCE_HINTS.get(audience, AUDIENCE_HINTS["student"])
    audience_hint = hint["zh"] if lang == "zh" else hint["en"]

    async def _one(chunk: str) -> str:
        try:
            result = await _call_ai(
                template.format(content=chunk[:800], audience_hint=audience_hint, rag_context=""),
                provider,
            )
            return result.strip() or chunk[:200]
        except Exception as exc:
            logger.warning("AI script generation failed for chunk, using raw text: %s", exc)
            return chunk[:200]

    return list(await asyncio.gather(*[_one(c) for c in chunks]))


async def optimize_full_script(
    raw_text: str, lang: str = "zh", provider: str = "local_ollama",
    max_segments: int = 8,
    audience: str = "student",
) -> list[str]:
    """When user inputs raw text, AI splits it into narration segments."""
    template = SPLIT_PROMPT_ZH if lang == "zh" else SPLIT_PROMPT_EN
    n = max(3, min(15, max_segments))
    audience_hint = AUDIENCE_HINTS.get(audience, AUDIENCE_HINTS["student"])
    hint = audience_hint["zh"] if lang == "zh" else audience_hint["en"]
    try:
        raw = await _call_ai(
            template.format(text=raw_text[:3000], n=n, audience_hint=hint),
            provider,
        )
        json_match = re.search(r"\[.*\]", raw, re.DOTALL)
        if json_match:
            segments = json.loads(json_match.group())
            return segments[:n]  # hard cap to requested max
    except Exception as exc:
        logger.warning("AI script split failed: %s", exc)
    # Fallback: split by paragraphs — hard‐truncate to n
    paras = [p.strip() for p in raw_text.split("\n\n") if len(p.strip()) > 30]
    return paras[:n] or [raw_text[:500]]


async def smart_extract(
    text: Optional[str] = None,
    file_path: Optional[str] = None,
    file_type: Optional[str] = None,
    max_segments: int = 8,
    lang: str = "zh",
    provider: str = "local_ollama",
    audience: str = "student",
) -> list[str]:
    """Unified extraction: any input → full text → AI splits into exactly ≤n segments.

    Unlike the old path (extract_text_from_md_txt → generate_scripts(chunks)),
    this always sends the full document to optimize_full_script so the AI respects
    max_segments regardless of how many paragraphs the document has.
    """
    from .extract import extract_text_from_pdf, extract_text_from_md_txt
    if file_path:
        if file_type == "pdf":
            raw_chunks = extract_text_from_pdf(file_path)
        else:
            raw_chunks = extract_text_from_md_txt(file_path)
        full_text = "\n\n".join(raw_chunks)
    elif text:
        full_text = text
    else:
        return []

    return await optimize_full_script(full_text, lang, provider, max_segments, audience)


async def generate_slide_contents(
    scripts: list[str],
    source_text: str,
    lang: str = "zh",
    provider: str = "local_ollama",
    audience: str = "student",
) -> list[dict]:
    """Generate structured slide content (title + bullets) for each script segment.

    Uses RAG (LocalRagService) to retrieve relevant context from source_text,
    then asks AI to produce a title + bullets JSON per segment.
    Returns a list of dicts: [{"title": "...", "bullets": ["...", ...]}, ...]
    """
    hint = AUDIENCE_HINTS.get(audience, AUDIENCE_HINTS["student"])
    audience_hint = hint["zh"] if lang == "zh" else hint["en"]
    template = SLIDE_PROMPT_ZH if lang == "zh" else SLIDE_PROMPT_EN

    # Build RAG context if source_text is available
    rag_context_str = ""
    if source_text and len(source_text) > 100:
        try:
            from backend.services.tfidf_rag_service import LocalRagService
            rag_svc = LocalRagService()
            rag_result = rag_svc.build_rag_context(
                document_text=source_text,
                query=" ".join(s[:60] for s in scripts[:3]),
                top_k=4,
            )
            chunks = rag_result.get("retrieved_chunks", [])
            if chunks:
                rag_context_str = "\n".join(c.get("text", "")[:200] for c in chunks[:4])
        except Exception as exc:
            logger.warning("RAG context retrieval failed, proceeding without: %s", exc)

    async def _one(script: str) -> dict:
        try:
            raw = await _call_ai(
                template.format(
                    script=script[:500],
                    audience_hint=audience_hint,
                    rag_context=rag_context_str or "(无额外参考)" if lang == "zh" else "(no additional context)",
                ),
                provider,
            )
            # Parse JSON from AI response
            json_match = re.search(r"\{.*\}", raw, re.DOTALL)
            if json_match:
                parsed = json.loads(json_match.group())
                if "title" in parsed and "bullets" in parsed:
                    result: dict = {
                        "title": str(parsed["title"])[:60],
                        "bullets": [str(b)[:80] for b in parsed["bullets"][:7]],
                    }
                    # V2 fields
                    valid_layouts = {"title-bullets", "image-left", "image-right", "image-top", "big-quote", "two-column"}
                    lt = parsed.get("layoutType", "title-bullets")
                    result["layoutType"] = lt if lt in valid_layouts else "title-bullets"
                    if lt == "big-quote" and parsed.get("quoteText"):
                        result["quoteText"] = str(parsed["quoteText"])[:80]
                    if lt == "two-column":
                        result["col1Title"] = str(parsed.get("col1Title", ""))[:40]
                        result["col1Bullets"] = [str(b)[:60] for b in (parsed.get("col1Bullets") or [])[:5]]
                        result["col2Title"] = str(parsed.get("col2Title", ""))[:40]
                        result["col2Bullets"] = [str(b)[:60] for b in (parsed.get("col2Bullets") or [])[:5]]
                    return result
        except Exception as exc:
            logger.warning("Slide content generation failed: %s", exc)
        # Fallback: extract first line as title, rest as single bullet
        lines = script.strip().split("。" if lang == "zh" else ". ")
        return {
            "title": (lines[0][:40] if lines else ""),
            "bullets": [l[:60] for l in lines[1:4]] or [script[:60]],
            "layoutType": "title-bullets",
        }

    return list(await asyncio.gather(*[_one(s) for s in scripts]))
