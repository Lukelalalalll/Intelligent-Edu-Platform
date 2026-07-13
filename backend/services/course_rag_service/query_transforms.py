"""Query transformation utilities: Multi-Query expansion, HyDE, Self-Query.

All LLM calls use *async* Ollama calls to avoid blocking the asyncio event loop.

Modules
-------
expand_query        — generate N semantically-equivalent query variants
generate_hyde_query — Hypothetical Document Embedding (HyDE) query
extract_metadata_filters — heuristic Self-Query metadata filter extraction
"""
from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional

import httpx

from backend.config import Config

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Shared Ollama async helper
# ---------------------------------------------------------------------------

async def _async_ollama_chat(prompt: str, max_tokens: int = 200) -> str:
    """Call Ollama asynchronously. Returns '' on any failure."""
    url = f"{Config.OLLAMA_BASE_URL}/api/chat"
    payload = {
        "model": Config.OLLAMA_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "options": {"num_predict": max_tokens, "temperature": 0.4, "top_p": 0.9},
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
        return str((data.get("message") or {}).get("content", "")).strip()
    except Exception as exc:
        logger.debug("Query transform LLM call failed: %s", exc)
        return ""


# ---------------------------------------------------------------------------
# Multi-Query expansion
# ---------------------------------------------------------------------------

_MULTI_QUERY_PROMPT_ZH = (
    "你是一个搜索查询改写助手。"
    "为以下问题生成 {n} 个不同表述的搜索查询（中英文均可），每行一个，"
    "只输出查询本身，不要编号或解释。\n"
    "原始问题：{query}"
)

_MULTI_QUERY_PROMPT_EN = (
    "You are a search query rewriter. "
    "Generate {n} different rephrased search queries for the following question, one per line. "
    "Output only the queries themselves, without numbering or explanation.\n"
    "Original question: {query}"
)


async def expand_query(query: str, n: int = 2) -> List[str]:
    """Return the original query plus up to *n* rephrased variants.

    Falls back to ``[query]`` if the LLM call fails or returns garbage.

    Example::

        >>> await expand_query("牛顿第二定律的应用", n=2)
        ['牛顿第二定律的应用', 'F=ma的实际应用场景', '力和加速度的关系例子']
    """
    prompt_template = _MULTI_QUERY_PROMPT_ZH if _is_zh(query) else _MULTI_QUERY_PROMPT_EN
    prompt = prompt_template.format(n=n, query=query.strip())
    raw = await _async_ollama_chat(prompt, max_tokens=n * 40)
    if not raw:
        return [query]

    lines = [ln.strip() for ln in raw.splitlines() if ln.strip() and len(ln.strip()) > 3]
    variants = [v for v in lines[:n] if v.lower() != query.lower()]
    return [query] + variants  # original always first


# ---------------------------------------------------------------------------
# HyDE — Hypothetical Document Embedding
# ---------------------------------------------------------------------------

_HYDE_PROMPT_ZH = (
    "请根据以下问题，写一段简短的假设性回答（100字以内），"
    "语言专业，涵盖问题涉及的核心概念，即使不完全准确也无妨。"
    "只输出回答本身，不要任何引言。\n"
    "问题：{query}\n"
    "回答："
)

_HYDE_PROMPT_EN = (
    "Write a short hypothetical answer (under 100 words) to the following question. "
    "Use professional language covering key concepts, even if not fully accurate. "
    "Output only the answer itself, no preamble.\n"
    "Question: {query}\n"
    "Answer:"
)

# ── Prompt selection ──────────────────────────────────────────────────────

def _detect_language(text: str) -> str:
    """Heuristic language detection: returns 'zh' or 'en'."""
    zh_chars = sum(1 for ch in text if '一' <= ch <= '鿿')
    return 'zh' if zh_chars > len(text) * 0.15 else 'en'

def _is_zh(query: str) -> bool:
    lang = Config.RAG_QUERY_LANGUAGE.strip().lower()
    if lang == 'zh':
        return True
    if lang == 'en':
        return False
    return _detect_language(query) == 'zh'


async def generate_hyde_query(query: str) -> Optional[str]:
    """Generate a hypothetical answer passage to use as an additional retrieval query.

    HyDE (Gao et al., 2022) embeds the *answer* instead of the *question* to
    reduce the query–document embedding gap in asymmetric retrieval.

    Returns ``None`` if the LLM call fails.
    """
    prompt_template = _HYDE_PROMPT_ZH if _is_zh(query) else _HYDE_PROMPT_EN
    raw = await _async_ollama_chat(prompt_template.format(query=query.strip()), max_tokens=160)
    return raw.strip() or None


# ---------------------------------------------------------------------------
# Self-Query — heuristic metadata filter extraction
# ---------------------------------------------------------------------------

_CHAPTER_PATTERNS: List[re.Pattern] = [
    re.compile(r"第\s*([一二三四五六七八九十百千\d]+)\s*[章节讲部分]", re.IGNORECASE),
    re.compile(r"chapter\s*(\d+)", re.IGNORECASE),
    re.compile(r"unit\s*(\d+)", re.IGNORECASE),
    re.compile(r"lecture\s*(\d+)", re.IGNORECASE),
    re.compile(r"module\s*(\d+)", re.IGNORECASE),
    re.compile(r"week\s*(\d+)", re.IGNORECASE),
    re.compile(r"\bch\.?\s*(\d+)\b", re.IGNORECASE),
]

_CN_NUMS: Dict[str, str] = {
    "一": "1", "二": "2", "三": "3", "四": "4", "五": "5",
    "六": "6", "七": "7", "八": "8", "九": "9", "十": "10",
    "十一": "11", "十二": "12",
}


def extract_metadata_filters(
    query: str,
    available_chapters: Optional[List[str]] = None,
    available_docs: Optional[List[str]] = None,
) -> Dict[str, str]:
    """Extract chapter_id / doc_name filters from a natural language query.

    Uses regex patterns only (no LLM call) for low-latency Self-Query.
    Matching is fuzzy: "第二章" matches any chapter_id containing "2".

    Returns a (possibly empty) dict, e.g. ``{"chapter_id": "ch2"}``.
    """
    filters: Dict[str, str] = {}
    q_lower = query.lower()

    # ── Chapter detection ─────────────────────────────────────────
    for pat in _CHAPTER_PATTERNS:
        m = pat.search(query)
        if m:
            num_str = m.group(1)
            num_str = _CN_NUMS.get(num_str, num_str)  # translate CN numerals
            if available_chapters:
                matched = next(
                    (ch for ch in available_chapters if num_str in str(ch)),
                    None,
                )
                if matched:
                    filters["chapter_id"] = matched
            break  # only use first chapter mention

    # ── Document name detection (fuzzy substring) ─────────────────
    if available_docs and "doc_name" not in filters:
        q_norm = re.sub(r"[-_.\s]", "", q_lower)
        for doc in available_docs:
            doc_stem = re.sub(r"[-_.\s]", "", doc.lower())
            if len(doc_stem) >= 5 and doc_stem in q_norm:
                filters["doc_name"] = doc
                break

    return filters
