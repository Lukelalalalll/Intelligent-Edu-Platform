"""Business logic for the slides pipeline: markdown parsing, PPT creation,
highlights I/O, section combining, outline generation, and script generation.

All functions are pure business logic — no HTTP concerns.
"""
from __future__ import annotations

import json
import logging
import os
import re
import time

logger = logging.getLogger(__name__)

# ── Outline system prompt ──

OUTLINE_SYSTEM_PROMPT = """You are an expert educational content writer.
Given a topic or keywords, generate well-structured content in Markdown format, suitable for creating a presentation (PPT).

Requirements:
- Use ## for major sections (3-6 sections)
- Use - bullet points for key sub-points under each section
- Each section body: 3-5 concise bullet points
- Write in the same language as the input keywords
- Start directly with the first ## heading, no preamble
- Total length: 300-600 words"""


async def generate_outline(keywords: str, provider: str) -> str:
    """Generate a PPT outline via AI for the given keywords."""
    from backend.services.ai_gateway_service.provider_factory import get_ai_gateway_service

    ai_service = get_ai_gateway_service()
    context = {"system_override": OUTLINE_SYSTEM_PROMPT}
    return await ai_service.chat_with_provider(message=keywords, context=context, provider=provider)


# ── Parsing ──

_SUB1_PARSE_CACHE: dict = {}


def _parse_md_impl(filepath: str, use_llm: bool, header_llm_provider: str = "local_ollama") -> dict:
    from backend.services.slides import MarkdownViewer as MDParser
    parser = MDParser()
    parser.load_file(filepath, use_llm, header_llm_provider)
    return {
        'headers': [
            {'index': i + 1, 'level': s['header']['level'], 'text': s['header']['text']}
            for i, s in enumerate(parser.header_sections)
        ],
        'full_content': parser.full_content,
        'sections': parser.header_sections,
        'tables': [
            {'index': i + 1, 'section_title': s['section']['text'], 'table': s['table']}
            for i, s in enumerate(parser.table_sections)
        ],
    }


def get_parsed_data_with_cache(filepath: str, use_llm: bool, header_llm_provider: str = "local_ollama") -> dict:
    cache_key = (filepath, bool(use_llm), str(header_llm_provider or "local_ollama"))
    stat = os.stat(filepath)
    file_stamp = (int(stat.st_mtime_ns), int(stat.st_size))
    cached = _SUB1_PARSE_CACHE.get(cache_key)
    if cached and cached.get("stamp") == file_stamp:
        return cached["data"]
    parsed = _parse_md_impl(filepath, use_llm, header_llm_provider)
    _SUB1_PARSE_CACHE[cache_key] = {"stamp": file_stamp, "data": parsed}
    return parsed


# ── PPT creation ──

def create_ppt(ppt_schema) -> str:
    """Create a PPTX file from a schema dict. Returns the output filename."""
    from datetime import datetime
    from backend.config import Config
    from backend.services.slides import PPTCreator

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"presentation_{timestamp}.pptx"
    output_path = os.path.join(Config.PPT_RESULTS_FOLDER, filename)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    creator = PPTCreator(Config.PPT_TEMPLATES_FOLDER)
    creator.create_presentation(ppt_schema, output_path)
    return filename


# ── Section combining ──

def combine_sections(filename: str, selected_indices: list[int], use_llm: bool, header_llm_provider: str = "local_ollama") -> str:
    """
    Combine selected sections from a parsed MD/PDF file into a new MD file.
    Returns the new filename.
    """
    from backend.config import Config

    filepath = os.path.join(Config.SUB1_UPLOAD_FOLDER, filename)
    if not os.path.exists(filepath):
        filepath = os.path.join(Config.UPLOAD_FOLDER, filename)

    if filename.lower().endswith('.pdf'):
        md_filename = filename.rsplit('.', 1)[0] + ".md"
        filepath = os.path.join(Config.SUB1_MD_FOLDER, md_filename)

    if not os.path.exists(filepath):
        raise FileNotFoundError(f"File not found: {filepath}")

    parsed_data = get_parsed_data_with_cache(filepath, use_llm, header_llm_provider)
    full_content = parsed_data['full_content']
    all_sections = parsed_data['sections']
    all_headers = parsed_data['headers']

    combined_chunks = []
    sorted_indices = sorted([int(i) for i in selected_indices])

    for idx in sorted_indices:
        target_idx = -1
        for i, h in enumerate(all_headers):
            if int(h['index']) == idx:
                target_idx = i
                break

        if target_idx != -1:
            section = all_sections[target_idx]
            header_text = all_headers[target_idx]['text']

            content_slice = full_content[section['start']:section['end'] + 1]

            if content_slice and content_slice[0].strip().startswith('#'):
                content_slice = content_slice[1:]
            if content_slice and content_slice[-1].strip().startswith('#'):
                content_slice = content_slice[:-1]
            while content_slice and not content_slice[-1].strip():
                content_slice = content_slice[:-1]
            if content_slice and content_slice[-1].strip().startswith('#'):
                content_slice = content_slice[:-1]

            formatted_header = header_text if header_text.startswith('#') else f"# {header_text}"
            chunk = f"{formatted_header}\n" + '\n'.join(content_slice)
            combined_chunks.append(chunk)

    final_markdown = "\n\n===SECTION_BREAK===\n\n".join(combined_chunks)
    new_filename = f"combined_{os.path.splitext(filename)[0]}.md"
    output_path = os.path.join(Config.SUB1_MD_FOLDER, new_filename)

    os.makedirs(Config.SUB1_MD_FOLDER, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(final_markdown)

    return new_filename


# ── Highlights I/O ──

def save_highlights(filename: str, highlights_data) -> str:
    """Persist highlights as JSON + Markdown. Returns the JSON filename."""
    from backend.config import Config

    os.makedirs(Config.SUB1_HIGHLIGHTS_FOLDER, exist_ok=True)

    if highlights_data and hasattr(highlights_data[0], 'dict'):
        highlights_list = [item.dict() for item in highlights_data]
    else:
        highlights_list = highlights_data

    json_filename = f"highlights_{filename}.json"
    json_path = os.path.join(Config.SUB1_HIGHLIGHTS_FOLDER, json_filename)
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(highlights_list, f, ensure_ascii=False, indent=2)

    md_filename = f"highlights_{filename}.md"
    md_path = os.path.join(Config.SUB1_HIGHLIGHTS_FOLDER, md_filename)
    with open(md_path, 'w', encoding='utf-8') as f:
        f.write(f"# Key Highlights for: {filename}\n\n")
        f.write(f"*Generated on {time.strftime('%Y-%m-%d %H:%M:%S')}*\n\n---\n\n")
        for section in highlights_list:
            section_title = (
                section.get('sectionTitle', 'Untitled Section')
                if isinstance(section, dict)
                else getattr(section, 'sectionTitle', 'Untitled Section')
            )
            f.write(f"## {section_title}\n\n")
            items = (
                section.get('highlights', []) if isinstance(section, dict)
                else getattr(section, 'highlights', [])
            )
            for h in items:
                text = h.get('text', '') if isinstance(h, dict) else getattr(h, 'text', '')
                f.write(f"> {text}\n\n")
            f.write("\n")

    return json_filename


def load_highlights(filename: str) -> list:
    """Load persisted highlights for a file. Returns flat list of highlight dicts."""
    from backend.config import Config

    json_filename = f"highlights_{filename}.json"
    json_path = os.path.join(Config.SUB1_HIGHLIGHTS_FOLDER, json_filename)

    if os.path.exists(json_path):
        with open(json_path, 'r', encoding='utf-8') as f:
            sections_data = json.load(f)
        flat = []
        for section in sections_data:
            section_title = section.get('sectionTitle', '')
            for h in section.get('highlights', []):
                flat.append({
                    'id': h.get('id', ''),
                    'text': h.get('text', ''),
                    'sectionTitle': section_title,
                })
        return flat
    return []


# ── Text processing ──

def process_text_to_md(text: str, title: str) -> tuple[str, int]:
    """
    Split free-form text into sections and write to an MD file.
    Returns (filename, section_count).
    """
    from backend.config import Config

    safe_title = re.sub(r'[^\w\s-]', '', title)[:60].strip().replace(' ', '_') or 'untitled'
    parts = re.split(r'(?=^## )', text, flags=re.MULTILINE)
    sections = []
    for part in parts:
        stripped = part.strip()
        if not stripped:
            continue
        if not stripped.startswith('## '):
            sections.append(f"## Overview\n{stripped}")
        else:
            sections.append(stripped)

    if not sections:
        raise ValueError("Could not parse any sections from the text")

    filename = f"combined_{safe_title}.md"
    os.makedirs(Config.SUB1_MD_FOLDER, exist_ok=True)
    filepath = os.path.join(Config.SUB1_MD_FOLDER, filename)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write("\n===SECTION_BREAK===\n".join(sections))

    return filename, len(sections)


# ── Script generation ──

async def generate_script(
    slides_results,
    style: str,
    title: str,
    provider: str,
) -> tuple[list, str]:
    """Generate a talking script and accompanying DOCX file. Returns (scripts, filename)."""
    from datetime import datetime
    from backend.config import Config
    from backend.services.slides import ChapterSummarizer, generate_talking_script_word

    summarizer = ChapterSummarizer()
    scripts = await summarizer.generate_talking_script(slides_results, style, provider=provider)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"talking_script_{timestamp}.docx"
    output_path = os.path.join(Config.SCRIPT_RESULTS_FOLDER, filename)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    generate_talking_script_word(scripts, output_path, title)
    return scripts, filename
