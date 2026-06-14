"""Text chunking and section-splitting utilities (pure functions)."""
from __future__ import annotations

import hashlib
import re
from typing import Any, Dict, List

try:
    from langchain_text_splitters import RecursiveCharacterTextSplitter
except ImportError:
    class RecursiveCharacterTextSplitter:  # type: ignore[no-redef]
        def __init__(self, chunk_size: int, chunk_overlap: int, separators=None):
            self.chunk_size = max(1, int(chunk_size))
            self.chunk_overlap = max(0, int(chunk_overlap))
            self.separators = list(separators or [])

        def split_text(self, text: str) -> List[str]:
            content = str(text or "").strip()
            if not content:
                return []

            paragraphs = [part.strip() for part in re.split(r"\n{2,}", content) if part.strip()]
            chunks: List[str] = []
            current = ""
            step_back = max(0, self.chunk_overlap)

            def flush_current() -> None:
                nonlocal current
                if current.strip():
                    chunks.append(current.strip())
                current = ""

            for paragraph in paragraphs or [content]:
                candidate = f"{current}\n\n{paragraph}".strip() if current else paragraph
                if len(candidate) <= self.chunk_size:
                    current = candidate
                    continue

                if current:
                    flush_current()

                if len(paragraph) <= self.chunk_size:
                    current = paragraph
                    continue

                start = 0
                stride = max(1, self.chunk_size - step_back)
                while start < len(paragraph):
                    end = min(len(paragraph), start + self.chunk_size)
                    piece = paragraph[start:end].strip()
                    if piece:
                        chunks.append(piece)
                    if end >= len(paragraph):
                        break
                    start += stride

            flush_current()
            return chunks


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
    numbered_heading = re.compile(r"^(\d+(?:\.\d+)*)\s+([A-Z\u4e00-\u9fff].+?)\s*$")
    chapter_heading = re.compile(
        r"^(?:Chapter|Section|Lecture|Lab|Week|Part|Module|Unit)\s+\d+",
        re.IGNORECASE,
    )
    chinese_heading = re.compile(r"^第[\u4e00-\u9fff\d]+[章节讲部卷篇单元]")
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
        separators=["\n\n", "\n", "。", "；", "，", ". ", " ", ""],
    )
    return [c for c in splitter.split_text(text or "") if c.strip()]


def build_structured_chunks(
    text: str,
    chunk_size: int,
    chunk_overlap: int,
    *,
    source_hash: str = "",
    structure: dict[str, Any] | None = None,
    parser_used: str = "",
) -> List[Dict[str, Any]]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", "。", "；", "，", ". ", " ", ""],
    )

    sections = split_document_sections(text)
    blocks = list((structure or {}).get("blocks") or [])
    block_map: dict[str, list[dict[str, Any]]] = {}
    for block in blocks:
        block_map.setdefault(str(block.get("heading_path") or "Document"), []).append(block)

    chunks: List[Dict[str, Any]] = []
    search_start = 0
    section_ord = 0

    for section in sections:
        section_text = str(section.get("content", "") or "").strip()
        if not section_text:
            continue

        section_path = str(section.get("section_path") or "Document")
        section_title = str(section.get("section_title") or "Document")
        page_start = 1
        page_end = 1
        if section_path in block_map and block_map[section_path]:
            page_start = int(block_map[section_path][0].get("page_start") or 1)
            page_end = int(block_map[section_path][-1].get("page_end") or page_start)

        section_summary = _summarize_section(section_text, section_title)
        chunks.append(
            _chunk_record(
                source_hash=source_hash,
                section_path=section_path,
                node_type="section_summary",
                ordinal=section_ord,
                text=section_summary,
                section_title=section_title,
                heading_level=int(section.get("heading_level", 0) or 0),
                page_start=page_start,
                page_end=page_end,
                char_start=max(0, search_start),
                char_end=max(0, search_start + len(section_summary)),
                token_count=_estimate_token_count(section_summary),
                section_ordinal=section_ord,
                section_local_ordinal=-1,
                element_type="summary",
                parser_used=parser_used,
            )
        )

        section_blocks = block_map.get(section_path) or []
        local_ordinal = 0
        has_section_blocks = False
        for block in section_blocks:
            element_type = str(block.get("element_type") or "paragraph")
            block_text = str(block.get("text") or "").strip()
            if not block_text:
                continue

            has_section_blocks = True
            block_chunks = [block_text]
            if element_type == "paragraph":
                block_chunks = [c for c in splitter.split_text(block_text) if c.strip()] or [block_text]

            for block_chunk in block_chunks:
                pos = (text or "").find(block_chunk[:120], search_start) if block_chunk else -1
                if pos < 0:
                    pos = max(0, search_start)
                char_start = pos
                char_end = char_start + len(block_chunk)
                search_start = max(search_start, char_start + 1)
                node_type = "table_chunk" if element_type == "table" else "leaf_chunk"
                chunks.append(
                    _chunk_record(
                        source_hash=source_hash,
                        section_path=section_path,
                        node_type=node_type,
                        ordinal=local_ordinal,
                        text=block_chunk,
                        section_title=section_title,
                        heading_level=int(section.get("heading_level", 0) or 0),
                        page_start=int(block.get("page_start") or page_start),
                        page_end=int(block.get("page_end") or page_end),
                        char_start=char_start,
                        char_end=char_end,
                        token_count=_estimate_token_count(block_chunk),
                        section_ordinal=section_ord,
                        section_local_ordinal=local_ordinal,
                        element_type=element_type,
                        parser_used=parser_used,
                    )
                )
                local_ordinal += 1

        if not has_section_blocks:
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
                    _chunk_record(
                        source_hash=source_hash,
                        section_path=section_path,
                        node_type="leaf_chunk",
                        ordinal=local_ordinal,
                        text=chunk_text,
                        section_title=section_title,
                        heading_level=int(section.get("heading_level", 0) or 0),
                        page_start=estimate_page_num(text, char_start),
                        page_end=max(estimate_page_num(text, char_end), estimate_page_num(text, char_start)),
                        char_start=char_start,
                        char_end=char_end,
                        token_count=_estimate_token_count(chunk_text),
                        section_ordinal=section_ord,
                        section_local_ordinal=local_ordinal,
                        element_type="paragraph",
                        parser_used=parser_used,
                    )
                )
                local_ordinal += 1
        section_ord += 1
    return chunks


def _chunk_record(
    *,
    source_hash: str,
    section_path: str,
    node_type: str,
    ordinal: int,
    text: str,
    section_title: str,
    heading_level: int,
    page_start: int,
    page_end: int,
    char_start: int,
    char_end: int,
    token_count: int,
    section_ordinal: int,
    section_local_ordinal: int,
    element_type: str,
    parser_used: str,
) -> Dict[str, Any]:
    stable_id_seed = "|".join(
        [
            source_hash or "",
            str(page_start),
            str(page_end),
            section_path,
            node_type,
            str(ordinal),
            str(char_start),
            str(char_end),
        ]
    )
    stable_id = hashlib.sha1(stable_id_seed.encode("utf-8", errors="ignore")).hexdigest()
    return {
        "id": stable_id,
        "text": text,
        "section_title": section_title,
        "section_path": section_path,
        "heading_level": heading_level,
        "char_start": char_start,
        "char_end": char_end,
        "page_num": page_start,
        "page_start": page_start,
        "page_end": page_end,
        "token_count": token_count,
        "node_type": node_type,
        "element_type": element_type,
        "section_ordinal": section_ordinal,
        "section_local_ordinal": section_local_ordinal,
        "stable_id": stable_id,
        "parser_used": parser_used,
    }


def _summarize_section(section_text: str, section_title: str) -> str:
    lines = [line.strip() for line in section_text.splitlines() if line.strip()]
    if not lines:
        return section_title
    summary_parts = [section_title] if section_title and section_title != "Document" else []
    summary_parts.extend(lines[:3])
    summary = " ".join(summary_parts)
    return summary[:600]


def _estimate_token_count(text: str) -> int:
    rough_words = len(re.findall(r"\w+|[\u4e00-\u9fff]", text or ""))
    return max(1, rough_words)
