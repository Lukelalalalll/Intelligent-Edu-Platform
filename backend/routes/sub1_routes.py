import os
import shutil
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from fastapi.responses import JSONResponse
from werkzeug.utils import secure_filename
from backend.services.sub1_service import Sub1Service
from backend.config import Config
from backend.core.security import get_current_user
from backend.schemas import CombineSchema, SaveHighlightsSchema

sub1_router = APIRouter(prefix="/api/sub1", tags=["Sub1"])

@sub1_router.post("/parse-md")
def parse_md(
        file: UploadFile = File(...),
        use_llm: bool = Form(False),
        user: dict = Depends(get_current_user)
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No selected file")

    try:
        filename = secure_filename(file.filename)
        upload_path = os.path.join(Config.SUB1_UPLOAD_FOLDER, filename)

        with open(upload_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        if filename.lower().endswith('.pdf'):
            md_filename = filename.rsplit('.', 1)[0] + ".md"
            target_md_path = os.path.join(Config.SUB1_MD_FOLDER, md_filename)

            from backend.utils.sub1.pdf2md import convert_pdf_to_md
            convert_pdf_to_md(upload_path, target_md_path)
            parsing_path = target_md_path
        else:
            parsing_path = upload_path

        result = Sub1Service.parse_md(parsing_path, use_llm)

        return {
            'status': 'success',
            'filename': filename,
            'headers': result['headers'],
            'tables': result['tables']
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@sub1_router.post("/combine")
def combine_sections(req: CombineSchema, user: dict = Depends(get_current_user)):
    try:
        combined_filename = Sub1Service.combine_sections(req.filename, req.selected_indices)
        return {"filename": combined_filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@sub1_router.post("/save_highlights")
def save_highlights(req: SaveHighlightsSchema, user: dict = Depends(get_current_user)):
    try:
        saved_file = Sub1Service.save_highlights(req.filename, req.highlights)
        return {"message": "Success", "file": saved_file}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@sub1_router.get("/download/{filename}")
def download_combined(filename: str, user: dict = Depends(get_current_user)):
    from fastapi.responses import FileResponse
    for folder in [Config.SUB1_MD_FOLDER, Config.MARKDOWN_FOLDER]:
        path = os.path.join(folder, filename)
        if os.path.exists(path):
            return FileResponse(path)
    raise HTTPException(status_code=404, detail="File not found")