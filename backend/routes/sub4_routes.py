# backend/routes/sub4_routes.py
import os
import shutil
import base64
import re
import logging
import httpx
import requests
import fitz
from io import BytesIO
from typing import Optional
from docx import Document
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, StreamingResponse, Response
from werkzeug.utils import secure_filename
from backend.core.security import get_current_user
from backend.core.safe_requests import safe_get
from backend.schemas import SearchSvgSchema, DownloadSvgSchema
from backend.config import Config

logger = logging.getLogger(__name__)

sub4_router = APIRouter(prefix="/api/sub4", tags=["Sub4"])


def get_sub4_paths():
    upload_folder = os.path.join(Config.UPLOAD_FOLDER, 'sub4')
    generated_folder = os.path.join(Config.BASE_DIR, 'generated', 'sub4')
    os.makedirs(upload_folder, exist_ok=True)
    os.makedirs(generated_folder, exist_ok=True)
    return upload_folder, generated_folder


@sub4_router.post("/upload_document")
def extract_diagrams(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    upload_folder, _ = get_sub4_paths()
    filename = secure_filename(file.filename)
    path = os.path.join(upload_folder, filename)

    with open(path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    extracted = []
    try:
        if filename.lower().endswith('.pdf'):
            doc = fitz.open(path)
            for i in range(doc.page_count):
                for img in doc.get_page_images(i):
                    pix = fitz.Pixmap(doc, img[0])
                    if pix.n >= 5: pix = fitz.Pixmap(fitz.csRGB, pix)
                    b64 = base64.b64encode(pix.tobytes('png')).decode('ascii')
                    extracted.append({'page': i + 1, 'data': f'data:image/png;base64,{b64}'})
            doc.close()
        elif filename.lower().endswith(('.docx', '.doc')):
            docx = Document(path)
            for idx, shape in enumerate(docx.inline_shapes):
                if shape._inline.graphic.graphicData.pic is not None:
                    rel = shape._inline.graphic.graphicData.pic.blipFill.blip.embed
                    b64 = base64.b64encode(docx.part.related_parts[rel].blob).decode('ascii')
                    extracted.append({'page': f"Word-Img-{idx + 1}", 'data': f'data:image/png;base64,{b64}'})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {'success': True, 'file': {'original_name': filename, 'extracted_count': len(extracted)},
            'extracted': extracted}


@sub4_router.post("/search_svg")
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
        raise HTTPException(status_code=500, detail=str(e))


@sub4_router.post("/generate_diagram")
async def generate_diagram(
    promptFile: Optional[UploadFile] = File(None),
    promptText: str = Form(default=''),
    user: dict = Depends(get_current_user),
):
    """Generate SVG diagram from uploaded text file OR direct text input via DeepSeek."""
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
        headers = {
            'Authorization': f'Bearer {Config.DEEPSEEK_API_KEY}',
            'Content-Type': 'application/json',
        }
        chat_prompt = (
            "You are an expert SVG diagram creator. Given the following description, generate a clean, "
            "well-structured SVG diagram.\n\n"
            "CRITICAL RULES:\n"
            "1. Output ONLY raw SVG XML code (starting with <svg and ending with </svg>). "
            "   Do NOT include any markdown fences, explanation, or surrounding text.\n"
            "2. The SVG MUST be valid XML. All special characters in text content must be XML-escaped: "
            "   use &amp; for &, &lt; for <, &gt; for >, &quot; for \". NEVER use bare & in text.\n"
            "3. LAYOUT: Use a large viewBox (at least 800x600). Leave generous spacing between elements "
            "   (minimum 40px gap). Stack layers vertically with at least 80px between rows. "
            "   Do NOT overlap any text, boxes, arrows, or labels. Offset side annotations so they "
            "   don't cover main content.\n"
            "4. TEXT: Use font-family='Arial, sans-serif', font-size >= 14px. Keep labels short. "
            "   Use <text> elements positioned well inside their parent shapes with sufficient padding.\n"
            "5. STYLE: Use soft, professional colors. Add rounded rectangles (rx/ry). "
            "   Use <marker> arrowheads for connections. Add subtle drop shadows via <filter> if useful.\n"
            "6. ARROWS: Use <line> or <path> with marker-end. Keep arrows clearly separated from text.\n\n"
            f"Description:\n{text}"
        )

        async with httpx.AsyncClient(timeout=60) as http_client:
            resp = await http_client.post(
                'https://api.deepseek.com/chat/completions',
                json={
                    'model': 'deepseek-chat',
                    'messages': [{'role': 'user', 'content': chat_prompt}],
                },
                headers=headers,
            )
            resp.raise_for_status()

        content = resp.json()['choices'][0]['message']['content']

        # Extract SVG from possible markdown fences
        if '```svg' in content:
            content = content.split('```svg')[1].split('```')[0].strip()
        elif '```xml' in content:
            content = content.split('```xml')[1].split('```')[0].strip()
        elif '```' in content:
            content = content.split('```')[1].split('```')[0].strip()

        # Validate it contains SVG
        if '<svg' not in content.lower():
            raise ValueError("AI did not return valid SVG content")

        # Extract just the <svg>...</svg> portion
        svg_match = re.search(r'<svg[\s\S]*?</svg>', content, re.IGNORECASE)
        if not svg_match:
            raise ValueError("Could not extract SVG element from AI response")

        svg_code = svg_match.group(0)

        # Sanitize: fix unescaped & in text content (causes "xmlParseEntityRef: no name")
        # Replace & that is NOT already part of a valid XML entity (&amp; &lt; &gt; &quot; &apos; &#nnn;)
        svg_code = re.sub(
            r'&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)',
            '&amp;',
            svg_code
        )

        return {'svg': svg_code}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Diagram generation failed")
        raise HTTPException(status_code=500, detail=f"Diagram generation failed: {str(e)}")


@sub4_router.post("/coze_generate_text")
async def coze_generate_text(
    keywords: str = Form(...),
    user: dict = Depends(get_current_user),
):
    """Use Coze AI to expand keywords into a detailed diagram description."""
    keywords = keywords.strip()
    if not keywords:
        raise HTTPException(status_code=400, detail="Keywords are required")

    api_key = Config.COZE_TOKEN
    bot_id = Config.COZE_BOT_ID
    api_root = (Config.COZE_API_ROOT or "https://api.coze.com").rstrip("/")

    if not api_key or not bot_id:
        raise HTTPException(503, "Coze API key or bot id not configured")

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
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "bot_id": bot_id,
        "user_id": "sub4_diagram_gen",
        "stream": False,
        "additional_messages": [
            {"role": "user", "content": full_prompt, "content_type": "text"}
        ],
    }

    timeout_seconds = float(Config.COZE_REQUEST_TIMEOUT_SECONDS)
    poll_interval = float(Config.COZE_POLL_INTERVAL_SECONDS)
    poll_max_attempts = int(Config.COZE_POLL_MAX_ATTEMPTS)

    try:
        async with httpx.AsyncClient(timeout=timeout_seconds) as http_client:
            # Start chat
            start_resp = await http_client.post(
                f"{api_root}/v3/chat", headers=headers, json=payload
            )
            if start_resp.status_code != 200:
                logger.error("Coze start error %s: %s", start_resp.status_code, start_resp.text[:500])
                raise HTTPException(502, "AI service error")

            start_data = start_resp.json().get("data", {})
            chat_id = start_data.get("id")
            conversation_id = start_data.get("conversation_id")
            if not chat_id or not conversation_id:
                raise HTTPException(502, "AI service returned invalid chat identifiers")

            # Poll for completion
            import asyncio
            for _ in range(poll_max_attempts):
                retrieve_resp = await http_client.get(
                    f"{api_root}/v3/chat/retrieve",
                    headers=headers,
                    params={"chat_id": chat_id, "conversation_id": conversation_id},
                )
                status = retrieve_resp.json().get("data", {}).get("status")
                if status == "completed":
                    break
                if status == "failed":
                    raise HTTPException(502, "AI service chat failed")
                await asyncio.sleep(poll_interval)
            else:
                raise HTTPException(504, "AI service timed out")

            # Fetch messages
            msg_resp = await http_client.get(
                f"{api_root}/v3/chat/message/list",
                headers=headers,
                params={"chat_id": chat_id, "conversation_id": conversation_id},
            )
            messages = msg_resp.json().get("data", [])
            for m in messages:
                if m.get("role") == "assistant" and m.get("type") == "answer":
                    return {"text": m.get("content", "").strip()}

            raise HTTPException(502, "No answer received from AI service")

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Coze text generation failed")
        raise HTTPException(status_code=500, detail=f"Text generation failed: {str(e)}")


@sub4_router.post("/download_svg")
def download_svg(req: DownloadSvgSchema, user: dict = Depends(get_current_user)):
    file_stream = BytesIO(req.svg.encode('utf-8'))
    return StreamingResponse(file_stream, media_type="image/svg+xml",
                             headers={"Content-Disposition": "attachment; filename=edited.svg"})


@sub4_router.get("/fetch_external_svg")
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
        raise HTTPException(status_code=500, detail=str(e))