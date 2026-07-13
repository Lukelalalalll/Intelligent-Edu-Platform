"""Shared router instance and helper utilities for admin routes."""
from __future__ import annotations

import os
import re
from datetime import datetime

from fastapi import APIRouter, HTTPException
from bson.objectid import ObjectId

from backend.config import Config
from backend.repositories._helpers import coerce_object_id
from backend.services.grading_service import load_courses, normalize_courses_data, save_courses

admin_router = APIRouter(prefix="/admin", tags=["Admin"])


# ── Course payload helpers (v1 JSON-based) ──

async def _load_courses_payload() -> dict:
    return normalize_courses_data(await load_courses())


async def _save_courses_payload(payload: dict) -> None:
    await save_courses(normalize_courses_data(payload))


def _find_course(courses: list[dict], course_id: str) -> dict | None:
    for course in courses:
        cid = str(course.get("courseId") or course.get("id") or "").strip()
        if cid == course_id:
            return course
    return None


def _find_assignment(course: dict, assignment_id: str) -> dict | None:
    for assignment in course.get("assignments", []):
        if str(assignment.get("id") or "").strip() == assignment_id:
            return assignment
    return None


# ── Generic helpers ──

def _is_object_id(value: str) -> bool:
    return coerce_object_id(value) is not None


def _parse_document_object_id(value: str) -> ObjectId:
    oid = coerce_object_id(value)
    if oid is None:
        raise HTTPException(status_code=400, detail="Invalid document id")
    return oid


def _serialize_mongo_value(value):
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, list):
        return [_serialize_mongo_value(item) for item in value]
    if isinstance(value, dict):
        return {k: _serialize_mongo_value(v) for k, v in value.items()}
    return value


def _validate_collection_name(name: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_\-]{1,64}", name or ""):
        raise HTTPException(status_code=400, detail="Invalid collection name")
    return name


# Collections that cannot be modified via the DB console (write-protect critical data)
DB_CONSOLE_READONLY_COLLECTIONS = {"users"}
# Collections that cannot be listed or accessed via console at all
DB_CONSOLE_BLOCKED_COLLECTIONS = {"system.profile", "system.version"}


def _check_write_access(collection_name: str) -> None:
    """Block write operations on protected collections via DB console."""
    if collection_name in DB_CONSOLE_READONLY_COLLECTIONS:
        raise HTTPException(
            status_code=403,
            detail=f"Collection '{collection_name}' is read-only via DB console. Use dedicated admin endpoints.",
        )


def _date_bucket(value, group_by: str) -> str:
    if isinstance(value, datetime):
        if group_by == "month":
            return value.strftime("%Y-%m")
        return value.strftime("%Y-%m-%d")
    if isinstance(value, str) and value:
        if group_by == "month":
            return value[:7]
        return value[:10]
    return "unknown"
