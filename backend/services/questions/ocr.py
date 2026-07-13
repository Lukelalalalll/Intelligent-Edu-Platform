"""OCR and structured extraction helpers for sub2."""

from __future__ import annotations

import base64
import json
import logging
import re

import fitz

from backend.config import Config
from backend.services.ai_gateway_service import get_ai_gateway_service
from backend.services.llm_service.local_llm_service import LocalLLMService

logger = logging.getLogger(__name__)


async def extract_text_from_image(file_path, extract_prompt="exercise", provider="local_ollama"):
    """Extract structured exercise JSON from an image using the configured AI provider."""
    if file_path.lower().endswith(".pdf"):
        doc = fitz.open(file_path)
        page = doc.load_page(0)
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
        img_data = pix.tobytes("png")
        img_base = base64.b64encode(img_data).decode("utf-8")
        doc.close()
    else:
        with open(file_path, "rb") as handle:
            img_base = base64.b64encode(handle.read()).decode("utf-8")

    prompt = f"""Identify and extract the {extract_prompt} content from this image.
    Requirements:
    1. Math formulas must use LaTeX (wrapped with $).
    2. Output strictly valid JSON: {{"exercises": [{{"chapter_number":"","sub_chapter_number":"","question_number":"","text":"question content","title":""}}]}}
    3. Important: if a question contains Java/Python code, escape all backslashes in the code."""

    try:
        resolved_provider = str(provider or "local_ollama").strip().lower()
        if resolved_provider == "local_ollama":
            local_service = LocalLLMService()
            raw_text = await local_service.chat(
                message=prompt,
                context={"images": [img_base], "task_profile": "heavy"},
            )
        else:
            if not Config.COZE_OCR_ENABLED:
                raise Exception(
                    "Coze OCR is disabled. Set COZE_OCR_ENABLED=true to enable sending image "
                    "data to the third-party Coze API."
                )
            logger.warning(
                "Sending student PDF image data to Coze API for OCR. "
                "Ensure this is documented in your data-processing notice."
            )
            ai_service = get_ai_gateway_service()
            image_hint = f"\n[Base64 Image attached - first 200 chars]: {img_base[:200]}..."
            raw_text = await ai_service.chat_with_provider(
                message=prompt + image_hint,
                context={"coze_user_id": "sub2_user"},
                provider="coze",
            )

        logger.info("OCR raw output (first 500 chars): %s", raw_text[:500])

        match = re.search(r"(\{[\s\S]*\})", raw_text)
        if not match:
            raise Exception("No JSON structure detected in OCR output")

        clean_json = match.group(1)
        clean_json = re.sub(r'\\(?![\\"/bfnrtu])', r"\\\\", clean_json)

        try:
            return json.loads(clean_json, strict=False)
        except json.JSONDecodeError as exc:
            logger.warning("Initial JSON parse failed: %s, attempting deep clean...", exc)
            processed = "".join(ch for ch in clean_json if ord(ch) >= 32 or ch in "\n\r\t")
            return json.loads(processed, strict=False)
    except Exception as exc:
        logger.error("extract_text_from_image failed: %s", str(exc))
        raise


async def format_extracted_text(markdown_text, extract_prompt="exercise", provider="local_ollama"):
    """Use configured AI provider to format extracted markdown into exercise JSON."""
    if not markdown_text or not markdown_text.strip():
        raise Exception("No extracted markdown text from PDF loader")

    prompt = f"""You are an educational content formatting assistant. Below is high-accuracy Markdown text extracted from a PDF.

Task:
1) Identify the {extract_prompt} content and split by question;
2) Focus on "structured formatting", not rewriting question intent;
3) Keep formulas in LaTeX (wrapped with $);
4) Output must be strict JSON only - no explanation.

Strict output schema:
{{
  "exercises": [
    {{
      "chapter_number": "",
      "sub_chapter_number": "",
      "question_number": "",
      "page_number": "",
      "title": "",
      "text": ""
    }}
  ]
}}

Formatting rules:
- Fill chapter_number / sub_chapter_number / question_number if inferable from headings or numbering; otherwise leave as empty string.
- text field: retain the question stem, options, sub-questions, conditions, and units; preserve original order.
- If the document contains a table of contents or chapter headings, use them to aid hierarchical classification but do not treat them as questions.

Markdown to process:
{markdown_text}
"""

    ai_service = get_ai_gateway_service()
    raw_text = await ai_service.chat_with_provider(
        message=prompt,
        context={"coze_user_id": "sub2_user"},
        provider=provider,
    )

    logger.info("Layout raw output (first 500 chars): %s", raw_text[:500])

    match = re.search(r"(\{[\s\S]*\})", raw_text)
    if not match:
        raise Exception("Layout output does not contain JSON")

    clean_json = match.group(1)
    clean_json = re.sub(r'\\(?![\\"/bfnrtu])', r"\\\\", clean_json)

    parsed = None
    try:
        parsed = json.loads(clean_json, strict=False)
    except json.JSONDecodeError:
        pass

    if parsed is None:
        import json_repair

        try:
            parsed = json_repair.loads(clean_json)
        except Exception:
            pass

    if parsed is None:
        import json_repair

        try:
            parsed = json_repair.loads(raw_text)
        except Exception:
            logger.error("All JSON parse attempts failed. Raw output (first 2000 chars):\n%s", raw_text[:2000])
            raise Exception("Could not parse LLM output as JSON after all repair attempts")

    if not isinstance(parsed, dict) or "exercises" not in parsed:
        raise Exception("Layout output missing exercises field")
    if not isinstance(parsed["exercises"], list):
        raise Exception("Layout exercises is not a list")

    return parsed
