"""Header correction via configurable LLM provider (local_ollama or coze).

Replaces the old DeepSeek-specific implementation.
Provider is selected per-request and routed through AIGatewayService so the
same auth / telemetry / fallback logic applies as the rest of the platform.
"""
from __future__ import annotations

import logging
import re

logger = logging.getLogger(__name__)

# ── System instruction ───────────────────────────────────────────────────────

_SYSTEM_PROMPT = (
    "You are a document-structure specialist. "
    "Your ONLY output is a corrected JSON object with key 'Header'. "
    "No explanation. No markdown fences. Pure JSON only."
)

# ── User prompt ──────────────────────────────────────────────────────────────

_USER_PROMPT_TEMPLATE = """\
You receive headers auto-extracted from a PDF or Markdown file \
(typically lecture slides or an academic paper).

RULES — apply in order:

REMOVE an entry if:
  • It is not a genuine section title: e.g. bold/italic decoration, figure captions,
    table headers, page numbers, slide numbers, dates, author names, footers, URLs,
    file paths, code snippets, or citation lines.
  • The text is purely symbolic (e.g. "---", "***", "©").

FIX LEVEL when the nesting depth is wrong:
  • Numbered patterns signal depth: "1." → 1, "1.1" → 2, "2.3.1" → 3.
  • For lecture slides: module/chapter title → 1, topic → 2, subtopic → 3.
  • Levels must be consecutive — no skipping (never jump from 1 to 3 without 2).
  • If the whole document has only one logical depth, normalize everything to level 1.

KEEP genuine section titles exactly as-is (text and line number unchanged).

OUTPUT — return exactly this JSON schema, nothing else:
{{"Header": [{{"level": <1–4>, "text": "<title>", "line": <int>}}, ...]}}

--- INPUT HEADERS ---
{input_text}
--- END INPUT ---"""


# ── Public API ───────────────────────────────────────────────────────────────

async def header_correction(input_text: str, provider: str = "local_ollama") -> str:
    """Correct extracted headers using the selected LLM provider.

    Returns the corrected JSON string on success, or *input_text* unchanged on failure
    so the caller can gracefully fall back to raw headers.
    """
    from backend.services.ai_gateway_service import AIGatewayService

    prompt = _USER_PROMPT_TEMPLATE.format(input_text=str(input_text or "").strip())
    context: dict = {
        "system_override": _SYSTEM_PROMPT,
        "task_profile": "light",
    }

    svc = AIGatewayService()
    try:
        result = await svc.chat_with_provider(
            message=prompt,
            context=context,
            provider=str(provider or "local_ollama").strip().lower(),
            allow_fallback=False,
        )
        return _strip_fences(result)
    except Exception as exc:
        logger.warning("Header correction failed (provider=%s): %s", provider, exc)
        return input_text


# ── Helpers ──────────────────────────────────────────────────────────────────

def _strip_fences(text: str) -> str:
    """Remove markdown code fences that LLMs sometimes wrap JSON output in."""
    t = str(text or "").strip()
    t = re.sub(r"^```(?:json)?\s*\n?", "", t, flags=re.IGNORECASE)
    t = re.sub(r"\n?```\s*$", "", t)
    return t.strip()
