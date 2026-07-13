from __future__ import annotations

SUMMARY_SYSTEM_PROMPT = """
You are an expert academic summarizer, specialized in extracting dense,
entity-rich highlights from technical papers.
The final output should strictly follow this schema:
{
  "slides": [
    {
      "title": "string",
      "content": ["string"],
      "latex": ["string"],
      "chart_type": "string",
      "chart_reasoning": ["string"]
    }
  ]
}
""".strip()

SCRIPT_STYLE_PROMPTS = {
    "academic": (
        "Use formal academic language with appropriate pauses and emphasis. "
        "The tone should be professional but not boring."
    ),
    "casual": (
        "Use relaxed and friendly language with natural transitions and interactive elements."
    ),
    "business": (
        "Use concise professional business language, highlighting key information and action points."
    ),
}


def build_summary_prompt(
    target_pages: int,
    chapter_index: int,
    total_chapters: int,
    *,
    num_of_bullets: int = 3,
    words_each_bullet: int = 25,
) -> str:
    return f"""
**TASK**:
You are summarizing chapter {chapter_index + 1} of {total_chapters} chapters.
Generate exactly {target_pages} slides for this chapter, with each slide containing exactly {num_of_bullets} bullet points.

Rules:
1. The first slide must use the exact chapter title.
2. Other slides can use generated titles based on the content.
3. Each bullet point must stay within {words_each_bullet} words.
4. Only include citations when the source explicitly references specific authors or studies.
5. Extract LaTeX expressions found inside $$...$$ into the "latex" field.
6. Recommend one chart type from:
   Flowchart, Bar Chart, Pie Chart, Line Chart, Scatter Plot, Organization Chart,
   Mind Map, Concept Map, Timeline, Table, Image/Diagram, or No Chart.
7. "chart_reasoning" must contain one detailed chart-generation prompt sentence.

Output exactly {target_pages} slides and exactly {num_of_bullets} bullet points per slide.
""".strip()


def build_script_system_prompt(script_style: str) -> str:
    style_prompt = SCRIPT_STYLE_PROMPTS.get(script_style, SCRIPT_STYLE_PROMPTS["academic"])
    return f"""
You are a professional speech script writer specializing in natural presentation talking scripts.

Requirements:
1. {style_prompt}
2. Each script should be timed for 30-60 seconds of speaking.
3. Include natural transitions and connections between slides.
4. Add speaking cues: [PAUSE], [EMPHASIS], [SLOW].
5. Structure each script with introduction, main content, and conclusion sections.

Return JSON:
{{
  "scripts": [
    {{
      "slide_number": 1,
      "slide_title": "Title of slide",
      "introduction": "Brief opening",
      "main_content": "Detailed explanation",
      "conclusion": "Summary or transition",
      "estimated_duration": "45-60 seconds"
    }}
  ]
}}
""".strip()


def build_script_batch_content(batch: list[dict]) -> str:
    lines = [f"Please generate talking scripts for the following {len(batch)} slides in JSON format:", ""]
    for slide in batch:
        lines.append(f"Slide {slide['slide_number']}: {slide['title']}")
        lines.append("Key Points to Cover:")
        for point in slide["content"]:
            lines.append(f"- {point}")
        lines.append("")
    lines.append("Please provide the talking scripts in the specified JSON format.")
    return "\n".join(lines)
