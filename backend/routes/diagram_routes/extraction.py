"""Diagram extraction from uploaded PDF/DOCX documents."""

import base64
import json
import logging
import os
import uuid
from datetime import datetime, timezone

from fastapi import Depends, File, HTTPException, UploadFile
from werkzeug.utils import secure_filename

from backend.core.database import compute_history_expires_at, db
from backend.core.security import get_current_user
from backend.services.diagram_extractor_service import extract_diagrams_from_file
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

    try:
        extraction_result = extract_diagrams_from_file(path, filename)
        extracted = extraction_result.get("extracted", [])
    except Exception:
        logger.exception("Diagram extraction failed")
        raise HTTPException(status_code=500, detail="Internal server error")

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
            raw_b64 = data_uri.split(",", 1)[1] if "," in data_uri else data_uri
            img_bytes = base64.b64decode(raw_b64)
            img_filename = f"{idx}.png"
            img_path = os.path.join(img_dir, img_filename)
            with open(img_path, "wb") as handle:
                handle.write(img_bytes)
            image_urls.append(f"/generated/sub4/extracted/{batch_id}/{img_filename}")
    except Exception:
        logger.warning("Failed to save extracted diagram images to disk", exc_info=True)
        image_urls = []

    try:
        user_id = str(user.get("id") or user.get("_id") or "")
        expires_at = await compute_history_expires_at(user_id)
        document = {
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
        if expires_at is not None:
            document["expires_at"] = expires_at
        await db.sub4_generation_history.insert_one(document)
    except Exception:
        pass

    return {
        "success": True,
        "file": {"original_name": filename, "extracted_count": len(extracted)},
        "extracted": extracted,
    }
