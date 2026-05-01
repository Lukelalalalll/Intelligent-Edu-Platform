"""Text chunking and section-splitting utilities (pure functions)."""
from __future__ import annotations

import re
from typing import Any, Dict, List

from langchain_text_splitters import RecursiveCharacterTextSplitter


def estimate_page_num(text: str, char_start: int) -> int:
    prefix = (text or "")[: max(0, char_start)]
    page_breaks = prefix.count("\f")
    if page_breaks > 0:
        return page_breaks + 1
    return (max(0, char_start) // 3000) + 1


def split_document_sections(text: str) -> List[Dict[str, Any]]:
    lines = (text or "").splitlines()
    sections: List[Dict[str, Any]] = []
    stack: List[tuple[int, str]] = []

    current_title = "Document"
    current_path = "Document"
    current_level = 0
    current_lines: List[str] = []

    # Enhanced heading patterns supporting Markdown, numbered, English
    # structural words, Chinese chapter markers, and ALL-CAPS slide titles
    md_heading = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
    numbered_heading = re.compile(r"^(\d+(?:\.\d+)*)\s+([A-Z\u4e00-\u9fff].+?)\s*$")
    chapter_heading = re.compile(
        r"^(?:Chapter|Section|Lecture|Lab|Week|Part|Module|Unit)\s+\d+",
        re.IGNORECASE,
    )
    chinese_heading = re.compile(r"^第[一二三四五六七八九十百千\d]+[章节讲部分]")
    allcaps_heading = re.compile(r"^[A-Z][A-Z\s]{3,}$")
    indented_numbered = re.compile(r"^\s{0,4}(\d+)\s+([A-Z\u4e00-\u9fff].{5,50})\s*$")

    def flush_current() -> None:
        content = "\n".join(current_lines).strip()
        if not content:
            return
        sections.append(
            {
                "section_title": current_title,
                "section_path": current_path,
                "heading_level": current_level,
                "content": content,
            }
        )

    def _match_heading(line: str):
        """Try all heading patterns. Returns (level, title) or None."""
        m = md_heading.match(line)
        if m:
            return len(m.group(1)), m.group(2).strip()

        n = numbered_heading.match(line)
        if n:
            numbering = n.group(1)
            level = min(6, numbering.count(".") + 1)
            return level, f"{numbering} {n.group(2).strip()}"

        if chapter_heading.match(line):
            return 1, line.strip()

        if chinese_heading.match(line):
            return 1, line.strip()

        if allcaps_heading.match(line) and len(line.strip()) <= 60:
            return 2, line.strip()

        ind = indented_numbered.match(line)
        if ind:
            return 2, f"{ind.group(1)} {ind.group(2).strip()}"

        return None

    for raw in lines:
        line = str(raw or "").rstrip()
        heading = _match_heading(line)

        if heading:
            flush_current()
            current_lines = []
            level, title = heading

            while stack and stack[-1][0] >= level:
                stack.pop()
            stack.append((level, title))

            current_title = title
            current_level = level
            current_path = " > ".join(item[1] for item in stack)
            continue

        current_lines.append(line)

    flush_current()
    if sections:
        return sections

    fallback = (text or "").strip()
    if not fallback:
        return []
    return [
        {
            "section_title": "Document",
            "section_path": "Document",
            "heading_level": 0,
            "content": fallback,
        }
    ]


def build_chunks(text: str, chunk_size: int, chunk_overlap: int) -> List[str]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", "。", "！", "？", "；", ". ", " ", ""],
    )
    return [c for c in splitter.split_text(text or "") if c.strip()]


def build_structured_chunks(
    text: str, chunk_size: int, chunk_overlap: int,
) -> List[Dict[str, Any]]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", "。", "！", "？", "；", ". ", " ", ""],
    )

    sections = split_document_sections(text)
    chunks: List[Dict[str, Any]] = []
    search_start = 0

    for section in sections:
        section_text = str(section.get("content", "") or "").strip()
        if not section_text:
            continue
        split_chunks = [c for c in splitter.split_text(section_text) if c.strip()]
        for chunk_text in split_chunks:
            needle = chunk_text[:120]
            pos = (text or "").find(needle, search_start) if needle else -1
            if pos < 0:
                pos = max(0, search_start)
            char_start = pos
            char_end = char_start + len(chunk_text)
            search_start = max(search_start, char_start + 1)
            chunks.append(
                {
                    "text": chunk_text,
                    "section_title": section.get("section_title", "Document"),
                    "section_path": section.get("section_path", "Document"),
                    "heading_level": int(section.get("heading_level", 0) or 0),
                    "char_start": char_start,
                    "char_end": char_end,
                    "page_num": estimate_page_num(text, char_start),
                }
            )
    return chunks
