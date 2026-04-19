"""Diagram extraction from uploaded PDF/DOCX documents."""
import base64
import json
import logging
import os
import uuid
from datetime import datetime, timezone

from docx import Document
from fastapi import Depends, File, HTTPException, UploadFile
from werkzeug.utils import secure_filename

from backend.core.database import compute_history_expires_at, db
from backend.core.security import get_current_user
from backend.utils.pdf_image_extractor import extract_pdf_images
from backend.utils.svg_utils import get_sub4_paths
from .router import diagram_router

logger = logging.getLogger(__name__)


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
            extracted = extract_pdf_images(path)
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

    # Save extracted images to disk so history detail can display them
    image_urls: list[str] = []
    try:
        _, generated_folder = get_sub4_paths()
        batch_id = uuid.uuid4().hex
        img_dir = os.path.join(generated_folder, "extracted", batch_id)
        os.makedirs(img_dir, exist_ok=True)
        for idx, item in enumerate(extracted):
            data_uri = item.get("data", "")
            if not data_uri:
                continue
            # Strip data URI prefix: data:image/png;base64,<data>
            if "," in data_uri:
                raw_b64 = data_uri.split(",", 1)[1]
            else:
                raw_b64 = data_uri
            img_bytes = base64.b64decode(raw_b64)
            img_filename = f"{idx}.png"
            img_path = os.path.join(img_dir, img_filename)
            with open(img_path, "wb") as f:
                f.write(img_bytes)
            image_urls.append(f"/generated/sub4/extracted/{batch_id}/{img_filename}")
    except Exception:
        logger.warning("Failed to save extracted diagram images to disk", exc_info=True)
        image_urls = []

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
            "result_full": json.dumps({"extracted_count": len(extracted), "images": image_urls}),
            "created_at": datetime.now(timezone.utc),
        }
        if _exp is not None:
            _doc["expires_at"] = _exp
        await db.sub4_generation_history.insert_one(_doc)
    except Exception:
        pass  # history save failure should not block the response

    return {'success': True, 'file': {'original_name': filename, 'extracted_count': len(extracted)},
            'extracted': extracted}
