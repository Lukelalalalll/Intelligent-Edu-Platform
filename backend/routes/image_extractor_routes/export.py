"""ZIP and PDF export endpoints."""
import base64
import logging
import os
import tempfile
import zipfile
from io import BytesIO
from typing import Any, Dict, List

from fastapi import Depends
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image
from pydantic import BaseModel

from backend.core.safe_requests import safe_get
from backend.core.security import get_current_user
from .helpers import slugify
from .router import image_extractor_router

_logger = logging.getLogger(__name__)


class ExportImagesSchema(BaseModel):
    images: List[Dict[str, Any]]


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
                    name = slugify(hint or "image")
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
                        clean_caption = slugify(caption, fallback="Image")
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
