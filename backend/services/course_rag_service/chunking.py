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

    md_heading = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
    numbered_heading = re.compile(r"^(\d+(?:\.\d+)*)\s+(.+?)\s*$")

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

    for raw in lines:
        line = str(raw or "").rstrip()
        m = md_heading.match(line)
        n = numbered_heading.match(line) if not m else None

        if m or n:
            flush_current()
            current_lines = []

            if m:
                level = len(m.group(1))
                title = m.group(2).strip()
            else:
                numbering = n.group(1)
                level = min(6, numbering.count(".") + 1)
                title = f"{numbering} {n.group(2).strip()}"

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
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    return [c for c in splitter.split_text(text or "") if c.strip()]


def build_structured_chunks(
    text: str, chunk_size: int, chunk_overlap: int,
) -> List[Dict[str, Any]]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", ". ", " ", ""],
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
