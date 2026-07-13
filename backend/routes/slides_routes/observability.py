"""Pipeline observability: stats, task timeline, checkpoints, audit log."""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException

from backend.core.security import get_current_user
from backend.services.slides import TaskTracker

logger = logging.getLogger(__name__)
router = APIRouter()


def _user_id(user: dict) -> str:
    return str(user.get("id") or user.get("_id") or "").strip()


def _is_admin(user: dict) -> bool:
    return str(user.get("role") or "").strip().lower() == "admin"


def _checkpoint_manager_cls():
    from backend.services.slides.infra.checkpoint_manager import CheckpointManager

    return CheckpointManager


def _audit_logger_cls():
    from backend.services.slides.infra.audit_logger import AuditLogger

    return AuditLogger


@router.get("/pipeline-stats")
async def get_pipeline_stats(hours: int = 24, user: dict = Depends(get_current_user)):
    try:
        stats_user_id = None if _is_admin(user) else _user_id(user)
        return await TaskTracker.get_stats(hours=hours, user_id=stats_user_id)
    except Exception:
        logger.exception("Failed to get pipeline stats")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/task/{request_id}")
async def get_task_timeline(request_id: str, user: dict = Depends(get_current_user)):
    doc = await TaskTracker.get_task(
        request_id,
        user_id=None if _is_admin(user) else _user_id(user),
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Task not found")
    return doc


@router.get("/checkpoints/{task_id}")
async def get_checkpoints(task_id: str, user: dict = Depends(get_current_user)):
    checkpoint_manager = _checkpoint_manager_cls()
    checkpoint_user_id = None if _is_admin(user) else _user_id(user)
    cps = await checkpoint_manager.get_task_checkpoints(task_id, user_id=checkpoint_user_id)
    if not cps and checkpoint_user_id is not None:
        raise HTTPException(status_code=404, detail="Task not found")
    resumable = await checkpoint_manager.get_resumable_step(task_id, user_id=checkpoint_user_id)
    return {"task_id": task_id, "checkpoints": cps, "last_successful_step": resumable}


@router.get("/checkpoint/{task_id}/{step}")
async def get_checkpoint_output(task_id: str, step: str, user: dict = Depends(get_current_user)):
    checkpoint_manager = _checkpoint_manager_cls()
    doc = await checkpoint_manager.load(
        task_id=task_id,
        step=step,
        user_id=None if _is_admin(user) else _user_id(user),
    )
    if not doc:
        raise HTTPException(status_code=404,
                            detail=f"No checkpoint for task={task_id} step={step}")
    return doc


@router.delete("/checkpoints/{task_id}")
async def delete_checkpoints(task_id: str, user: dict = Depends(get_current_user)):
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Permission denied")
    checkpoint_manager = _checkpoint_manager_cls()
    count = await checkpoint_manager.delete_task(task_id)
    return {"deleted": count}


@router.get("/audit-log")
async def get_audit_log(
    hours: int = 24,
    action: Optional[str] = None,
    limit: int = 100,
    user: dict = Depends(get_current_user),
):
    audit_logger = _audit_logger_cls()
    logs = await audit_logger.get_logs(
        user_id=None if _is_admin(user) else _user_id(user),
        action=action,
        hours=hours,
        limit=limit,
    )
    return {"logs": logs, "count": len(logs)}
