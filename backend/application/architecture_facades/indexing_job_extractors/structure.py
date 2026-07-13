from __future__ import annotations

import re
from typing import Any


def _normalize_markdown(markdown: str) -> str:
    text = str(markdown or "").replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _build_structure_from_markdown(markdown: str, doc_name: str) -> dict[str, Any]:
    lines = markdown.splitlines()
    sections: list[dict[str, Any]] = []
    blocks: list[dict[str, Any]] = []
    stack: list[tuple[int, str]] = []
    current_section = {
        "title": "Document",
        "heading_level": 0,
        "heading_path": "Document",
        "page_start": 1,
        "page_end": 1,
        "text": "",
    }
    current_lines: list[str] = []
    current_block_lines: list[str] = []
    block_type = "paragraph"
    page_num = 1

    def flush_block() -> None:
        nonlocal current_block_lines, block_type
        content = "\n".join(current_block_lines).strip()
        if not content:
            current_block_lines = []
            block_type = "paragraph"
            return
        blocks.append(
            {
                "element_type": block_type,
                "heading_path": current_section["heading_path"],
                "page_start": page_num,
                "page_end": page_num,
                "text": content,
            }
        )
        current_block_lines = []
        block_type = "paragraph"

    def flush_section() -> None:
        nonlocal current_section, current_lines
        content = "\n".join(current_lines).strip()
        if content or current_section["title"] != "Document":
            section = dict(current_section)
            section["text"] = content
            sections.append(section)
        current_lines = []

    heading_re = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
    for raw_line in lines:
        line = raw_line.rstrip()
        if "\f" in line:
            page_num += line.count("\f")
            line = line.replace("\f", "").rstrip()
        heading_match = heading_re.match(line)
        if heading_match:
            flush_block()
            flush_section()
            level = len(heading_match.group(1))
            title = heading_match.group(2).strip()
            while stack and stack[-1][0] >= level:
                stack.pop()
            stack.append((level, title))
            current_section = {
                "title": title,
                "heading_level": level,
                "heading_path": " > ".join(item[1] for item in stack),
                "page_start": page_num,
                "page_end": page_num,
                "text": "",
            }
            continue

        stripped = line.strip()
        if stripped.startswith("|") and stripped.endswith("|"):
            if block_type != "table":
                flush_block()
                block_type = "table"
            current_block_lines.append(line)
        elif re.match(r"^[-*+]\s+", stripped) or re.match(r"^\d+\.\s+", stripped):
            if block_type != "list":
                flush_block()
                block_type = "list"
            current_block_lines.append(line)
        elif stripped:
            if block_type not in {"paragraph", "formula"}:
                flush_block()
            if _looks_like_formula(stripped):
                if block_type != "formula":
                    flush_block()
                    block_type = "formula"
            else:
                if block_type != "paragraph":
                    flush_block()
                    block_type = "paragraph"
            current_block_lines.append(line)
        else:
            flush_block()

        current_lines.append(line)
        current_section["page_end"] = page_num

    flush_block()
    flush_section()
    return {
        "doc_name": doc_name,
        "sections": sections,
        "blocks": blocks,
    }


def _looks_like_formula(text: str) -> bool:
    return bool(re.search(r"[=<>]|\\[a-zA-Z]+|\$\$?|∑|∫|√|±", text))
