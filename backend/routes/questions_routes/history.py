"""Generation history CRUD endpoints."""
from __future__ import annotations

import os
import uuid

from fastapi import Depends, Request, Query
from fastapi.responses import JSONResponse

from backend.config import Config
from backend.core.database import db
from backend.core.security import get_current_user
from .router import questions_router, _set_task


@questions_router.get("/generation_history")
async def get_generation_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    user: dict = Depends(get_current_user),
):
    """Return paginated generation history for the current user."""
    try:
        skip = (page - 1) * page_size
        cursor = db.sub2_generation_history.find(
            {'user_id': user.get('id', '')},
            {'result_full': 0},
        ).sort('created_at', -1).skip(skip).limit(page_size)

        items = []
        async for doc in cursor:
            items.append({
                'id': str(doc['_id']),
                'params': doc.get('params', {}),
                'preview': doc.get('result_preview', ''),
                'created_at': doc.get('created_at', '').isoformat() if hasattr(doc.get('created_at', ''), 'isoformat') else str(doc.get('created_at', '')),
            })

        total = await db.sub2_generation_history.count_documents({'user_id': user.get('id', '')})
        return {'success': True, 'items': items, 'total': total, 'page': page, 'page_size': page_size}
    except Exception as e:
        return JSONResponse(content={'success': False, 'error': str(e)}, status_code=500)


@questions_router.get("/generation_history/{history_id}")
async def get_generation_detail(history_id: str, user: dict = Depends(get_current_user)):
    """Return full generation result for replay/review."""
    try:
        from bson import ObjectId
        from bson.errors import InvalidId
        try:
            oid = ObjectId(history_id)
        except (InvalidId, Exception):
            return JSONResponse(content={'success': False, 'error': 'Invalid history ID format'}, status_code=400)
        doc = await db.sub2_generation_history.find_one({
            '_id': oid,
            'user_id': user.get('id', ''),
        })
        if not doc:
            return JSONResponse(content={'success': False, 'error': 'Record not found'}, status_code=404)
        return {
            'success': True,
            'id': str(doc.get('_id')),
            'params': doc.get('params', {}),
            'result': doc.get('result_full', ''),
            'created_at': doc.get('created_at', '').isoformat() if hasattr(doc.get('created_at', ''), 'isoformat') else str(doc.get('created_at', '')),
        }
    except Exception as e:
        return JSONResponse(content={'success': False, 'error': str(e)}, status_code=500)


@questions_router.post("/generation_history/{history_id}/replay")
async def replay_generation_history(history_id: str, request: Request, user: dict = Depends(get_current_user)):
    """Rebuild a fresh sub2 task from a history record so replay can restore the uploaded source file context."""
    try:
        from bson import ObjectId
        from bson.errors import InvalidId

        try:
            oid = ObjectId(history_id)
        except (InvalidId, Exception):
            return JSONResponse(content={'success': False, 'error': 'Invalid history ID format'}, status_code=400)

        doc = await db.sub2_generation_history.find_one({'_id': oid, 'user_id': user.get('id', '')})
        if not doc:
            return JSONResponse(content={'success': False, 'error': 'Record not found'}, status_code=404)

        source = doc.get('source', {}) or {}
        source_path = str(source.get('file_path', '') or '')
        if not source_path:
            return JSONResponse(content={'success': False, 'error': 'This history record has no replayable source file.'}, status_code=400)

        source_abs = os.path.abspath(source_path)
        upload_root_abs = os.path.abspath(Config.UPLOAD_FOLDER_SUB2)
        if not source_abs.startswith(upload_root_abs):
            return JSONResponse(content={'success': False, 'error': 'Replay source path is invalid.'}, status_code=400)
        if not os.path.exists(source_abs):
            return JSONResponse(content={'success': False, 'error': 'Source file no longer exists on server.'}, status_code=404)

        file_type = str(source.get('file_type', '') or '').strip() or ('pdf' if source_abs.lower().endswith('.pdf') else 'image')
        total_pages = int(source.get('total_pages', 0) or 0)
        if file_type == 'pdf' and total_pages <= 0:
            try:
                import PyPDF2
                with open(source_abs, 'rb') as f:
                    reader = PyPDF2.PdfReader(f)
                    total_pages = len(reader.pages)
            except Exception:
                total_pages = 0

        new_task_id = uuid.uuid4().hex[:12]
        replay_task = {
            'uploaded_file': source_abs,
            'uploaded_filename': str(source.get('file_name') or os.path.basename(source_abs)),
            'file_type': file_type,
            'total_pages': total_pages,
        }
        _set_task(request, new_task_id, replay_task)

        params = doc.get('params', {}) or {}
        return {
            'success': True,
            'task_id': new_task_id,
            'filename': replay_task['uploaded_filename'],
            'file_type': file_type,
            'total_pages': total_pages,
            'page_numbers': params.get('page_numbers', []),
            'source_type': params.get('source_type', 'pdf'),
        }
    except Exception as e:
        return JSONResponse(content={'success': False, 'error': str(e)}, status_code=500)
