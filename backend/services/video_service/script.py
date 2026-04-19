"""Step B — AI script generation and slide content generation."""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Optional

from .types import logger


def _parse_json_object(raw: str) -> dict | None:
    """Robustly extract and parse the first JSON object from an LLM response.

    Handles:
    - Prose before/after the JSON block
    - Extra data after the closing brace
    - Invalid escape sequences emitted by local LLMs (e.g. \\d, \\s, \\p)
    """
    # Find the start of the first '{' character
    start = raw.find('{')
    if start == -1:
        return None

    # Walk forward to find the matching closing '}'
    depth = 0
    end = -1
    in_string = False
    escape_next = False
    for i, ch in enumerate(raw[start:], start):
        if escape_next:
            escape_next = False
            continue
        if ch == '\\' and in_string:
            escape_next = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                end = i + 1
                break

    if end == -1:
        # No matched brace found; try rfind as best-effort
        end = raw.rfind('}') + 1
        if end <= start:
            return None

    candidate = raw[start:end]

    # Try parsing directly first
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        pass

    # Fix invalid escape sequences: replace \X where X is not a valid JSON escape char
    # Valid: \" \\ \/ \b \f \n \r \t \uXXXX
    fixed = re.sub(r'\\(?!["\\/bfnrtu])', r'\\\\', candidate)
    try:
        return json.loads(fixed)
    except json.JSONDecodeError:
        pass

    # Last resort: strip ALL backslash sequences that aren't \" or \\
    stripped = re.sub(r'\\(?!["\\/])', '', candidate)
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        return None

# ── Narration script prompts ──

SCRIPT_PROMPT_ZH = """You are a university professor recording a teaching video. {audience_hint}
Below is the raw content from one slide or section:

{content}

{rag_context}
Generate a 60-100 character spoken Chinese narration suitable for TTS.
Keep it natural and fluent, retain key concepts, avoid visual cues like "on this page".
Output only the narration text, no prefixes."""

SCRIPT_PROMPT_EN = """You are a university professor recording a teaching video. {audience_hint}
Below is the raw content from one slide or section:

{content}

{rag_context}
Generate a 40-80 word spoken narration in English suitable for TTS.
Keep it natural, retain key concepts, avoid phrases like "on this slide".
Output only the narration text, no prefixes."""

SPLIT_PROMPT_ZH = """You are an instructional designer. {audience_hint}
Below is some course content:
{text}

Split it into {n} teaching segments, each 60-100 characters of spoken Chinese suitable for TTS.
Output as a JSON array of strings. Output ONLY the JSON, nothing else."""

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
SLIDE_PROMPT_ZH = """You are a teaching video director. {audience_hint}
Background reference material (from RAG retrieval):
{rag_context}

Narration script for this segment:
{script}

Generate structured slide content (JSON) with Chinese text:
- title: one-line Chinese heading (≤20 characters) summarising this segment
- bullets: 3-5 key points in Chinese, each ≤25 characters
- layoutType: recommend the best slide layout from these 6:
  "title-bullets"(standard list), "image-left"(left image), "image-right"(right image),
  "image-top"(top image), "big-quote"(key quote), "two-column"(two-column compare)
  Choose based on: concept explanation → title-bullets, comparison → two-column, key quote → big-quote, visual needed → image-*
- quoteText: if layoutType is "big-quote", provide a concise Chinese key quote (≤40 characters)
- col1Title/col1Bullets/col2Title/col2Bullets: if layoutType is "two-column", provide both columns

Output ONLY a JSON object like {{"title":"...","bullets":["..."],"layoutType":"title-bullets"}}"""

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
            # Fix invalid escape sequences before parsing the array
            arr_str = json_match.group()
            arr_str_fixed = re.sub(r'\\(?!["\\/bfnrtu])', r'\\\\', arr_str)
            try:
                segments = json.loads(arr_str_fixed)
            except json.JSONDecodeError:
                segments = json.loads(re.sub(r'\\(?!["\\/])', '', arr_str))
            # Normalize: LLMs sometimes return [{text:...}] instead of ["..."]
            def _to_str(item) -> str:
                if isinstance(item, str):
                    return item
                if isinstance(item, dict):
                    # Try common keys the model might use
                    for key in ("text", "script", "narration", "content", "segment"):
                        if key in item:
                            return str(item[key])
                    # Fall back to joining all values
                    return " ".join(str(v) for v in item.values())
                return str(item)
            segments = [_to_str(s) for s in segments if s]
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

    # Ensure every script is a plain string even if upstream returned dicts
    scripts = [s if isinstance(s, str) else str(s) for s in scripts]

    # Build RAG context if source_text is available
    rag_context_str = ""
    if source_text and len(source_text) > 100:
        try:
            from backend.services.tfidf_rag_service import LocalRagService
            rag_svc = LocalRagService()
            rag_result = rag_svc.build_rag_context(
                document_text=source_text,
                query=" ".join(str(s)[:60] for s in scripts[:3]),
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
                    rag_context=rag_context_str or ("(无额外参考)" if lang == "zh" else "(no additional context)"),
                ),
                provider,
            )
            # Parse JSON from AI response using robust parser
            parsed = _parse_json_object(raw)
            if parsed and "title" in parsed and "bullets" in parsed:
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
