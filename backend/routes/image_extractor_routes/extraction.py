"""PDF image extraction endpoint."""
import base64
import json
import logging
import os
import uuid
from datetime import datetime, timezone

from fastapi import Depends, File, UploadFile
from fastapi.responses import JSONResponse

from backend.config import Config
from backend.core.database import compute_history_expires_at, db
from backend.core.security import get_current_user
from .helpers import extract_images_with_info
from .router import image_extractor_router

_logger = logging.getLogger(__name__)


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

        # ── save images to disk for history display ──────────
        image_urls: list = []
        try:
            generated_dir = os.path.join(Config.BASE_DIR, 'generated', 'sub3', 'extracted')
            batch_id = uuid.uuid4().hex
            batch_dir = os.path.join(generated_dir, batch_id)
            os.makedirs(batch_dir, exist_ok=True)
            for img in images:
                img_filename = f"{img['index']}.png"
                img_path = os.path.join(batch_dir, img_filename)
                with open(img_path, 'wb') as f:
                    f.write(img['bytes'])
                image_urls.append(f"/generated/sub3/extracted/{batch_id}/{img_filename}")
        except Exception:
            _logger.warning("Failed to save extracted images to disk", exc_info=True)
            image_urls = []

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
                    "images": image_urls,
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
