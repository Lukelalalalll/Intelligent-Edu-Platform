"""Adaptive query planning and structured filter extraction for course RAG."""
from __future__ import annotations

import re
from typing import Any

from backend.config import Config

from .types import QueryClass, RetrievalPlan

_QUERY_HINTS: list[tuple[QueryClass, tuple[str, ...]]] = [
    ("comparison", ("compare", "difference", "vs", "versus", "contrast", "区别", "比较", "对比")),
    ("multi-hop", ("relationship", "connection", "how do", "why does", "depends on", "关联", "联系", "为什么会")),
    ("keyword/factoid", ("when", "how many", "deadline", "date", "which page", "多少", "哪一页", "截止", "日期")),
    ("chapter/doc constrained", ("chapter", "module", "section", "document", "doc", "lecture", "章节", "模块", "文档")),
    ("concept/explanation", ("what is", "explain", "definition", "concept", "原理", "解释", "定义", "概念")),
]

_DOC_PATTERN = re.compile(r"([A-Za-z0-9_\-]+\.(?:pdf|md|txt|pptx|docx))", re.IGNORECASE)
_PAGE_RANGE_PATTERN = re.compile(r"(?:page|pages|p\.?)\s*(\d+)\s*(?:-|to|–|—)\s*(\d+)", re.IGNORECASE)
_PAGE_PATTERN = re.compile(r"(?:page|p\.?)\s*(\d+)", re.IGNORECASE)
_SECTION_PATTERN = re.compile(r"(?:section|sec\.?)\s*([A-Za-z0-9_.\-]+)", re.IGNORECASE)
_HEADING_LEVEL_PATTERN = re.compile(r"(?:heading|title)\s*level\s*(\d+)", re.IGNORECASE)
_CHAPTER_PATTERNS = [
    re.compile(r"(?:chapter|ch\.?|unit|module|week|lecture)\s*([A-Za-z0-9_.\-]+)", re.IGNORECASE),
    re.compile(r"第\s*([一二三四五六七八九十百0-9]+)\s*(?:章|节|讲|单元)"),
]
_OUT_OF_DOMAIN_MARKERS = ("天气", "股票", "总统", "娱乐新闻", "彩票", "nba", "nfl")
_CN_NUM_MAP = {
    "零": "0",
    "一": "1",
    "二": "2",
    "三": "3",
    "四": "4",
    "五": "5",
    "六": "6",
    "七": "7",
    "八": "8",
    "九": "9",
    "十": "10",
}
_DECOMPOSE_SEPARATORS = re.compile(r"\b(?:and|vs|versus|compared with|with)\b|以及|并且|和|对比|比较", re.IGNORECASE)


def build_retrieval_plan(
    *,
    query: str,
    rag_profile: str = "",
    force_query_class: str = "",
    available_docs: list[str] | None = None,
    available_chapters: list[str] | None = None,
) -> RetrievalPlan:
    q = str(query or "").strip()
    query_class = _classify_query(q, force_query_class=force_query_class)
    metadata_filters = extract_structured_filters(
        q,
        available_docs=available_docs or [],
        available_chapters=available_chapters or [],
    )

    if metadata_filters and query_class not in {"comparison", "multi-hop"}:
        query_class = "chapter/doc constrained"

    profile = _normalize_profile(rag_profile or Config.RAG_DEFAULT_PROFILE)
    decomposed = decompose_query(q, query_class=query_class)

    allow_multi_query = query_class in {"concept/explanation", "comparison", "multi-hop"}
    allow_hyde = query_class in {"concept/explanation", "multi-hop"}
    if query_class == "keyword/factoid":
        allow_hyde = False
        allow_multi_query = False

    use_late_interaction = bool(
        Config.RAG_USE_LATE_INTERACTION
        and profile == "high-recall"
        and query_class in {"comparison", "multi-hop"}
    )
    web_policy = "on_low_confidence" if Config.RAG_ENABLE_WEB_CORRECTION else "disabled"
    notes: list[str] = []
    if metadata_filters:
        notes.append("structured_filters")
    if decomposed:
        notes.append("decomposed_query")

    return RetrievalPlan(
        query_class=query_class,
        decomposed_queries=decomposed,
        metadata_filters=metadata_filters,
        retrieval_profile=profile,
        web_fallback_policy=web_policy,
        allow_multi_query=allow_multi_query,
        allow_hyde=allow_hyde,
        use_hybrid=True,
        use_late_interaction=use_late_interaction,
        notes=notes,
    )


def extract_structured_filters(
    query: str,
    *,
    available_docs: list[str],
    available_chapters: list[str],
) -> dict[str, Any]:
    q = str(query or "").strip()
    if not q:
        return {}

    filters: dict[str, Any] = {}

    doc_match = _DOC_PATTERN.search(q)
    if doc_match:
        matched_doc = _match_available(doc_match.group(1), available_docs)
        if matched_doc:
            filters["doc_name"] = matched_doc

    for pat in _CHAPTER_PATTERNS:
        match = pat.search(q)
        if not match:
            continue
        raw = _normalize_chapter_value(match.group(1))
        chapter = _match_available(raw, available_chapters)
        if chapter:
            filters["chapter_id"] = chapter
            break

    page_range_match = _PAGE_RANGE_PATTERN.search(q)
    if page_range_match:
        start_page = int(page_range_match.group(1))
        end_page = int(page_range_match.group(2))
        filters["page_start"] = min(start_page, end_page)
        filters["page_end"] = max(start_page, end_page)
    else:
        page_match = _PAGE_PATTERN.search(q)
        if page_match:
            page_num = int(page_match.group(1))
            filters["page_start"] = page_num
            filters["page_end"] = page_num

    section_match = _SECTION_PATTERN.search(q)
    if section_match:
        filters["section_path"] = section_match.group(1)

    heading_level_match = _HEADING_LEVEL_PATTERN.search(q)
    if heading_level_match:
        filters["heading_level"] = int(heading_level_match.group(1))

    lowered = q.lower()
    if "table" in lowered or "表格" in q:
        filters["node_type"] = "table_chunk"
    elif "summary" in lowered or "总结" in q:
        filters["node_type"] = "section_summary"

    return filters


def decompose_query(query: str, *, query_class: QueryClass) -> list[str]:
    q = str(query or "").strip()
    if query_class not in {"comparison", "multi-hop"}:
        return []

    normalized = re.sub(r"\s+", " ", q)
    parts = [
        p.strip(" ,;，；")
        for p in _DECOMPOSE_SEPARATORS.split(normalized)
        if p.strip(" ,;，；")
    ]
    deduped: list[str] = []
    for part in parts:
        if part and part.lower() != normalized.lower() and part not in deduped:
            deduped.append(part)
    return deduped[:4]


def _classify_query(query: str, *, force_query_class: str = "") -> QueryClass:
    forced = str(force_query_class or "").strip().lower()
    valid = {
        "keyword/factoid",
        "concept/explanation",
        "comparison",
        "multi-hop",
        "chapter/doc constrained",
        "out-of-domain",
    }
    if forced in valid:
        return forced  # type: ignore[return-value]

    lowered = str(query or "").lower()
    if any(marker in lowered for marker in _OUT_OF_DOMAIN_MARKERS):
        return "out-of-domain"
    for label, markers in _QUERY_HINTS:
        if any(m in lowered or m in query for m in markers):
            return label
    if len(lowered.split()) <= 6:
        return "keyword/factoid"
    return "concept/explanation"


def _normalize_profile(profile: str) -> str:
    normalized = str(profile or "").strip().lower()
    if normalized in {"low-latency", "balanced", "high-recall"}:
        return normalized
    return "balanced"


def _normalize_chapter_value(value: str) -> str:
    raw = str(value or "").strip()
    return "".join(_CN_NUM_MAP.get(ch, ch) for ch in raw)


def _match_available(raw: str, candidates: list[str]) -> str:
    if not raw:
        return ""
    lowered = raw.lower()
    for candidate in candidates:
        cand = str(candidate or "")
        if cand.lower() == lowered or lowered in cand.lower():
            return cand
    return ""
