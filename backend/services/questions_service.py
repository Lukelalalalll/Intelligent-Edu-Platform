import os
import re
import json
import time
import base64
import logging
import PyPDF2
import tempfile
import fitz
from backend.config import Config
try:
    import opendataloader_pdf
except ModuleNotFoundError:
    opendataloader_pdf = None  # type: ignore[assignment]
from backend.services.ai_gateway_service import AIGatewayService
from backend.services.llm_service.local_llm_service import LocalLLMService

logger = logging.getLogger(__name__)

def get_proxies():
    """如果在香港调 coze.com 报错，请取消下面 return 的注释"""
    # return {"http": "http://127.0.0.1:7890", "https": "http://127.0.0.1:7890"}
    return None


def cleanup_old_files():
    """Remove sub2 generated/cache/screenshot files older than SUB2_FILE_TTL_HOURS."""
    import logging
    _logger = logging.getLogger("sub2.cleanup")
    default_ttl_seconds = Config.SUB2_FILE_TTL_HOURS * 3600
    upload_ttl_seconds = Config.SUB2_UPLOAD_FILE_TTL_HOURS * 3600
    now = time.time()
    cleaned = 0
    ttl_by_folder = {
        Config.GENERATED_FOLDER_SUB2: default_ttl_seconds,
        Config.SCREENSHOTS_FOLDER_SUB2: default_ttl_seconds,
        Config.UPLOAD_FOLDER_SUB2: upload_ttl_seconds,
    }

    for folder, ttl_seconds in ttl_by_folder.items():
        if not os.path.isdir(folder):
            continue
        for fname in os.listdir(folder):
            fpath = os.path.join(folder, fname)
            if os.path.isfile(fpath):
                try:
                    age = now - os.path.getmtime(fpath)
                    if age > ttl_seconds:
                        os.remove(fpath)
                        cleaned += 1
                except OSError:
                    pass
    if cleaned:
        _logger.info(
            "Sub2 cleanup: removed %d files (temp TTL=%dh, upload TTL=%dh)",
            cleaned,
            Config.SUB2_FILE_TTL_HOURS,
            Config.SUB2_UPLOAD_FILE_TTL_HOURS,
        )


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in Config.ALLOWED_EXTENSIONS_SUB2


def _page_numbers_to_spec(page_numbers):
    """Convert 0-based selected pages to opendataloader page spec (1-based)."""
    if not page_numbers:
        return None

    pages = sorted({int(p) + 1 for p in page_numbers if int(p) >= 0})
    if not pages:
        return None

    ranges = []
    start = prev = pages[0]
    for page in pages[1:]:
        if page == prev + 1:
            prev = page
            continue
        ranges.append(f"{start}-{prev}" if start != prev else f"{start}")
        start = prev = page
    ranges.append(f"{start}-{prev}" if start != prev else f"{start}")
    return ",".join(ranges)


def _extract_pdf_text_with_fitz(pdf_path, page_numbers):
    """Fallback extractor using PyMuPDF when OpenDataLoader cannot run (e.g., Java missing)."""
    selected_pages = sorted({int(p) for p in (page_numbers or []) if int(p) >= 0})
    text_chunks = []

    doc = fitz.open(pdf_path)
    try:
        page_indexes = selected_pages if selected_pages else list(range(len(doc)))
        for page_idx in page_indexes:
            if page_idx >= len(doc):
                continue
            page_text = doc[page_idx].get_text("text") or ""
            if page_text.strip():
                text_chunks.append(page_text)
    finally:
        doc.close()

    text = "\n".join(text_chunks).strip()
    if not text:
        raise Exception("No text could be extracted from PDF with fallback parser")
    return text


def _extract_pdf_text_with_paddle(pdf_path, page_numbers):
    """PaddleOCR extractor for image-only / handwritten PDFs.

    Called when both OpenDataLoader and PyMuPDF return empty text, which is the
    typical scenario for scanned or handwritten question sheets.
    """
    from pathlib import Path
    from backend.utils.handwriting_ocr import extract_handwriting_from_pdf

    selected_pages = sorted({int(p) for p in (page_numbers or []) if int(p) >= 0})
    path = Path(pdf_path)

    # extract_handwriting_from_pdf processes the whole file; filter pages afterwards
    # if a page selection was requested.
    full_text = extract_handwriting_from_pdf(path)
    if not full_text.strip():
        raise Exception("PaddleOCR returned empty text for " + path.name)

    if not selected_pages:
        return full_text

    # full_text pages are separated by \f — pick only the requested ones
    all_pages = full_text.split("\f")
    chunks = [
        all_pages[i] for i in selected_pages if i < len(all_pages) and all_pages[i].strip()
    ]
    if not chunks:
        raise Exception("Selected pages yielded no text after PaddleOCR")
    return "\n".join(chunks)


def extract_pdf_text_with_loader(pdf_path, page_numbers):
    """Use OpenDataLoader to quickly extract selected PDF pages as markdown text."""
    page_spec = _page_numbers_to_spec(page_numbers)

    try:
        with tempfile.TemporaryDirectory(prefix='sub2_odl_') as tmp_dir:
            opendataloader_pdf.convert(
                input_path=pdf_path,
                output_dir=tmp_dir,
                format="markdown",
                quiet=True,
                image_output="off",
                pages=page_spec,
            )

            stem = os.path.splitext(os.path.basename(pdf_path))[0]
            md_candidates = [
                os.path.join(tmp_dir, f"{stem}.md"),
                os.path.join(tmp_dir, f"{stem}_markdown.md"),
            ]
            md_path = next((p for p in md_candidates if os.path.exists(p)), None)

            if not md_path:
                md_files = [f for f in os.listdir(tmp_dir) if f.lower().endswith('.md')]
                if not md_files:
                    raise Exception("pdf_loader did not produce markdown output")
                md_path = os.path.join(tmp_dir, md_files[0])

            with open(md_path, 'r', encoding='utf-8', errors='replace') as f:
                return f.read()
    except FileNotFoundError as exc:
        logger.warning("OpenDataLoader unavailable (likely Java missing), using PyMuPDF fallback: %s", exc)
        return _fitz_then_paddle(pdf_path, page_numbers)
    except Exception as exc:
        logger.warning("OpenDataLoader failed, using PyMuPDF fallback: %s", exc)
        return _fitz_then_paddle(pdf_path, page_numbers)


def _fitz_then_paddle(pdf_path, page_numbers):
    """Try PyMuPDF first; if it returns empty text, fall through to PaddleOCR.

    This is the standard two-stage OCR fallback for the question generator.
    """
    try:
        text = _extract_pdf_text_with_fitz(pdf_path, page_numbers)
        if text.strip():
            return text
        logger.info("PyMuPDF returned empty text for %s, trying PaddleOCR", pdf_path)
    except Exception as exc:
        logger.warning("PyMuPDF extraction failed for %s: %s", pdf_path, exc)

    try:
        return _extract_pdf_text_with_paddle(pdf_path, page_numbers)
    except Exception as exc:
        logger.warning("PaddleOCR also failed for %s: %s", pdf_path, exc)
        raise Exception(f"All PDF extractors failed for {pdf_path}") from exc


async def extract_text_from_image(file_path, extract_prompt="exercise", provider="local_ollama"):
    """Extract structured exercise JSON from an image using the configured AI provider."""

    # 1. Encode image to base64
    img_base = ""
    if file_path.lower().endswith('.pdf'):
        import fitz as _fitz
        doc = _fitz.open(file_path)
        page = doc.load_page(0)
        pix = page.get_pixmap(matrix=_fitz.Matrix(2, 2))
        img_data = pix.tobytes("png")
        img_base = base64.b64encode(img_data).decode('utf-8')
        doc.close()
    else:
        with open(file_path, "rb") as f:
            img_base = base64.b64encode(f.read()).decode('utf-8')

    prompt = f"""Identify and extract the {extract_prompt} content from this image.
    Requirements:
    1. Math formulas must use LaTeX (wrapped with $).
    2. Output strictly valid JSON: {{"exercises": [{{"chapter_number":"","sub_chapter_number":"","question_number":"","text":"question content","title":""}}]}}
    3. Important: if a question contains Java/Python code, escape all backslashes in the code."""

    try:
        p = str(provider or "local_ollama").strip().lower()
        if p == "local_ollama":
            # Use Ollama with llama3.2-vision — supports image via 'images' field
            local_service = LocalLLMService()
            raw_text = await local_service.chat(
                message=prompt,
                context={"images": [img_base], "task_profile": "heavy"},
            )
        else:
            # Use Coze API (text-only; send base64 inline in the prompt)
            if not Config.COZE_OCR_ENABLED:
                raise Exception(
                    "Coze OCR is disabled. Set COZE_OCR_ENABLED=true to enable sending image "
                    "data to the third-party Coze API."
                )
            logger.warning(
                "Sending student PDF image data to Coze API for OCR. "
                "Ensure this is documented in your data-processing notice."
            )
            ai_service = AIGatewayService()
            image_hint = f"\n[Base64 Image attached — first 200 chars]: {img_base[:200]}..."
            raw_text = await ai_service.chat_with_provider(
                message=prompt + image_hint,
                context={"coze_user_id": "sub2_user"},
                provider="coze",
            )

        logger.info("OCR raw output (first 500 chars): %s", raw_text[:500])

        # --- JSON cleaning ---
        match = re.search(r'(\{[\s\S]*\})', raw_text)
        if not match:
            raise Exception("No JSON structure detected in OCR output")

        clean_json = match.group(1)
        clean_json = re.sub(r'\\(?![\\"/bfnrtu])', r'\\\\', clean_json)

        try:
            return json.loads(clean_json, strict=False)
        except json.JSONDecodeError as e:
            logger.warning("Initial JSON parse failed: %s, attempting deep clean...", e)
            processed = "".join(ch for ch in clean_json if ord(ch) >= 32 or ch in '\n\r\t')
            return json.loads(processed, strict=False)

    except Exception as e:
        logger.error("extract_text_from_image failed: %s", str(e))
        raise


async def format_extracted_text(markdown_text, extract_prompt="exercise", provider="local_ollama"):
    """Use configured AI provider to format extracted markdown into exercise JSON."""
    if not markdown_text or not markdown_text.strip():
        raise Exception("No extracted markdown text from pdf_loader")

    prompt = f"""You are an educational content formatting assistant. Below is high-accuracy Markdown text extracted from a PDF.

Task:
1) Identify the {extract_prompt} content and split by question;
2) Focus on "structured formatting", not rewriting question intent;
3) Keep formulas in LaTeX (wrapped with $);
4) Output must be strict JSON only — no explanation.

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

    ai_service = AIGatewayService()
    raw_text = await ai_service.chat_with_provider(
        message=prompt,
        context={"coze_user_id": "sub2_user"},
        provider=provider,
    )

    logger.info("Layout raw output (first 500 chars): %s", raw_text[:500])

    match = re.search(r'(\{[\s\S]*\})', raw_text)
    if not match:
        raise Exception("Layout output does not contain JSON")

    clean_json = match.group(1)
    clean_json = re.sub(r'\\(?![\\"/bfnrtu])', r'\\\\', clean_json)

    # First attempt: direct parse
    parsed = None
    try:
        parsed = json.loads(clean_json, strict=False)
    except json.JSONDecodeError:
        pass

    # Second attempt: json_repair — purpose-built for fixing malformed LLM JSON
    if parsed is None:
        import json_repair
        try:
            parsed = json_repair.loads(clean_json)
        except Exception:
            pass

    # Third attempt: repair on the full raw text (in case regex extraction mangled it)
    if parsed is None:
        import json_repair
        try:
            parsed = json_repair.loads(raw_text)
        except Exception:
            logger.error("All JSON parse attempts failed. Raw output (first 2000 chars):\n%s", raw_text[:2000])
            raise Exception("Could not parse LLM output as JSON after all repair attempts")

    if not isinstance(parsed, dict) or 'exercises' not in parsed:
        raise Exception("Layout output missing exercises field")
    if not isinstance(parsed['exercises'], list):
        raise Exception("Layout exercises is not a list")

    return parsed


async def call_provider_generate(
    *,
    base_content: str,
    user_requirements: str,
    question_type: str = "",
    provider: str,
    output_language: str = "Chinese",
    question_basis: str | None = None,
    knowledge_points: str = "",
    saved_screenshots: list[str] | None = None,
    target_question_count: int | None = None,
) -> str:
    saved_screenshots = saved_screenshots or []
    basis_hint = ""
    if question_basis == "knowledge_points" and knowledge_points.strip():
        basis_hint = f"\n[Knowledge Constraints]\n{knowledge_points.strip()}\nPlease strictly generate questions around these knowledge points."
    elif question_basis == "example_images" and saved_screenshots:
        basis_hint = (
            "\n[Reference Screenshots]\n"
            f"{len(saved_screenshots)} screenshots provided for style reference: {', '.join(saved_screenshots[:12])}\n"
            "Use them as style inspiration only; do not copy wording from source questions."
        )

    requested_count = None
    try:
        if target_question_count is not None:
            requested_count = max(1, int(target_question_count))
    except (TypeError, ValueError):
        requested_count = None

    count_rule_en = ""
    if requested_count:
        count_rule_en = f"\n5) You must generate exactly {requested_count} questions (no fewer, no more), numbered from 1 to {requested_count}."

    qtype = str(question_type or "").strip().lower().replace("_", " ").replace("-", " ")
    fill_blank_examples_en = """
[Output Template - Fill-in-the-blank]
1. Question: In asynchronous SQLAlchemy, the utility used to create an async session factory is ____.
Answer: async_sessionmaker
Explanation: async_sessionmaker creates a factory for asynchronous session objects.

2. Question: In ACID properties, the "A" stands for ____.
Answer: Atomicity
Explanation: Atomicity ensures a transaction is all-or-nothing.
"""
    format_rule_en = ""
    if "fill" in qtype and "blank" in qtype:
        format_rule_en = (
            "\n[Strict Fill-in-the-blank Rules]\n"
            "- Every question stem MUST contain exactly one blank marker: ____\n"
            "- Never put the answer directly in the stem\n"
            "- Each question MUST include 'Answer:' and 'Explanation:' lines\n"
            "- Follow this format exactly:\n"
            "  n. Question: ... ____ ...\n"
            "  Answer: ...\n"
            "  Explanation: ...\n"
            f"\n{fill_blank_examples_en}"
        )

    is_english = str(output_language).strip().lower().startswith("english")
    if is_english:
        language_rule = "Output the full question set in English only (stems, options, answers, and explanations). Do not use Chinese."
    else:
        language_rule = "Output all question stems, options, answers, and explanations in Chinese."
    prompt = f"""You are an expert question designer. Generate a brand-new question set by transforming the source material below.
[Source Content]: {base_content}
[Generation Requirements]: {user_requirements}
[Question Type]: {question_type}
{basis_hint}
[Hard Constraints]
1) Include complete options, answers, and explanations.
2) Any math expressions must use LaTeX wrapped with $...$.
3) Do not copy wording from the source. Keep the same knowledge targets but change wording and numeric details.
4) {language_rule}{count_rule_en}
{format_rule_en}"""

    ai_service = AIGatewayService()
    return await ai_service.chat_with_provider(
        message=prompt,
        context={"coze_user_id": "sub2_user"},
        provider=provider,
    )