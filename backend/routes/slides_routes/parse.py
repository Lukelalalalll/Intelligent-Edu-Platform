from __future__ import annotations

import logging
import os
import shutil
import uuid
		
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
	
from backend.config import Config
from backend.core.security import get_current_user
from backend.schemas import CombineSchema
from backend.services.slides.infra.task_tracker import StepStatus, TaskTracker
from backend.services.slides.pipeline_service import combine_sections as _svc_combine_sections
from backend.services.slides.pipeline_service import get_parsed_data_with_cache as _get_parsed_data_with_cache

logger = logging.getLogger(__name__)
router = APIRouter()


def _build_stored_upload_name(filename: str) -> str:
    ext = os.path.splitext(filename)[1]
    return f"{uuid.uuid4().hex}{ext.lower()}"


@router.post("/parse-md")
async def parse_md(
    file: UploadFile = File(...),
    use_llm: bool = Form(False),
    header_llm_provider: str = Form("local_ollama"),
    user: dict = Depends(get_current_user),
    request: Request = None,
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No selected file")
	
    request_id = request.headers.get("X-Request-ID") if request else None
    tracker = TaskTracker(request_id=request_id, user_id=user.get("id", ""), task_type="parse")
    try:
        display_filename = os.path.basename(file.filename).strip()
        if not display_filename:
            raise HTTPException(status_code=400, detail="Invalid filename")

        os.makedirs(Config.SUB1_UPLOAD_FOLDER, exist_ok=True)
        os.makedirs(Config.SUB1_MD_FOLDER, exist_ok=True)
        stored_filename = _build_stored_upload_name(display_filename)
        upload_path = os.path.join(Config.SUB1_UPLOAD_FOLDER, stored_filename)
        with open(upload_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        if display_filename.lower().endswith(".pdf"):
            md_filename = stored_filename.rsplit(".", 1)[0] + ".md"
            target_md_path = os.path.join(Config.SUB1_MD_FOLDER, md_filename)
            with tracker.step("parse", filename=display_filename, stored_filename=stored_filename, use_llm=use_llm):
                from backend.services.slides.parsing.pdf2md import convert_pdf_to_md

                convert_pdf_to_md(upload_path, target_md_path)
            parsing_path = target_md_path
        else:
            parsing_path = upload_path

        step_name = "parse" if not display_filename.lower().endswith(".pdf") else "header_extract"
        with tracker.step(step_name, filename=display_filename, stored_filename=stored_filename):
            result = _get_parsed_data_with_cache(parsing_path, use_llm, header_llm_provider)

        tracker.finish(StepStatus.SUCCESS)
        tracker.result_metadata["headers_count"] = len(result.get("headers", []))
        tracker.result_metadata["source_filename"] = stored_filename
        tracker.result_metadata["source_display_name"] = display_filename
        await tracker.save()
        return {
            "status": "success",
            "filename": stored_filename,
            "display_filename": display_filename,
            "headers": result["headers"],
            "tables": result["tables"],
            "request_id": tracker.request_id,
        }
    except Exception:
        tracker.finish(StepStatus.FAILED)
        logger.exception("[%s] Parse failed", tracker.request_id)
        try:
            await tracker.save()
        except Exception:
            logger.exception("[%s] Failed to save parse failure metadata", tracker.request_id)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/combine")
def combine_sections(req: CombineSchema, user: dict = Depends(get_current_user)):
    try:
        new_filename = _svc_combine_sections(req.filename, req.selected_indices, req.use_llm, req.header_llm_provider)
        return {"filename": new_filename}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Combine sections failed")
        raise HTTPException(status_code=500, detail="Internal server error")
