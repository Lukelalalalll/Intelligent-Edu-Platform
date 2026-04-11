import os
import io
import tempfile
import base64
import zipfile
import hashlib
import json
import glob
import logging
from PIL import Image
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from io import BytesIO
import requests
import re
import unicodedata
import opendataloader_pdf
from backend.core.security import get_current_user
from backend.core.safe_requests import safe_get
from backend.core.database import db, compute_history_expires_at
from backend.config import Config
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

image_extractor_router = APIRouter(prefix="/api/image-extractor", tags=["Image Extractor"])
_limiter = Limiter(key_func=get_remote_address)
_logger = logging.getLogger(__name__)

SERPAPI_KEY = os.getenv("SERPAPI_KEY", "")
MAGIC_API_URL = os.getenv("MAGIC_API_URL", "https://api.magicstudio.com/api/ai-art-generator")

def _slugify(text: str, fallback: str = "image") -> str:
    if not text:
        return fallback
    text = unicodedata.normalize("NFKD", text)
    text = re.sub(r"[^\w\s-]", "", text, flags=re.UNICODE)
    text = re.sub(r"[\s_-]+", "_", text).strip("_")
    return text[:60] or fallback

def _img_md5(img: Image.Image) -> str:
    try:
        return hashlib.md5(img.tobytes()).hexdigest()
    except Exception:
        return hashlib.md5(img.copy().tobytes()).hexdigest()


def _collect_image_nodes(node, results):
    """Recursively collect all image items from opendataloader_pdf JSON output."""
    if str(node.get("type", "")).lower() == "image":
        results.append(node)
    for child in node.get("kids", []):
        _collect_image_nodes(child, results)


def _extract_images_opendataloader(data: bytes):
    """Primary: use opendataloader_pdf (fast Java-based extraction)."""
    import shutil as _shutil
    tmp_dir = tempfile.mkdtemp(prefix="sub3_pdf_")
    try:
        img_dir = os.path.join(tmp_dir, "images")
        os.makedirs(img_dir, exist_ok=True)

        pdf_path = os.path.join(tmp_dir, "input.pdf")
        with open(pdf_path, "wb") as f:
            f.write(data)

        opendataloader_pdf.convert(
            input_path=pdf_path,
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

        images = []
        idx = 0
        for img_file in sorted(os.listdir(img_dir)):
            img_path = os.path.join(img_dir, img_file)
            if not os.path.isfile(img_path):
                continue
            try:
                image_bytes = open(img_path, "rb").read()
                pil_img = Image.open(io.BytesIO(image_bytes))
                width, height = pil_img.size
                if width < 100 or height < 100:
                    continue
                colors = pil_img.getcolors(maxcolors=2)
                if colors and len(colors) == 1:
                    continue

                pno = page_map.get(img_file, 0)
                chapter = f"Page {pno}" if pno else "Unknown Page"
                images.append({
                    "bytes": image_bytes, "ext": "png", "index": idx,
                    "chapter": chapter, "summary": "Extracted from PDF",
                    "caption": f"Image from page {pno}" if pno else "Image from PDF",
                })
                idx += 1
            except Exception as e:
                print(f"[Error] Image {img_file}: {e}")
        return images
    finally:
        _shutil.rmtree(tmp_dir, ignore_errors=True)


def _extract_images_fitz(data: bytes):
    """Fallback: use PyMuPDF (fitz) when opendataloader_pdf fails."""
    import fitz
    doc = fitz.open(stream=data, filetype="pdf")
    images = []
    idx = 0
    for pno in range(len(doc)):
        page = doc[pno]
        chapter = f"Page {pno + 1}"
        try:
            image_list = page.get_images(full=True)
        except Exception:
            continue
        for img_info in image_list:
            xref = img_info[0]
            try:
                base = doc.extract_image(xref)
                image_bytes = base["image"]
                image_ext = base["ext"]
                width = base.get("width", 0)
                height = base.get("height", 0)
                if width < 100 or height < 100:
                    continue
                try:
                    pil_img = Image.open(io.BytesIO(image_bytes))
                    colors = pil_img.getcolors(maxcolors=2)
                    if colors and len(colors) == 1:
                        continue
                except Exception:
                    pass
                images.append({
                    "bytes": image_bytes, "ext": image_ext, "index": idx,
                    "chapter": chapter, "summary": "Extracted from PDF",
                    "caption": f"Image from page {pno + 1}",
                })
                idx += 1
            except Exception as e:
                print(f"[Error] Page {pno} image {idx}: {e}")
    doc.close()
    return images


def extract_images_with_info(data: bytes):
    try:
        return _extract_images_opendataloader(data)
    except Exception as e:
        print(f"[Warning] opendataloader_pdf failed, falling back to PyMuPDF: {e}")
    try:
        return _extract_images_fitz(data)
    except Exception as e:
        print(f"[Error] PDF processing: {e}")
        return []

class SearchImagesSchema(BaseModel):
    query: str

class GenerateAiImagesSchema(BaseModel):
    prompt: str
    num_images: int = 4

class ExportImagesSchema(BaseModel):
    images: List[Dict[str, Any]]

@image_extractor_router.post("/extract-pdf-images")
async def api_extract_pdf_images(pdf: UploadFile = File(...), user: dict = Depends(get_current_user)):
    try:
        data = await pdf.read()
        images = extract_images_with_info(data)
        if not images:
            return JSONResponse({'success': False, 'error': 'No images found in PDF'})

        images_by_chapter = {}
        for img in images:
            chapter = img['chapter']
            if chapter not in images_by_chapter:
                images_by_chapter[chapter] = []

            img_base64 = base64.b64encode(img['bytes']).decode('utf-8')

            images_by_chapter[chapter].append({
                'src': f"data:image/{img['ext']};base64,{img_base64}",
                'index': img['index'],
                'chapter': img['chapter'],
                'summary': img['summary'],
                'caption': img['caption']
            })

        result = {
            'success': True,
            'totalImages': len(images),
            'imagesByChapter': images_by_chapter
        }

        # ── save history ─────────────────────────────────────
        try:
            user_id = user.get("id", "")
            _exp = await compute_history_expires_at(user_id)
            _doc = {
                "user_id": user_id,
                "tool": "extract_pdf_images",
                "params": {
                    "source_filename": getattr(pdf, "filename", "unknown.pdf"),
                },
                "result_preview": f"Extracted {len(images)} images from PDF",
                "result_full": json.dumps({
                    "totalImages": len(images),
                    "chapters": list(images_by_chapter.keys()),
                }),
                "created_at": datetime.now(timezone.utc),
            }
            if _exp is not None:
                _doc["expires_at"] = _exp
            await db.sub3_generation_history.insert_one(_doc)
        except Exception:
            _logger.warning("Failed to save PDF extraction history", exc_info=True)

        return result
    except Exception as e:
        print(f"Route Error: {e}")
        return JSONResponse({'success': False, 'error': str(e)})

@image_extractor_router.post("/search-google-images")
def api_search_google_images(req: SearchImagesSchema, user: dict = Depends(get_current_user)):
    query = req.query
    if not query:
        return JSONResponse({'success': False, 'error': 'No search query provided'})
    if not SERPAPI_KEY:
        return JSONResponse({'success': False, 'error': 'SERPAPI key not configured'})
    try:
        url = "https://serpapi.com/search.json"
        params = {
            "engine": "google",
            "q": query,
            "tbm": "isch",
            "ijn": 0,
            "num": 8,
            "safe": "active",
            "api_key": SERPAPI_KEY,
        }
        headers = {"User-Agent": "Mozilla/5.0"}
        response = requests.get(url, params=params, headers=headers, timeout=20)
        results = response.json().get("images_results", [])
        images = []
        for r in results[:8]:
            src = r.get("original") or r.get("thumbnail")
            if src:
                images.append({'src': src})
        return {'success': True, 'images': images}
    except Exception as e:
        return JSONResponse({'success': False, 'error': str(e)})

@image_extractor_router.post("/generate-ai-images")
@_limiter.limit("10/minute")
async def api_generate_ai_images(request: Request, req: GenerateAiImagesSchema, user: dict = Depends(get_current_user)):
    prompt = req.prompt
    num_images = req.num_images
    if not prompt:
        return JSONResponse({'success': False, 'error': 'No prompt provided'})

    if not MAGIC_API_URL:
        # Mock logic — warn so operators notice in production
        _logger.warning("MAGIC_API_URL not set — returning placeholder images from picsum.photos")
        images = []
        for i in range(min(num_images, 8)):
            images.append({'src': f'https://picsum.photos/300/300?random={i + 100}&prompt={prompt}'})

        # ── save history ─────────────────────────────────────
        try:
            user_id = user.get("id", "")
            _exp = await compute_history_expires_at(user_id)
            _doc = {
                "user_id": user_id,
                "tool": "ai_image_generate",
                "params": {
                    "prompt": prompt,
                    "num_images": num_images,
                },
                "result_preview": f"Generated {len(images)} AI images (mock)",
                "result_full": json.dumps({"ai_images": images}),
                "created_at": datetime.now(timezone.utc),
            }
            if _exp is not None:
                _doc["expires_at"] = _exp
            await db.sub3_generation_history.insert_one(_doc)
        except Exception:
            _logger.warning("Failed to save AI-image generation history", exc_info=True)

        return {'success': True, 'images': images}

    try:
        headers = {
            "Accept": "image/png",
            "Origin": "https://magicstudio.com",
            "Referer": "https://magicstudio.com/",
            "User-Agent": "Mozilla/5.0",
        }
        images = []
        for i in range(min(num_images, 4)):
            try:
                payload = {
                    "prompt": prompt,
                    "num_images": 1,
                    "height": 768,
                    "width": 768,
                    "guidance_scale": 7.5,
                    "steps": 28,
                }
                response = requests.post(MAGIC_API_URL, data=payload, headers=headers, timeout=30)
                if response.status_code == 200 and response.content:
                    img_base64 = base64.b64encode(response.content).decode('utf-8')
                    images.append({'src': f"data:image/png;base64,{img_base64}"})
            except Exception:
                continue

        # ── save history ─────────────────────────────────────
        try:
            user_id = user.get("id", "")
            _exp = await compute_history_expires_at(user_id)
            _doc = {
                "user_id": user_id,
                "tool": "ai_image_generate",
                "params": {
                    "prompt": prompt,
                    "num_images": num_images,
                },
                "result_preview": f"Generated {len(images)} AI images",
                "result_full": json.dumps({"ai_images": images}),
                "created_at": datetime.now(timezone.utc),
            }
            if _exp is not None:
                _doc["expires_at"] = _exp
            await db.sub3_generation_history.insert_one(_doc)
        except Exception:
            _logger.warning("Failed to save AI-image generation history", exc_info=True)

        return {'success': True, 'images': images}
    except Exception as e:
        return JSONResponse({'success': False, 'error': str(e)})

@image_extractor_router.post("/export-zip")
def api_export_zip(req: ExportImagesSchema, user: dict = Depends(get_current_user)):
    images_data = req.images
    if not images_data:
        return JSONResponse({'success': False, 'error': 'No images provided'}, status_code=400)
    try:
        temp_dir = tempfile.mkdtemp()
        zip_path = os.path.join(temp_dir, 'selected_images.zip')
        with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as zipf:
            for i, img_info in enumerate(images_data, start=1):
                img_src = img_info.get('src') or img_info.get('img') or ''
                img_data = None
                if img_src.startswith('data:image'):
                    try:
                        base64_data = img_src.split(',')[1]
                        img_data = base64.b64decode(base64_data)
                    except Exception:
                        continue
                elif img_src.startswith('http'):
                    try:
                        resp = safe_get(img_src, timeout=10)
                        if resp.status_code == 200:
                            img_data = resp.content
                    except Exception:
                        continue
                if img_data:
                    hint = img_info.get('chapter') or img_info.get('caption') or img_info.get('summary')
                    name = _slugify(hint or "image")
                    fname = f"{i:03d}_{name}.png"
                    zipf.writestr(fname, img_data)
        return FileResponse(zip_path, filename='selected_images.zip', media_type='application/zip')
    except Exception as e:
        print(f"Export ZIP Error: {e}")
        return JSONResponse({'success': False, 'error': str(e)}, status_code=500)

@image_extractor_router.post("/export-pdf")
def api_export_pdf(req: ExportImagesSchema, user: dict = Depends(get_current_user)):
    images_data = req.images
    if not images_data:
        return JSONResponse({'success': False, 'error': 'No images provided'}, status_code=400)
    try:
        temp_dir = tempfile.mkdtemp()
        pdf_path = os.path.join(temp_dir, 'selected_images.pdf')
        from reportlab.pdfgen import canvas
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.utils import ImageReader

        c = canvas.Canvas(pdf_path, pagesize=letter)
        page_width, page_height = letter
        images_added = 0
        for i, img_info in enumerate(images_data):
            img_src = img_info.get('src') or img_info.get('img') or ''
            img_buffer = None
            try:
                if img_src.startswith('data:image'):
                    base64_data = img_src.split(',')[1]
                    img_data = base64.b64decode(base64_data)
                    img_buffer = BytesIO(img_data)
                elif img_src.startswith('http'):
                    resp = safe_get(img_src, timeout=10)
                    if resp.status_code == 200:
                        img_buffer = BytesIO(resp.content)
                if img_buffer:
                    img = Image.open(img_buffer)
                    if img.mode not in ('RGB', 'RGBA'):
                        img = img.convert('RGB')
                    img_byte_arr = BytesIO()
                    img.save(img_byte_arr, format='PNG')
                    img_byte_arr.seek(0)
                    img_width, img_height = img.size
                    max_w = page_width - 40
                    max_h = page_height - 40
                    scale = min(max_w / img_width, max_h / img_height)
                    new_width = img_width * scale
                    new_height = img_height * scale
                    x = (page_width - new_width) / 2
                    y = (page_height - new_height) / 2
                    c.drawImage(ImageReader(img_byte_arr), x, y, new_width, new_height)
                    caption = img_info.get('caption') or img_info.get('summary') or ''
                    if caption:
                        clean_caption = _slugify(caption, fallback="Image")
                        c.setFont("Helvetica", 10)
                        c.drawString(40, y - 15, clean_caption[:80])
                    c.showPage()
                    images_added += 1
            except Exception as e:
                print(f"Error adding image {i} to PDF: {e}")
                continue
        c.save()
        if images_added == 0:
            return JSONResponse({'success': False, 'error': 'No valid images could be processed for PDF'}, status_code=400)
        return FileResponse(pdf_path, filename='selected_images.pdf', media_type='application/pdf')
    except Exception as e:
        print(f"Export PDF Error: {e}")
        return JSONResponse({'success': False, 'error': str(e)}, status_code=500)


# ───────────────────────── Generation History ──────────────────────────

@image_extractor_router.get("/generation_history")
async def list_image_extractor_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    user: dict = Depends(get_current_user),
):
    user_id = user.get("id", "")
    skip = (page - 1) * page_size
    cursor = (
        db.sub3_generation_history
        .find({"user_id": user_id}, {"result_full": 0})
        .sort("created_at", -1)
        .skip(skip)
        .limit(page_size)
    )
    items = []
    async for doc in cursor:
        items.append({
            "id": str(doc["_id"]),
            "tool": doc.get("tool", ""),
            "params": doc.get("params", {}),
            "preview": doc.get("result_preview", ""),
            "created_at": doc.get("created_at", "").isoformat() if hasattr(doc.get("created_at", ""), "isoformat") else str(doc.get("created_at", "")),
        })
    total = await db.sub3_generation_history.count_documents({"user_id": user_id})
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@image_extractor_router.get("/generation_history/{history_id}")
async def get_image_extractor_history_detail(
    history_id: str,
    user: dict = Depends(get_current_user),
):
    from bson import ObjectId

    try:
        oid = ObjectId(history_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid history ID format")
    doc = await db.sub3_generation_history.find_one(
        {"_id": oid, "user_id": user.get("id", "")}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="History record not found")
    return {
        "success": True,
        "id": str(doc.get("_id")),
        "params": doc.get("params", {}),
        "result": doc.get("result_full", ""),
        "created_at": doc.get("created_at", "").isoformat() if hasattr(doc.get("created_at", ""), "isoformat") else str(doc.get("created_at", "")),
    }


@image_extractor_router.post("/generation_history/{history_id}/replay")
async def replay_image_extractor_history(
    history_id: str,
    user: dict = Depends(get_current_user),
):
    from bson import ObjectId

    doc = await db.sub3_generation_history.find_one(
        {"_id": ObjectId(history_id), "user_id": user.get("id", "")}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="History record not found")
    result_full = doc.get("result_full", "{}")
    try:
        data = json.loads(result_full)
    except json.JSONDecodeError:
        data = {}
    return {
        "tool": doc.get("tool"),
        "params": doc.get("params", {}),
        "data": data,
    }
