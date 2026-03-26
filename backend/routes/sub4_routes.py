# backend/routes/sub4_routes.py
import os
import shutil
import base64
import uuid
import re
import requests
import subprocess
import fitz
from io import BytesIO
from docx import Document
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, StreamingResponse, Response
from werkzeug.utils import secure_filename
from backend.core.security import get_current_user
from backend.schemas import SearchSvgSchema, DownloadSvgSchema
from backend.config import Config

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
def generate_diagram(promptFile: UploadFile = File(...), user: dict = Depends(get_current_user)):
    _, output_dir = get_sub4_paths()
    prompt_text = promptFile.file.read().decode('utf-8')
    output_filename = f'diagram_{str(uuid.uuid4())[:8]}'
    tex_path = os.path.join(output_dir, f'{output_filename}.tex')
    pdf_path = os.path.join(output_dir, f'{output_filename}.pdf')

    try:
        headers = {'Authorization': f'Bearer {Config.DEEPSEEK_API_KEY}', 'Content-Type': 'application/json'}
        chat_prompt = f"Generate a LaTeX diagram using TikZ for: {prompt_text}. Only return the code between ```latex and ```."

        resp = requests.post('https://api.deepseek.com/chat/completions',
                             json={'model': 'deepseek-chat', 'messages': [{'role': 'user', 'content': chat_prompt}]},
                             headers=headers, timeout=40)
        resp.raise_for_status()
        latex_code = resp.json()['choices'][0]['message']['content']

        if '```latex' in latex_code: latex_code = latex_code.split('```latex')[1].split('```')[0].strip()
        latex_code = re.sub(r'\\documentclass.*?{.*?}|\\usepackage.*|\\begin{document}|\\end{document}', '', latex_code,
                            flags=re.DOTALL)
        match = re.search(r'\\begin{tikzpicture}.*?\\end{tikzpicture}', latex_code, re.DOTALL)
        tikz_code = match.group(0) if match else latex_code

        with open(tex_path, 'w', encoding='utf-8') as f:
            f.write(
                r"\documentclass[border=1mm]{standalone}\n\usepackage[dvipsnames]{xcolor}\n\usepackage{tikz}\n\begin{document}\n" + tikz_code + r"\n\end{document}\n")

        subprocess.run(
            [r"C:\Program Files\MiKTeX\miktex\bin\x64\pdflatex.exe", '-interaction=nonstopmode', '-output-directory',
             output_dir, f'{output_filename}.tex'], cwd=output_dir, capture_output=True)

        if os.path.exists(pdf_path):
            with open(pdf_path, 'rb') as f:
                return {'pdf_base64': base64.b64encode(f.read()).decode('utf-8')}
        raise Exception("LaTeX compilation failed")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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

        resp = requests.get(
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