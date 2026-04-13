# backend/routes/sub4_routes.py
import os
import shutil
import base64
import re
import html
import logging
import requests
import json
import glob
import tempfile
import xml.etree.ElementTree as ET
from io import BytesIO
from typing import Optional
from docx import Document
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse, Response
from werkzeug.utils import secure_filename
import opendataloader_pdf
from backend.core.database import db, compute_history_expires_at
from backend.core.security import get_current_user
from backend.core.ai_provider import resolve_provider
from backend.core.safe_requests import safe_get
from backend.schemas import SearchSvgSchema, DownloadSvgSchema
from backend.config import Config
from backend.infrastructure import TelemetryTimer

logger = logging.getLogger(__name__)

diagram_router = APIRouter(prefix="/api/diagram", tags=["Diagram"])


def get_sub4_paths():
    upload_folder = os.path.join(Config.UPLOAD_FOLDER, 'sub4')
    generated_folder = os.path.join(Config.BASE_DIR, 'generated', 'sub4')
    os.makedirs(upload_folder, exist_ok=True)
    os.makedirs(generated_folder, exist_ok=True)
    return upload_folder, generated_folder


def _collect_image_nodes(node, results):
    """Recursively collect image items from opendataloader_pdf JSON output."""
    if str(node.get("type", "")).lower() == "image":
        results.append(node)
    for child in node.get("kids", []):
        _collect_image_nodes(child, results)


def _extract_pdf_diagrams_opendataloader(path: str):
    """Primary: use opendataloader_pdf for fast image extraction."""
    tmp_dir = tempfile.mkdtemp(prefix="sub4_pdf_")
    try:
        img_dir = os.path.join(tmp_dir, "images")
        os.makedirs(img_dir, exist_ok=True)

        opendataloader_pdf.convert(
            input_path=path,
            output_dir=tmp_dir,
            format="json",
            image_output="external",
            image_format="png",
            image_dir=img_dir,
            quiet=True,
        )

        # Parse JSON for page-number mapping
        json_files = glob.glob(os.path.join(tmp_dir, "*.json"))
        page_map = {}
        if json_files:
            with open(json_files[0], "r") as f:
                meta = json.load(f)
            img_nodes = []
            _collect_image_nodes(meta, img_nodes)
            for node in img_nodes:
                src = node.get("source", "")
                page_map[os.path.basename(src)] = node.get("page number", 0)

        extracted = []
        for img_file in sorted(os.listdir(img_dir)):
            img_path = os.path.join(img_dir, img_file)
            if not os.path.isfile(img_path):
                continue
            try:
                img_bytes = open(img_path, "rb").read()
                b64 = base64.b64encode(img_bytes).decode("ascii")
                page_num = page_map.get(img_file, 0)
                extracted.append({
                    "page": page_num if page_num else "Unknown",
                    "data": f"data:image/png;base64,{b64}",
                })
            except Exception:
                continue
        return extracted
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _extract_pdf_diagrams_fitz(path: str):
    """Fallback: use PyMuPDF (fitz) when opendataloader_pdf fails."""
    import fitz
    doc = fitz.open(path)
    extracted = []
    for i in range(doc.page_count):
        for img in doc.get_page_images(i):
            pix = fitz.Pixmap(doc, img[0])
            if pix.n >= 5:
                pix = fitz.Pixmap(fitz.csRGB, pix)
            b64 = base64.b64encode(pix.tobytes("png")).decode("ascii")
            extracted.append({"page": i + 1, "data": f"data:image/png;base64,{b64}"})
    doc.close()
    return extracted


def _extract_pdf_diagrams(path: str):
    """Extract images from PDF, with opendataloader_pdf primary and fitz fallback."""
    try:
        return _extract_pdf_diagrams_opendataloader(path)
    except Exception as e:
        logger.warning("opendataloader_pdf failed for %s, falling back to PyMuPDF: %s", path, e)
    return _extract_pdf_diagrams_fitz(path)


def _extract_svg_from_ai_output(raw_content: str) -> str:
    """Extract and repair SVG from non-deterministic LLM output."""
    content = str(raw_content or "").strip()
    if not content:
        raise ValueError("AI returned empty content")

    # Some providers may return a JSON envelope instead of raw text.
    try:
        payload = json.loads(content)
        if isinstance(payload, dict):
            for key in ("svg", "content", "diagram", "result"):
                value = payload.get(key)
                if isinstance(value, str) and value.strip():
                    content = value.strip()
                    break
    except Exception:
        pass

    # Prefer fenced payload when markdown wrappers are present.
    fenced = re.search(r"```(?:svg|xml)?\s*([\s\S]*?)\s*```", content, re.IGNORECASE)
    if fenced:
        content = fenced.group(1).strip()

    # Many local models return HTML-escaped XML.
    if "<svg" not in content.lower() and "&lt;svg" in content.lower():
        content = html.unescape(content)

    svg_code = ""
    full_svg = re.search(r"<svg\b[\s\S]*?</svg>", content, re.IGNORECASE)
    if full_svg:
        svg_code = full_svg.group(0)
    else:
        self_closing_svg = re.search(r"<svg\b[^>]*?/>", content, re.IGNORECASE)
        if self_closing_svg:
            svg_code = self_closing_svg.group(0)
        else:
            start = re.search(r"<svg\b", content, re.IGNORECASE)
            if start:
                tail = content[start.start():].strip()
                svg_code = tail if "</svg>" in tail.lower() else f"{tail}</svg>"

    # Last resort: wrap common SVG inner elements.
    if not svg_code:
        has_svg_inner = any(tag in content.lower() for tag in ("<rect", "<circle", "<ellipse", "<path", "<line", "<polyline", "<polygon", "<text", "<g"))
        if has_svg_inner:
            svg_code = (
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 800">'
                f"{content}"
                "</svg>"
            )

    if not svg_code:
        preview = content[:200].replace("\n", " ")
        raise ValueError(f"Could not extract SVG element from AI response: {preview}")

    # Ensure xmlns exists for browser rendering consistency.
    first_tag = svg_code.split(">", 1)[0].lower()
    if "xmlns=" not in first_tag:
        svg_code = re.sub(r"<svg\b", '<svg xmlns="http://www.w3.org/2000/svg"', svg_code, count=1, flags=re.IGNORECASE)

    # Fix unescaped '&' which breaks XML parsing.
    svg_code = re.sub(
        r'&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)',
        '&amp;',
        svg_code,
    )

    return svg_code


def _estimate_svg_quality(svg_code: str) -> int:
    """Heuristic quality score to decide whether a refinement pass is needed."""
    svg = str(svg_code or "")
    lower = svg.lower()
    score = 0

    if "viewbox=" in lower:
        score += 2
    if "<defs" in lower:
        score += 1
    if "marker-end" in lower or "<marker" in lower:
        score += 1
    if "font-family" in lower:
        score += 1
    if "rx=" in lower or "ry=" in lower:
        score += 1
    if "<filter" in lower:
        score += 1

    # Encourage enough structure and labels
    shape_count = len(re.findall(r"<(rect|circle|ellipse|path|polygon|line|polyline)\b", lower))
    text_count = len(re.findall(r"<text\b", lower))
    if shape_count >= 6:
        score += 2
    elif shape_count >= 3:
        score += 1

    if text_count >= 4:
        score += 2
    elif text_count >= 2:
        score += 1

    return score


def _validate_svg_xml(svg_code: str) -> tuple[bool, str | None]:
    """Validate whether SVG is well-formed XML."""
    try:
        ET.fromstring(svg_code)
        return True, None
    except ET.ParseError as exc:
        return False, str(exc)


def _build_diagram_generation_prompt(description: str) -> str:
    return (
        "You are an expert SVG diagram designer for educational content. "
        "Generate ONE polished, production-ready SVG diagram.\n\n"
        "OUTPUT FORMAT RULES:\n"
        "1. Output ONLY raw SVG XML from <svg ...> to </svg>. No markdown.\n"
        "2. The SVG must be valid XML and directly renderable in browsers.\n"
        "3. Escape text entities properly (&amp;, &lt;, &gt;, &quot;).\n\n"
        "LAYOUT + VISUAL RULES:\n"
        "1. Use viewBox at least 1200x800.\n"
        "2. Keep generous spacing: horizontal gap >= 80px, vertical gap >= 64px.\n"
        "3. No overlap between labels, nodes, and arrows.\n"
        "4. Use rounded cards (rx/ry), consistent stroke width (2-3), and clean arrowheads.\n"
        "5. Typography: font-family='Inter, Arial, sans-serif', title 22-26px, body 14-16px.\n"
        "6. Color palette: one primary, one accent, one neutral background; avoid random colors.\n"
        "7. Include subtle shadow filter and clear visual hierarchy.\n"
        "8. Keep text concise and readable with padding inside containers.\n\n"
        "Description:\n"
        f"{description}"
    )


def _build_diagram_refine_prompt(description: str, draft_svg: str) -> str:
    return (
        "You are a strict SVG quality reviewer. Improve the following draft SVG while preserving semantics.\n\n"
        "MANDATORY FIX CHECKLIST:\n"
        "1. Remove overlaps and improve alignment/spacing.\n"
        "2. Normalize typography and color consistency.\n"
        "3. Ensure arrows are clear and do not cross labels where possible.\n"
        "4. Keep/ensure valid XML and complete <svg>...</svg>.\n"
        "5. Keep content concise and professional for educational use.\n\n"
        "Return ONLY the final improved SVG XML.\n\n"
        "Original description:\n"
        f"{description}\n\n"
        "Draft SVG:\n"
        f"{draft_svg}"
    )


def _build_svg_syntax_repair_prompt(svg_code: str, parse_error: str) -> str:
    return (
        "You are an XML/SVG repair assistant.\n"
        "The SVG below is malformed XML. Fix ONLY syntax/structure errors and return valid SVG.\n\n"
        "RULES:\n"
        "1. Output ONLY one valid <svg>...</svg> document.\n"
        "2. Preserve original visual layout and text content as much as possible.\n"
        "3. Close all opened tags correctly (e.g., <g>, <text>, <defs>).\n"
        "4. Do not add markdown fences or explanations.\n\n"
        f"Parse error: {parse_error}\n\n"
        "Malformed SVG:\n"
        f"{svg_code}"
    )


def _split_diagram_points(description: str, limit: int = 5) -> list[str]:
    text = re.sub(r"\s+", " ", str(description or "").strip())
    if not text:
        return ["Topic"]

    parts = [p.strip(" -") for p in re.split(r"[.;:!?]|\s->\s|\s=>\s", text) if p.strip()]
    if not parts:
        parts = [text]

    # If user prompt is a single short phrase, synthesize meaningful steps instead of echoing raw input.
    if len(parts) <= 1:
        lower = text.lower()
        if "software development" in lower or "sdlc" in lower:
            return [
                "Requirement Analysis",
                "System Design",
                "Implementation",
                "Testing",
                "Deployment",
            ][:limit]
        if "machine learning" in lower or "ml pipeline" in lower:
            return [
                "Data Collection",
                "Data Preprocessing",
                "Model Training",
                "Evaluation",
                "Deployment & Monitoring",
            ][:limit]
        return [
            "Overview",
            "Key Components",
            "Workflow Steps",
            "Validation",
            "Final Output",
        ][:limit]

    return parts[:limit]


def _build_fallback_svg(description: str) -> str:
    """Build a guaranteed-valid SVG if model outputs remain malformed."""
    title = html.escape((description or "Diagram").strip()[:90])
    points = [html.escape(p[:80]) for p in _split_diagram_points(description)]

    node_w = 880
    node_h = 88
    gap = 36
    start_x = 160
    start_y = 150
    canvas_h = max(800, start_y + len(points) * (node_h + gap) + 120)

    nodes = []
    arrows = []
    for i, label in enumerate(points):
        y = start_y + i * (node_h + gap)
        nodes.append(
            f'<rect x="{start_x}" y="{y}" width="{node_w}" height="{node_h}" '
            'rx="16" ry="16" fill="#ffffff" stroke="#1f2937" stroke-width="2" filter="url(#soft-shadow)"/>'
        )
        nodes.append(
            f'<text x="{start_x + 26}" y="{y + 52}" font-size="20" fill="#0f172a">{label}</text>'
        )

        if i < len(points) - 1:
            x = start_x + node_w // 2
            y1 = y + node_h
            y2 = y + node_h + gap - 8
            arrows.append(
                f'<line x1="{x}" y1="{y1}" x2="{x}" y2="{y2}" stroke="#1f2937" stroke-width="2" marker-end="url(#arrow-end)"/>'
            )

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 {canvas_h}">'
        '<defs>'
        '<marker id="arrow-end" markerWidth="12" markerHeight="8" refX="10" refY="4" orient="auto" markerUnits="strokeWidth">'
        '<path d="M0,0 L12,4 L0,8 z" fill="#1f2937" />'
        '</marker>'
        '<filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%">'
        '<feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.18" />'
        '</filter>'
        '</defs>'
        f'<rect x="0" y="0" width="1200" height="{canvas_h}" fill="#f8fafc"/>'
        f'<text x="70" y="82" font-size="34" font-family="Inter, Arial, sans-serif" fill="#0f172a">{title}</text>'
        + "".join(arrows)
        + "".join(nodes)
        + '</svg>'
    )


@diagram_router.post("/upload_document")
async def extract_diagrams(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    upload_folder, _ = get_sub4_paths()
    filename = secure_filename(file.filename)
    path = os.path.join(upload_folder, filename)

    content = await file.read()
    with open(path, "wb") as buffer:
        buffer.write(content)

    extracted = []
    try:
        if filename.lower().endswith('.pdf'):
            extracted = _extract_pdf_diagrams(path)
        elif filename.lower().endswith(('.docx', '.doc')):
            docx = Document(path)
            for idx, shape in enumerate(docx.inline_shapes):
                if shape._inline.graphic.graphicData.pic is not None:
                    rel = shape._inline.graphic.graphicData.pic.blipFill.blip.embed
                    b64 = base64.b64encode(docx.part.related_parts[rel].blob).decode('ascii')
                    extracted.append({'page': f"Word-Img-{idx + 1}", 'data': f'data:image/png;base64,{b64}'})
    except Exception as e:
        logger.exception("Diagram extraction failed")
        raise HTTPException(status_code=500, detail="Internal server error")

    # Save to generation history
    try:
        user_id = str(user.get("id") or user.get("_id") or "")
        _exp = await compute_history_expires_at(user_id)
        _doc = {
            "user_id": user_id,
            "tool": "extract_diagram",
            "params": {
                "service_type": "extract",
                "source_filename": filename,
                "extracted_count": len(extracted),
            },
            "source": {"file_name": filename},
            "result_preview": f"Extracted {len(extracted)} diagrams from {filename}",
            "result_full": json.dumps({"extracted_count": len(extracted)}),
            "created_at": datetime.now(timezone.utc),
        }
        if _exp is not None:
            _doc["expires_at"] = _exp
        await db.sub4_generation_history.insert_one(_doc)
    except Exception:
        pass  # history save failure should not block the response

    return {'success': True, 'file': {'original_name': filename, 'extracted_count': len(extracted)},
            'extracted': extracted}


@diagram_router.post("/search_svg")
def search_svg(req: SearchSvgSchema, user: dict = Depends(get_current_user)):
    if not Config.SERP_API_KEY:
        raise HTTPException(status_code=500, detail='SERP_API_KEY missing')

    query = (req.prompt or '').strip()
    if not query:
        raise HTTPException(status_code=400, detail='Prompt is required')

    query_variants = [
        f"{query} filetype:svg",
        f"{query} vector diagram svg",
        f"{query} site:lucid.co svg",
    ]

    dedup = {}
    try:
        for q in query_variants:
            params = {'engine': 'google', 'q': q, 'tbm': 'isch', 'api_key': Config.SERP_API_KEY}
            data = requests.get('https://serpapi.com/search', params=params, timeout=20).json()
            if data.get('error'):
                continue

            for item in data.get('images_results', [])[:25]:
                svg_url = item.get('original') or ''
                if not svg_url:
                    continue
                normalized = svg_url.lower()
                if '.svg' not in normalized and 'svg' not in normalized:
                    continue

                if svg_url in dedup:
                    continue
                dedup[svg_url] = {
                    'thumb': item.get('thumbnail') or svg_url,
                    'svg': svg_url,
                    'title': item.get('title', ''),
                }

            if len(dedup) >= 18:
                break

        results = list(dedup.values())[:18]
        if not results:
            raise HTTPException(status_code=404, detail='No SVG diagrams found for this query')
        return results
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        logger.exception("SVG search failed")
        raise HTTPException(status_code=500, detail="Internal server error")


@diagram_router.post("/generate_diagram")
async def generate_diagram(
    promptFile: Optional[UploadFile] = File(None),
    promptText: str = Form(default=''),
    provider: str | None = Form(None),
    user: dict = Depends(get_current_user),
):
    """Generate SVG diagram from uploaded text file OR direct text input."""
    # Resolve prompt: file takes priority, then text field
    text = ''
    if promptFile and promptFile.filename:
        raw = await promptFile.read()
        text = raw.decode('utf-8', errors='replace').strip()
    if not text:
        text = (promptText or '').strip()
    if not text:
        raise HTTPException(status_code=400, detail="Please provide a text file or enter text content")

    try:
        resolved_provider = resolve_provider(provider, feature="diagram.generate_diagram", user=user)
        final_provider = resolved_provider
        chat_prompt = _build_diagram_generation_prompt(text)

        from backend.services.ai_gateway_service import AIGatewayService

        ai_service = AIGatewayService()

        timer = TelemetryTimer(
            provider=resolved_provider,
            model="diagram-svg-generator",
            endpoint="sub4/generate_diagram", api_type="chat",
            credential_alias="COZE_TOKEN" if resolved_provider == "coze" else "OLLAMA_BASE_URL",
        )
        with timer:
            try:
                content = await ai_service.chat_with_provider(
                    message=chat_prompt,
                    context={"coze_user_id": f"sub4_{user.get('id', 'anon')}"},
                    provider=resolved_provider,
                )
            except Exception as e:
                await timer.save(success=False, error=str(e))
                raise

        draft_svg = _extract_svg_from_ai_output(content)
        draft_quality = _estimate_svg_quality(draft_svg)
        refined = False
        fallback_used = False
        provider_switched = False
        final_svg = draft_svg

        # Second pass: ask the same provider to polish low/medium quality drafts.
        if draft_quality < 9:
            refine_prompt = _build_diagram_refine_prompt(text, draft_svg)
            try:
                refined_content = await ai_service.chat_with_provider(
                    message=refine_prompt,
                    context={"coze_user_id": f"sub4_refine_{user.get('id', 'anon')}"},
                    provider=resolved_provider,
                )
                refined_svg = _extract_svg_from_ai_output(refined_content)
                final_svg = refined_svg
                refined = True
                total_prompt_len = len(chat_prompt) + len(refine_prompt)
                total_completion_len = len(content) + len(refined_content)
            except Exception:
                logger.warning("Diagram refine pass failed; returning draft SVG", exc_info=True)
                total_prompt_len = len(chat_prompt)
                total_completion_len = len(content)
        else:
            total_prompt_len = len(chat_prompt)
            total_completion_len = len(content)

        est_prompt = max(1, total_prompt_len // 4)
        est_completion = max(1, total_completion_len // 4)
        await timer.save(prompt_tokens=est_prompt, completion_tokens=est_completion)

        is_valid_xml, parse_err = _validate_svg_xml(final_svg)
        if not is_valid_xml:
            logger.warning("Generated SVG XML invalid, attempting syntax repair: %s", parse_err)
            repair_prompt = _build_svg_syntax_repair_prompt(final_svg, parse_err or "unknown parse error")
            repaired_content = await ai_service.chat_with_provider(
                message=repair_prompt,
                context={"coze_user_id": f"sub4_repair_{user.get('id', 'anon')}"},
                provider=resolved_provider,
            )
            repaired_svg = _extract_svg_from_ai_output(repaired_content)
            repaired_ok, repaired_err = _validate_svg_xml(repaired_svg)
            if repaired_ok:
                final_svg = repaired_svg
            else:
                logger.warning("Repair attempt still malformed XML. Trying alternate provider first: %s", repaired_err)

                alternate_provider = "coze" if resolved_provider == "local_ollama" else "local_ollama"
                try:
                    alt_content = await ai_service.chat_with_provider(
                        message=chat_prompt,
                        context={"coze_user_id": f"sub4_alt_{user.get('id', 'anon')}"},
                        provider=alternate_provider,
                    )
                    alt_svg = _extract_svg_from_ai_output(alt_content)
                    alt_ok, alt_err = _validate_svg_xml(alt_svg)
                    if not alt_ok:
                        alt_repair_prompt = _build_svg_syntax_repair_prompt(alt_svg, alt_err or "unknown parse error")
                        alt_repair_content = await ai_service.chat_with_provider(
                            message=alt_repair_prompt,
                            context={"coze_user_id": f"sub4_alt_repair_{user.get('id', 'anon')}"},
                            provider=alternate_provider,
                        )
                        alt_repaired_svg = _extract_svg_from_ai_output(alt_repair_content)
                        alt_repaired_ok, alt_repaired_err = _validate_svg_xml(alt_repaired_svg)
                        if not alt_repaired_ok:
                            raise ValueError(f"alternate provider svg still malformed: {alt_repaired_err}")
                        alt_svg = alt_repaired_svg

                    final_svg = alt_svg
                    final_provider = alternate_provider
                    provider_switched = True
                except Exception as alt_exc:
                    logger.warning("Alternate provider also failed. Using deterministic fallback SVG: %s", alt_exc)
                    final_svg = _build_fallback_svg(text)
                    fallback_ok, fallback_err = _validate_svg_xml(final_svg)
                    if not fallback_ok:
                        raise ValueError(f"Fallback SVG generation failed XML validation: {fallback_err}")
                    fallback_used = True

        # Save to generation history
        try:
            _exp = await compute_history_expires_at(user.get("id", ""))
            _doc = {
                "user_id": user.get("id", ""),
                "params": {
                    "service_type": "generate",
                    "input_prompt": text[:200],
                    "provider": final_provider,
                    "draft_quality": draft_quality,
                    "refined": refined,
                    "fallback_used": fallback_used,
                },
                "source": {"prompt": text},
                "result_preview": f"Generated diagram ({final_provider}, quality={draft_quality}): {text[:100]}",
                "result_full": json.dumps({"svg": final_svg}),
                "created_at": datetime.now(timezone.utc),
            }
            if _exp is not None:
                _doc["expires_at"] = _exp
            await db.sub4_generation_history.insert_one(_doc)
        except Exception:
            pass  # history save failure should not block the response

        return {
            'svg': final_svg,
            'meta': {
                'provider': final_provider,
                'draft_quality': draft_quality,
                'refined': refined,
                'fallback_used': fallback_used,
                'provider_switched': provider_switched,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Diagram generation failed")
        raise HTTPException(status_code=500, detail=f"Diagram generation failed: {str(e)}")


@diagram_router.post("/coze_generate_text")
async def coze_generate_text(
    keywords: str = Form(...),
    provider: str | None = Form(None),
    user: dict = Depends(get_current_user),
):
    """Expand keywords into a diagram description with selectable provider."""
    keywords = keywords.strip()
    if not keywords:
        raise HTTPException(status_code=400, detail="Keywords are required")

    resolved_provider = resolve_provider(provider, feature="diagram.generate_text", user=user)

    system_prompt = (
        "You are an expert educator and diagram designer. "
        "Given keywords or a topic, write a detailed English description (150-300 words) "
        "that can be used to generate an educational diagram. "
        "Include: the main components/nodes, their relationships/connections, "
        "hierarchy or flow direction, and any important labels. "
        "Be specific about structure (e.g., tree, flowchart, cycle, layered). "
        "Output ONLY the description text, no titles or formatting."
    )

    full_prompt = f"{system_prompt}\n\nKeywords/Topic: {keywords}"

    try:
        from backend.services.ai_gateway_service import AIGatewayService

        ai_service = AIGatewayService()
        timer = TelemetryTimer(
            provider=resolved_provider,
            model="diagram-text-generator",
            endpoint="sub4/coze_generate_text",
            api_type="chat",
            credential_alias="COZE_TOKEN" if resolved_provider == "coze" else "OLLAMA_BASE_URL",
        )
        with timer:
            answer = await ai_service.chat_with_provider(
                message=full_prompt,
                context={"coze_user_id": f"sub4_{user.get('id', 'anon')}"},
                provider=resolved_provider,
            )
            await timer.save(
                success=True,
                prompt_tokens=max(1, len(keywords) // 3),
                completion_tokens=max(1, len(answer) // 3),
            )

        return {"text": answer.strip()}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Coze text generation failed")
        raise HTTPException(status_code=500, detail=f"Text generation failed: {str(e)}")


@diagram_router.post("/download_svg")
def download_svg(req: DownloadSvgSchema, user: dict = Depends(get_current_user)):
    file_stream = BytesIO(req.svg.encode('utf-8'))
    return StreamingResponse(file_stream, media_type="image/svg+xml",
                             headers={"Content-Disposition": "attachment; filename=edited.svg"})


@diagram_router.get("/fetch_external_svg")
def fetch_external_svg(url: str, user: dict = Depends(get_current_user)):
    try:
        if not isinstance(url, str) or not re.match(r"^https?://", url.strip(), re.IGNORECASE):
            raise HTTPException(status_code=400, detail="Invalid URL")

        resp = safe_get(
            url,
            headers={
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'image/svg+xml,text/xml;q=0.9,*/*;q=0.8',
            },
            timeout=20,
        )
        resp.raise_for_status()

        content_type = (resp.headers.get('content-type') or '').lower()
        raw = resp.content or b''
        text = raw.decode(resp.encoding or 'utf-8', errors='replace')
        if '<svg' not in text.lower() and 'image/svg+xml' not in content_type:
            raise HTTPException(status_code=400, detail="Target URL did not return SVG content")

        return Response(content=text, media_type="image/svg+xml")
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        logger.exception("SVG proxy fetch failed")
        raise HTTPException(status_code=500, detail="Internal server error")


# ── Generation History ──

@diagram_router.get("/generation_history")
async def get_generation_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    user: dict = Depends(get_current_user),
):
    """Return paginated visual-tool history (diagram + image-extract) for the current user."""
    try:
        user_id = user.get("id", "")
        skip = (page - 1) * page_size

        # Merge sub4 (diagram/extract) and sub3 (image-extractor) via $unionWith aggregation.
        pipeline = [
            {"$match": {"user_id": user_id}},
            {"$project": {"result_full": 0}},
            {"$addFields": {"_source_coll": "sub4"}},
            {"$unionWith": {
                "coll": "sub3_generation_history",
                "pipeline": [
                    {"$match": {"user_id": user_id}},
                    {"$project": {"result_full": 0}},
                    {"$addFields": {"_source_coll": "sub3"}},
                ],
            }},
            {"$sort": {"created_at": -1}},
            {"$facet": {
                "items": [{"$skip": skip}, {"$limit": page_size}],
                "total_count": [{"$count": "count"}],
            }},
        ]

        result = await db.sub4_generation_history.aggregate(pipeline).to_list(length=1)
        if not result:
            return {"success": True, "items": [], "total": 0, "page": page, "page_size": page_size}

        facet = result[0]
        raw_items = facet.get("items", [])
        total = (facet.get("total_count") or [{}])[0].get("count", 0)

        items = []
        for doc in raw_items:
            created = doc.get("created_at", "")
            items.append({
                "id": str(doc["_id"]),
                "tool": doc.get("tool") or doc.get("params", {}).get("service_type") or "",
                "source_coll": doc.get("_source_coll", "sub4"),
                "params": doc.get("params", {}),
                "preview": doc.get("result_preview", ""),
                "created_at": created.isoformat() if hasattr(created, "isoformat") else str(created),
            })

        return {"success": True, "items": items, "total": total, "page": page, "page_size": page_size}
    except Exception as e:
        return JSONResponse(content={"success": False, "error": str(e)}, status_code=500)


@diagram_router.get("/generation_history/{history_id}")
async def get_generation_detail(history_id: str, user: dict = Depends(get_current_user)):
    """Return full generation result — checks sub4 then sub3 (image-extractor)."""
    try:
        from bson import ObjectId
        from bson.errors import InvalidId
        try:
            oid = ObjectId(history_id)
        except (InvalidId, Exception):
            return JSONResponse(content={"success": False, "error": "Invalid history ID format"}, status_code=400)
        user_id = user.get("id", "")
        doc = await db.sub4_generation_history.find_one({"_id": oid, "user_id": user_id})
        if not doc:
            doc = await db.sub3_generation_history.find_one({"_id": oid, "user_id": user_id})
        if not doc:
            return JSONResponse(content={"success": False, "error": "Record not found"}, status_code=404)
        created = doc.get("created_at", "")
        return {
            "success": True,
            "id": str(doc.get("_id")),
            "tool": doc.get("tool") or doc.get("params", {}).get("service_type") or "",
            "params": doc.get("params", {}),
            "result": doc.get("result_full", ""),
            "created_at": created.isoformat() if hasattr(created, "isoformat") else str(created),
        }
    except Exception as e:
        return JSONResponse(content={"success": False, "error": str(e)}, status_code=500)


@diagram_router.post("/generation_history/{history_id}/replay")
async def replay_generation_history(history_id: str, user: dict = Depends(get_current_user)):
    """Return original prompt/params for replay — checks sub4 then sub3."""
    try:
        from bson import ObjectId
        from bson.errors import InvalidId
        try:
            oid = ObjectId(history_id)
        except (InvalidId, Exception):
            return JSONResponse(content={"success": False, "error": "Invalid history ID format"}, status_code=400)
        user_id = user.get("id", "")
        doc = await db.sub4_generation_history.find_one({"_id": oid, "user_id": user_id})
        if not doc:
            doc = await db.sub3_generation_history.find_one({"_id": oid, "user_id": user_id})
        if not doc:
            return JSONResponse(content={"success": False, "error": "Record not found"}, status_code=404)

        params = doc.get("params", {})
        source = doc.get("source", {})
        tool = doc.get("tool") or params.get("service_type") or ""
        return {
            "success": True,
            "tool": tool,
            "prompt": source.get("prompt", ""),
            "provider": params.get("provider", "local_ollama"),
            "service_type": params.get("service_type", "generate"),
        }
    except Exception as e:
        return JSONResponse(content={"success": False, "error": str(e)}, status_code=500)