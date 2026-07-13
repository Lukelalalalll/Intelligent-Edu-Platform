from __future__ import annotations

import re
from typing import Any


def _build_quality_report(markdown: str, structure: dict[str, Any]) -> dict[str, Any]:
    blocks = list(structure.get("blocks") or [])
    sections = list(structure.get("sections") or [])
    pages = [
        int(block.get("page_start") or 1)
        for block in blocks
        if int(block.get("page_start") or 1) > 0
    ]
    page_count = max(pages, default=1)
    page_blocks: dict[int, int] = {page: 0 for page in range(1, page_count + 1)}
    for block in blocks:
        page = int(block.get("page_start") or 1)
        page_blocks[page] = page_blocks.get(page, 0) + 1

    empty_pages = sum(1 for value in page_blocks.values() if value == 0)
    heading_count = sum(1 for section in sections if int(section.get("heading_level") or 0) > 0)
    table_count = sum(1 for block in blocks if str(block.get("element_type")) == "table")
    formula_count = sum(1 for block in blocks if str(block.get("element_type")) == "formula")
    total_chars = len(markdown)
    formula_density = round(formula_count / max(len(blocks), 1), 4)
    avg_block_len = round(
        sum(len(str(block.get("text") or "")) for block in blocks) / max(len(blocks), 1),
        2,
    )

    replacement_chars = markdown.count("\ufffd")
    mojibake_hits = len(re.findall(r"[ÃÂÐÑØÞ]{2,}|鈭|锛|銆|绗", markdown))
    garbled_text_ratio = round((replacement_chars + mojibake_hits) / max(total_chars, 1), 4)

    ocr_like_hits = len(re.findall(r"\b(?:ocr|scan|scanned)\b", markdown, flags=re.IGNORECASE))
    lines = markdown.splitlines()
    short_lines = sum(1 for line in lines if 0 < len(line.strip()) <= 2)
    ocr_ratio = round(min(1.0, (ocr_like_hits + short_lines) / max(len(lines), 1)), 4)
    quality_status = "ok"
    if total_chars < 120 or avg_block_len < 20 or garbled_text_ratio > 0.08:
        quality_status = "needs_review"
    if total_chars < 40:
        quality_status = "poor"

    return {
        "page_count": page_count,
        "empty_page_ratio": round(empty_pages / max(page_count, 1), 4),
        "ocr_ratio": ocr_ratio,
        "heading_count": heading_count,
        "table_count": table_count,
        "formula_density": formula_density,
        "garbled_text_ratio": garbled_text_ratio,
        "avg_block_len": avg_block_len,
        "quality_status": quality_status,
        "block_count": len(blocks),
        "section_count": len(sections),
    }


def _passes_quality_gate(quality_report: dict[str, Any]) -> bool:
    return (
        str(quality_report.get("quality_status") or "ok") == "ok"
        and float(quality_report.get("garbled_text_ratio") or 0.0) <= 0.08
        and float(quality_report.get("empty_page_ratio") or 0.0) <= 0.6
        and int(quality_report.get("block_count") or 0) > 0
    )
