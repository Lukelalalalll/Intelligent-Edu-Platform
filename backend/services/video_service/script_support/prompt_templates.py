from __future__ import annotations

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

ARC_PLAN_PROMPT_ZH = """你是一位专业的教学视频导演。以下是一段教学视频的所有分段脚本（共{n}段）：

{segments}

请为这个视频规划一个连贯的叙事弧，输出JSON：
{{
  "opening_hook": "一句吸引学生注意力的开场白（15-30字）",
  "segments": [
    {{"index": 0, "role": "这段的叙事角色，例如：引入话题/背景铺垫/深化概念/举例说明/对比分析/总结回顾", "transition": ""}},
    {{"index": 1, "role": "...", "transition": "从上一段自然过渡到这段的短语（10-20字，不重复前一段内容）"}},
    {{"index": 2, "role": "...", "transition": "..."}}
  ],
  "closing_cta": "结尾的行动号召或总结语（15-30字）"
}}

只输出合法JSON，不要解释，不要加任何前缀。"""

ARC_PLAN_PROMPT_EN = """You are a professional teaching video director. Below are all {n} narration segments for a teaching video:

{segments}

Plan a coherent narrative arc. Output ONLY valid JSON:
{{
  "opening_hook": "A 15-25 word hook to capture student attention",
  "segments": [
    {{"index": 0, "role": "narrative role: e.g. introduce-topic / background / deepen-concept / example / contrast / recap", "transition": ""}},
    {{"index": 1, "role": "...", "transition": "10-20 word natural bridge from the previous segment"}},
    {{"index": 2, "role": "...", "transition": "..."}}
  ],
  "closing_cta": "15-25 word closing call-to-action or summary"
}}

Output ONLY the JSON object, no explanation."""
