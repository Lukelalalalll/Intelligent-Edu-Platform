from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Sequence

from fastapi import HTTPException

from backend.core.utils import safe_object_id
from backend.repositories import history_repo

TOOL_COLLECTIONS: dict[str, str] = {
    "slides": "sub1_generation_history",
    "questions": "sub2_generation_history",
    "image_extractor": "sub3_generation_history",
    "diagram": "sub4_generation_history",
    "study_notes": "sub5_generation_history",
    "video": "video_generation_history",
}

TOOL_LABELS: dict[str, str] = {
    "slides": "PPT Generation",
    "questions": "Question Bank",
    "image_extractor": "Image Extraction",
    "diagram": "Diagram Generation",
    "study_notes": "Study Notes",
    "video": "Video Generation",
}


def get_collection_name(tool: str) -> str:
    collection_name = TOOL_COLLECTIONS.get(str(tool or "").strip())
    if not collection_name:
        raise HTTPException(status_code=400, detail=f"Unknown tool: {tool}")
    return collection_name


def build_history_filter(*, user_id: str | None = None, include_deleted: bool = False, search: str = "") -> dict[str, Any]:
    filt: dict[str, Any] = {}
    if user_id:
        filt["user_id"] = user_id
    if not include_deleted:
        filt["deleted_at"] = {"$exists": False}
    if search:
        filt["$or"] = [
            {"result_preview": {"$regex": search, "$options": "i"}},
            {"params.filename": {"$regex": search, "$options": "i"}},
            {"params.source_filename": {"$regex": search, "$options": "i"}},
            {"params.keywords": {"$regex": search, "$options": "i"}},
            {"source.file_name": {"$regex": search, "$options": "i"}},
            {"source.title": {"$regex": search, "$options": "i"}},
        ]
    return filt


def serialize_history_doc(doc: dict[str, Any], *, include_result: bool = False) -> dict[str, Any]:
    created = doc.get("created_at", "")
    params = doc.get("params", {}) or {}
    tool_key = doc.get("_tool_key") or next(
        (key for key, value in TOOL_COLLECTIONS.items() if value == doc.get("_collection_name")),
        "",
    )
    tool_value = doc.get("tool") or params.get("tool") or params.get("service_type") or tool_key
    payload = {
        "id": str(doc.get("_id")),
        "tool": tool_value,
        "tool_key": tool_key,
        "params": params,
        "preview": doc.get("result_preview", ""),
        "source": doc.get("source", {}),
        "created_at": created.isoformat() if hasattr(created, "isoformat") else str(created),
    }
    if doc.get("_collection_name"):
        payload["collection"] = doc["_collection_name"]
    if include_result:
        payload["result"] = doc.get("result_full", "")
    return payload


async def list_history(
    *,
    tools: Sequence[str],
    user_id: str | None = None,
    page: int = 1,
    page_size: int = 10,
    search: str = "",
    include_deleted: bool = False,
) -> tuple[list[dict[str, Any]], int]:
    if not tools:
        return [], 0

    filt = build_history_filter(user_id=user_id, include_deleted=include_deleted, search=search)
    projection = {"result_full": 0}
    skip = max(0, (page - 1) * page_size)

    if len(tools) == 1:
        tool = tools[0]
        collection_name = get_collection_name(tool)
        docs = await history_repo.find_many(
            collection_name,
            filt,
            projection=projection,
            skip=skip,
            limit=page_size,
            sort=[("created_at", -1)],
        )
        total = await history_repo.count(collection_name, filt)
        for doc in docs:
            doc.setdefault("_tool_key", tool)
            doc.setdefault("_collection_name", collection_name)
        return docs, total

    primary_tool = tools[0]
    primary_collection = get_collection_name(primary_tool)
    other_collections = [(get_collection_name(tool), tool) for tool in tools[1:]]
    items, total = await history_repo.aggregate_union(
        primary_collection,
        match_filter=filt,
        other_collections=other_collections,
        projection=projection,
        skip=skip,
        limit=page_size,
    )
    for doc in items:
        if doc.get("_collection_name") == primary_collection:
            doc.setdefault("_tool_key", primary_tool)
    return items, total


async def get_history_document(
    *,
    tools: Sequence[str],
    history_id: str,
    user_id: str | None = None,
    include_deleted: bool = False,
) -> dict[str, Any] | None:
    oid = history_repo.safe_object_id(history_id)
    if oid is None:
        raise HTTPException(status_code=400, detail="Invalid history ID format")

    for tool in tools:
        collection_name = get_collection_name(tool)
        filt: dict[str, Any] = {"_id": oid}
        if user_id:
            filt["user_id"] = user_id
        if not include_deleted:
            filt["deleted_at"] = {"$exists": False}
        doc = await history_repo.find_one(collection_name, filt)
        if doc:
            doc.setdefault("_tool_key", tool)
            doc.setdefault("_collection_name", collection_name)
            return doc
    return None


async def summarize_tools(*, user_id: str | None = None, include_deleted: bool = False) -> list[dict[str, Any]]:
    summary: list[dict[str, Any]] = []
    for tool, collection_name in TOOL_COLLECTIONS.items():
        count = await history_repo.count(
            collection_name,
            build_history_filter(user_id=user_id, include_deleted=include_deleted),
        )
        summary.append({"tool": tool, "label": TOOL_LABELS[tool], "count": count})
    return summary


async def soft_delete_history(*, tool: str, history_id: str, user_id: str) -> int:
    oid = history_repo.safe_object_id(history_id)
    if oid is None:
        raise HTTPException(status_code=400, detail="Invalid history ID")
    result = await history_repo.update_one(
        get_collection_name(tool),
        {"_id": oid, "user_id": user_id, "deleted_at": {"$exists": False}},
        {"$set": {"deleted_at": datetime.now(timezone.utc)}},
    )
    return int(result.modified_count or 0)


async def batch_soft_delete_history(*, tool: str, history_ids: Sequence[str], user_id: str) -> int:
    oids = [history_repo.safe_object_id(item) for item in history_ids]
    oids = [item for item in oids if item is not None]
    if not oids:
        raise HTTPException(status_code=400, detail="No valid IDs")
    result = await history_repo.update_many(
        get_collection_name(tool),
        {"_id": {"$in": oids}, "user_id": user_id, "deleted_at": {"$exists": False}},
        {"$set": {"deleted_at": datetime.now(timezone.utc)}},
    )
    return int(result.modified_count or 0)


async def hard_delete_history(*, tool: str, history_id: str) -> int:
    oid = history_repo.safe_object_id(history_id)
    if oid is None:
        raise HTTPException(status_code=400, detail="Invalid history ID")
    result = await history_repo.delete_one(get_collection_name(tool), {"_id": oid})
    return int(result.deleted_count or 0)


async def batch_hard_delete_history(*, tool: str, history_ids: Sequence[str]) -> int:
    oids = [history_repo.safe_object_id(item) for item in history_ids]
    oids = [item for item in oids if item is not None]
    if not oids:
        raise HTTPException(status_code=400, detail="No valid IDs")
    result = await history_repo.delete_many(get_collection_name(tool), {"_id": {"$in": oids}})
    return int(result.deleted_count or 0)


async def list_history_users() -> list[dict[str, Any]]:
    user_ids: set[str] = set()
    for collection_name in TOOL_COLLECTIONS.values():
        ids = await history_repo.distinct(collection_name, "user_id", {"deleted_at": {"$exists": False}})
        user_ids.update(str(item) for item in ids if item)

    if not user_ids:
        return []

    oids = [safe_object_id(user_id, label="user") for user_id in user_ids]
    oids = [item for item in oids if item is not None]
    users = await history_repo.find_many(
        "users",
        {"_id": {"$in": oids}},
        projection={"username": 1, "email": 1, "role": 1},
        limit=len(oids),
    )
    return [
        {
            "id": str(user.get("_id")),
            "username": user.get("username", ""),
            "email": user.get("email", ""),
            "role": user.get("role", ""),
        }
        for user in users
    ]


async def save_history_record(
    *,
    tool: str,
    user_id: str,
    params: dict[str, Any],
    result_preview: str,
    result_full: str | dict[str, Any] | list[Any],
    source: dict[str, Any] | None = None,
    expires_at: datetime | None = None,
    tool_name: str | None = None,
) -> None:
    document: dict[str, Any] = {
        "user_id": user_id,
        "params": params,
        "result_preview": result_preview,
        "result_full": (
            json.dumps(result_full, ensure_ascii=False)
            if isinstance(result_full, (dict, list))
            else str(result_full or "")
        ),
        "created_at": datetime.now(timezone.utc),
    }
    if tool_name:
        document["tool"] = tool_name
    if source:
        document["source"] = source
    if expires_at is not None:
        document["expires_at"] = expires_at
    await history_repo.insert_one(get_collection_name(tool), document)

