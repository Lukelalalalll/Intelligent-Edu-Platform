"""LLM telemetry + RAG telemetry endpoints."""
from __future__ import annotations

from fastapi import Depends, HTTPException, Query

from backend.core.security import get_admin_user
from backend.infrastructure import llm_telemetry, rag_telemetry
from fastapi import APIRouter
router = APIRouter()


# ── LLM Telemetry ──

@router.get("/telemetry/stats")
async def get_telemetry_stats(
    hours: int = Query(default=24, ge=1, le=720),
    provider_limit: int = Query(default=100, ge=1, le=500),
    admin: dict = Depends(get_admin_user),
):
    return await llm_telemetry.get_stats(hours=hours, provider_limit=provider_limit)


@router.get("/telemetry/errors")
async def get_telemetry_errors(
    limit: int = Query(default=20, ge=1, le=100),
    admin: dict = Depends(get_admin_user),
):
    errors = await llm_telemetry.get_recent_errors(limit=limit)
    return {"errors": errors}


@router.get("/telemetry/timeseries")
async def get_telemetry_timeseries(
    hours: int = Query(default=24, ge=1, le=720),
    bucket: int = Query(default=60, ge=5, le=1440),
    admin: dict = Depends(get_admin_user),
):
    data = await llm_telemetry.get_timeseries(hours=hours, bucket_minutes=bucket)
    return {"timeseries": data}


@router.get("/telemetry/breakdown")
async def get_telemetry_breakdown(
    hours: int = Query(default=24, ge=1, le=720),
    group_by: str = Query(default="provider"),
    limit: int = Query(default=200, ge=1, le=500),
    admin: dict = Depends(get_admin_user),
):
    data = await llm_telemetry.get_breakdown(hours=hours, group_by=group_by, limit=limit)
    return {"breakdown": data, "group_by": group_by}


@router.get("/telemetry/cost")
async def get_telemetry_cost(
    hours: int = Query(default=24, ge=1, le=720),
    provider_limit: int = Query(default=50, ge=1, le=500),
    admin: dict = Depends(get_admin_user),
):
    return await llm_telemetry.get_cost_summary(hours=hours, provider_limit=provider_limit)


# ── RAG Telemetry ──

@router.get("/rag-telemetry/stats")
async def rag_telemetry_stats(
    hours: int = Query(default=24, ge=1, le=720),
    admin: dict = Depends(get_admin_user),
):
    return await rag_telemetry.get_stats(hours)


@router.get("/rag-telemetry/course-breakdown")
async def rag_telemetry_course_breakdown(
    hours: int = Query(default=24, ge=1, le=720),
    limit: int = Query(default=200, ge=1, le=500),
    admin: dict = Depends(get_admin_user),
):
    return {"breakdown": await rag_telemetry.get_course_breakdown(hours, limit=limit)}


@router.get("/rag-telemetry/role-breakdown")
async def rag_telemetry_role_breakdown(
    hours: int = Query(default=24, ge=1, le=720),
    limit: int = Query(default=20, ge=1, le=100),
    admin: dict = Depends(get_admin_user),
):
    return {"breakdown": await rag_telemetry.get_role_breakdown(hours, limit=limit)}


@router.get("/rag-telemetry/alerts")
async def rag_telemetry_alerts(
    hours: int = Query(default=1, ge=1, le=24),
    admin: dict = Depends(get_admin_user),
):
    return {"alerts": await rag_telemetry.check_alerts(hours)}
