"""Pipeline observability: stats, task timeline, checkpoints, audit log."""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException

from backend.core.security import get_current_user
from backend.services.slides import TaskTracker

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/pipeline-stats")
async def get_pipeline_stats(hours: int = 24, user: dict = Depends(get_current_user)):
    try:
        return await TaskTracker.get_stats(hours=hours)
    except Exception:
        logger.exception("Failed to get pipeline stats")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/task/{request_id}")
async def get_task_timeline(request_id: str, user: dict = Depends(get_current_user)):
    doc = await TaskTracker.get_task(request_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Task not found")
    return doc


@router.get("/checkpoints/{task_id}")
async def get_checkpoints(task_id: str, user: dict = Depends(get_current_user)):
    from backend.services.slides.infra.checkpoint_manager import CheckpointManager
    cps = await CheckpointManager.get_task_checkpoints(task_id)
    resumable = await CheckpointManager.get_resumable_step(task_id)
    return {"task_id": task_id, "checkpoints": cps, "last_successful_step": resumable}


@router.get("/checkpoint/{task_id}/{step}")
async def get_checkpoint_output(task_id: str, step: str, user: dict = Depends(get_current_user)):
    from backend.services.slides.infra.checkpoint_manager import CheckpointManager
    doc = await CheckpointManager.load(task_id=task_id, step=step)
    if not doc:
        raise HTTPException(status_code=404,
                            detail=f"No checkpoint for task={task_id} step={step}")
    return doc


@router.delete("/checkpoints/{task_id}")
async def delete_checkpoints(task_id: str, user: dict = Depends(get_current_user)):
    from backend.services.slides.infra.checkpoint_manager import CheckpointManager
    count = await CheckpointManager.delete_task(task_id)
    return {"deleted": count}


@router.get("/audit-log")
async def get_audit_log(
    hours: int = 24,
    action: Optional[str] = None,
    limit: int = 100,
    user: dict = Depends(get_current_user),
):
    from backend.services.slides.infra.audit_logger import AuditLogger
    logs = await AuditLogger.get_logs(user_id=None, action=action, hours=hours, limit=limit)
    return {"logs": logs, "count": len(logs)}
