from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from bson import ObjectId

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.core.database import close_database_client, db
from backend.services.admin.admin_query_service import build_admin_collection_search_filter

HISTORY_COLLECTIONS = [
    "sub1_generation_history",
    "sub2_generation_history",
    "sub3_generation_history",
    "sub4_generation_history",
    "sub5_generation_history",
    "video_generation_history",
]

BASELINE_COLLECTIONS = [
    "chat_rooms",
    "chat_messages",
    "ai_chat_sessions",
    "file_assets",
    "indexing_jobs",
    "background_jobs",
    "llm_telemetry",
    "rag_telemetry",
    "users",
    *HISTORY_COLLECTIONS,
]

EXPECTED_INDEXES: dict[str, list[str]] = {
    "chat.rooms_for_member": ["members_1_createdAt_-1"],
    "chat.group_rooms_by_course": ["courseId_1_type_1"],
    "chat.messages_by_room": ["roomId_1_sentAt_-1"],
    "ai_sessions.list_for_user": ["userId_1_updatedAt_-1"],
    "file_assets.ai_personal_page": ["user_id_1_scope_1_status_1_created_at_-1"],
    "file_assets.chat_room_page": ["room_id_1_scope_1_status_1_created_at_-1"],
    "file_assets.knowledge_source_by_name": ["file_type_1_course_id_1_filename_1_status_1"],
    "indexing_jobs.by_course_and_filename": ["course_id_1_filename_1_status_1_created_at_-1"],
    "background_jobs.claim_ready": ["status_1_available_at_1_created_at_1"],
    "background_jobs.claim_ready_by_type": ["job_type_1_status_1_available_at_1_created_at_1"],
    "admin_db.users_list": ["role_1_username_1"],
    "llm_telemetry.stats_by_provider": ["timestamp_-1_provider_1"],
    "llm_telemetry.recent_errors": ["success_1_timestamp_-1"],
    "llm_telemetry.breakdown_by_api_type": ["api_type_1_timestamp_-1"],
    "rag_telemetry.stats": ["timestamp_1"],
    "rag_telemetry.course_breakdown": ["timestamp_-1_course_ids_1"],
    "rag_telemetry.role_breakdown": ["timestamp_-1_role_1"],
}

INDEX_SUGGESTIONS: dict[str, str] = {
    "chat.rooms_for_member": "Ensure chat_rooms has {members: 1, createdAt: -1}.",
    "chat.group_rooms_by_course": "Ensure chat_rooms has the partial unique {courseId: 1, type: 1} index.",
    "chat.messages_by_room": "Ensure chat_messages has {roomId: 1, sentAt: -1}.",
    "ai_sessions.list_for_user": "Ensure ai_chat_sessions has {userId: 1, updatedAt: -1}.",
    "file_assets.admin_default_page": "Consider a low-cardinality-safe {created_at: -1} index if the default Admin File Center list stays unfiltered at scale.",
    "file_assets.ai_personal_page": "Ensure file_assets has {user_id: 1, scope: 1, status: 1, created_at: -1}.",
    "file_assets.chat_room_page": "Ensure file_assets has {room_id: 1, scope: 1, status: 1, created_at: -1}.",
    "file_assets.knowledge_source_by_name": "Ensure file_assets has {file_type: 1, course_id: 1, filename: 1, status: 1}.",
    "indexing_jobs.by_course_and_filename": "Ensure indexing_jobs has {course_id: 1, filename: 1, status: 1, created_at: -1}.",
    "background_jobs.claim_ready": "Ensure background_jobs has {status: 1, available_at: 1, created_at: 1}.",
    "background_jobs.claim_ready_by_type": "Ensure background_jobs has {job_type: 1, status: 1, available_at: 1, created_at: 1}.",
    "admin_db.users_list": "Ensure users has {role: 1, username: 1} for the stable admin console sort.",
    "admin_db.users_search": "Unanchored case-insensitive regex search can scan; consider normalized prefix fields or Atlas Search before changing search semantics.",
    "llm_telemetry.stats_by_provider": "Ensure llm_telemetry has {timestamp: -1, provider: 1}.",
    "llm_telemetry.recent_errors": "Ensure llm_telemetry has {success: 1, timestamp: -1}.",
    "llm_telemetry.breakdown_by_api_type": "Ensure llm_telemetry has {api_type: 1, timestamp: -1}.",
    "rag_telemetry.stats": "Ensure rag_telemetry has a timestamp TTL/index for windowed stats.",
    "rag_telemetry.course_breakdown": "Ensure rag_telemetry has {timestamp: -1, course_ids: 1}.",
    "rag_telemetry.role_breakdown": "Ensure rag_telemetry has {timestamp: -1, role: 1}.",
}


def _clean_arg(value: str | None) -> str:
    raw = str(value or "").strip()
    if raw.startswith("<") and raw.endswith(">"):
        return ""
    return raw


def _jsonable(value: Any) -> Any:
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, list):
        return [_jsonable(item) for item in value]
    if isinstance(value, tuple):
        return [_jsonable(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _jsonable(item) for key, item in value.items()}
    return value


def _coerce_object_id(value: str | ObjectId | None) -> ObjectId | str | None:
    if isinstance(value, ObjectId):
        return value
    raw = _clean_arg(str(value or ""))
    if not raw:
        return None
    try:
        return ObjectId(raw)
    except Exception:
        return raw


def _collect_index_names(plan: Any) -> list[str]:
    names: list[str] = []
    if isinstance(plan, dict):
        index_name = plan.get("indexName")
        if index_name:
            names.append(str(index_name))
        for value in plan.values():
            names.extend(_collect_index_names(value))
    elif isinstance(plan, list):
        for value in plan:
            names.extend(_collect_index_names(value))
    return names


def _collect_stages(plan: Any) -> list[str]:
    stages: list[str] = []
    if isinstance(plan, dict):
        stage_name = plan.get("stage")
        if stage_name:
            stages.append(str(stage_name))
        for value in plan.values():
            stages.extend(_collect_stages(value))
    elif isinstance(plan, list):
        for value in plan:
            stages.extend(_collect_stages(value))
    return stages


def _iter_cursor_explains(explain: dict[str, Any]) -> list[dict[str, Any]]:
    cursors: list[dict[str, Any]] = []
    if explain.get("queryPlanner") or explain.get("executionStats"):
        cursors.append(explain)

    def walk(value: Any) -> None:
        if isinstance(value, dict):
            cursor = value.get("$cursor")
            if isinstance(cursor, dict):
                cursors.append(cursor)
            for item in value.values():
                walk(item)
        elif isinstance(value, list):
            for item in value:
                walk(item)

    walk(explain.get("stages", []))
    return cursors


def _extract_explain_summary(explain: dict[str, Any]) -> dict[str, Any]:
    cursor_explains = _iter_cursor_explains(explain)
    stats_docs = [cursor.get("executionStats", {}) or {} for cursor in cursor_explains]
    planner_docs = [cursor.get("queryPlanner", {}) or {} for cursor in cursor_explains]
    winning_plans = [planner.get("winningPlan", {}) or {} for planner in planner_docs]

    stages: list[str] = []
    winning_indexes: list[str] = []
    for plan in winning_plans:
        stages.extend(_collect_stages(plan))
        winning_indexes.extend(_collect_index_names(plan))

    if not stages:
        stages.extend(_collect_stages(explain))
    if not winning_indexes:
        winning_indexes.extend(_collect_index_names(explain))

    totals = {
        "nReturned": sum(int(stats.get("nReturned") or 0) for stats in stats_docs),
        "totalKeysExamined": sum(int(stats.get("totalKeysExamined") or 0) for stats in stats_docs),
        "totalDocsExamined": sum(int(stats.get("totalDocsExamined") or 0) for stats in stats_docs),
        "executionTimeMillis": sum(int(stats.get("executionTimeMillis") or 0) for stats in stats_docs),
    }
    if not stats_docs:
        totals = {
            "nReturned": None,
            "totalKeysExamined": None,
            "totalDocsExamined": None,
            "executionTimeMillis": None,
        }

    return {
        **totals,
        "winningIndexes": sorted(set(winning_indexes)),
        "winningPlanStages": sorted(set(stages)),
        "usesCollectionScan": "COLLSCAN" in set(stages),
        "hasBlockingSort": "SORT" in set(stages),
    }


def _build_recommendations(
    *,
    name: str,
    execution: dict[str, Any],
    expected_indexes: list[str] | None = None,
    high_docs_floor: int = 1000,
    high_docs_ratio: int = 20,
) -> list[str]:
    recommendations: list[str] = []
    expected = expected_indexes or []
    winning_indexes = set(execution.get("winningIndexes") or [])
    docs_examined = execution.get("totalDocsExamined")
    n_returned = execution.get("nReturned")

    if execution.get("usesCollectionScan"):
        detail = INDEX_SUGGESTIONS.get(name) or "Add an index matching the filter and sort shape."
        recommendations.append(f"COLLSCAN detected. {detail}")

    if execution.get("hasBlockingSort"):
        detail = INDEX_SUGGESTIONS.get(name) or "Align the index key order with equality filters followed by sort fields."
        recommendations.append(f"Blocking SORT detected. {detail}")

    if isinstance(docs_examined, int) and docs_examined >= high_docs_floor:
        denominator = max(1, int(n_returned or 0))
        ratio = docs_examined / denominator
        if ratio >= high_docs_ratio:
            recommendations.append(
                f"High scan ratio: examined {docs_examined} docs for {n_returned or 0} returned "
                f"({ratio:.1f}x). Re-check selectivity and index prefix order."
            )

    if expected and not winning_indexes.intersection(expected):
        detail = INDEX_SUGGESTIONS.get(name) or f"Expected one of {expected}."
        recommendations.append(f"Expected index not observed in winning plan. {detail}")

    if name == "admin_db.users_search":
        regex_note = INDEX_SUGGESTIONS["admin_db.users_search"]
        if regex_note not in recommendations:
            recommendations.append(regex_note)

    return recommendations


async def _first_doc(
    collection_name: str,
    filt: dict[str, Any],
    projection: dict[str, Any],
    *,
    sort: list[tuple[str, int]] | None = None,
) -> dict[str, Any] | None:
    cursor = db[collection_name].find(filt, projection)
    if sort:
        cursor = cursor.sort(sort)
    docs = await cursor.limit(1).to_list(length=1)
    return docs[0] if docs else None


def _first_text(*values: Any) -> str:
    for value in values:
        raw = str(value or "").strip()
        if raw:
            return raw
    return ""


async def _sample_history_filename() -> str:
    filename_filter = {
        "$or": [
            {"params.filename": {"$type": "string", "$gt": ""}},
            {"params.source_filename": {"$type": "string", "$gt": ""}},
            {"source.file_name": {"$type": "string", "$gt": ""}},
            {"source.source_filename": {"$type": "string", "$gt": ""}},
            {"source.source_display_name": {"$type": "string", "$gt": ""}},
        ]
    }
    projection = {
        "params.filename": 1,
        "params.source_filename": 1,
        "source.file_name": 1,
        "source.source_filename": 1,
        "source.source_display_name": 1,
    }
    for collection_name in HISTORY_COLLECTIONS:
        doc = await _first_doc(collection_name, filename_filter, projection, sort=[("created_at", -1)])
        if not doc:
            continue
        params = doc.get("params") or {}
        source = doc.get("source") or {}
        filename = _first_text(
            params.get("filename"),
            params.get("source_filename"),
            source.get("file_name"),
            source.get("source_filename"),
            source.get("source_display_name"),
        )
        if filename:
            return filename
    return ""


async def sample_query_values(args: argparse.Namespace) -> dict[str, Any]:
    samples: dict[str, Any] = {}

    override_user_id = _clean_arg(args.user_id)
    override_room_id = _clean_arg(args.room_id)
    override_course_id = _clean_arg(args.course_id)
    override_filename = _clean_arg(args.filename)

    if override_user_id:
        samples["chat_user_id"] = override_user_id
        samples["file_asset_user_id"] = override_user_id
        samples["ai_session_user_id"] = _coerce_object_id(override_user_id)
    if override_room_id:
        samples["chat_room_id"] = override_room_id
        samples["file_asset_room_id"] = override_room_id
    if override_course_id:
        samples["chat_course_id"] = override_course_id
        samples["file_asset_course_id"] = override_course_id
        samples["indexing_course_id"] = override_course_id
    if override_filename:
        samples["file_asset_filename"] = override_filename
        samples["indexing_filename"] = override_filename
        samples["history_filename"] = override_filename

    room_doc = await _first_doc(
        "chat_rooms",
        {"members": {"$exists": True, "$ne": []}},
        {"_id": 1, "members": 1, "courseId": 1, "type": 1, "createdAt": 1},
        sort=[("createdAt", -1)],
    )
    if room_doc:
        samples.setdefault("chat_room_id", str(room_doc.get("_id")))
        members = room_doc.get("members") if isinstance(room_doc.get("members"), list) else []
        member = next((str(item) for item in members if str(item or "").strip()), "")
        if member:
            samples.setdefault("chat_user_id", member)
        if room_doc.get("courseId"):
            samples.setdefault("chat_course_id", str(room_doc.get("courseId")))

    group_room_doc = await _first_doc(
        "chat_rooms",
        {"courseId": {"$exists": True, "$ne": ""}, "type": "group"},
        {"_id": 1, "courseId": 1},
        sort=[("createdAt", -1)],
    )
    if group_room_doc and group_room_doc.get("courseId"):
        samples.setdefault("chat_course_id", str(group_room_doc.get("courseId")))

    message_doc = await _first_doc(
        "chat_messages",
        {"roomId": {"$exists": True, "$ne": ""}},
        {"roomId": 1},
        sort=[("sentAt", -1)],
    )
    if message_doc and message_doc.get("roomId"):
        samples.setdefault("chat_room_id", str(message_doc.get("roomId")))

    ai_session_doc = await _first_doc(
        "ai_chat_sessions",
        {"userId": {"$exists": True}},
        {"userId": 1},
        sort=[("updatedAt", -1)],
    )
    if ai_session_doc and ai_session_doc.get("userId") is not None:
        samples.setdefault("ai_session_user_id", ai_session_doc.get("userId"))

    personal_asset_doc = await _first_doc(
        "file_assets",
        {"scope": "ai_personal", "user_id": {"$exists": True, "$ne": ""}, "status": {"$ne": "hard_deleted"}},
        {"user_id": 1},
        sort=[("created_at", -1)],
    )
    if personal_asset_doc and personal_asset_doc.get("user_id"):
        samples.setdefault("file_asset_user_id", str(personal_asset_doc.get("user_id")))

    room_asset_doc = await _first_doc(
        "file_assets",
        {"scope": "chat_group", "room_id": {"$exists": True, "$ne": ""}, "status": {"$ne": "hard_deleted"}},
        {"room_id": 1},
        sort=[("created_at", -1)],
    )
    if room_asset_doc and room_asset_doc.get("room_id"):
        samples.setdefault("file_asset_room_id", str(room_asset_doc.get("room_id")))

    knowledge_asset_doc = await _first_doc(
        "file_assets",
        {
            "file_type": "knowledge_source",
            "course_id": {"$exists": True, "$ne": ""},
            "filename": {"$exists": True, "$ne": ""},
            "status": {"$ne": "hard_deleted"},
        },
        {"course_id": 1, "filename": 1},
        sort=[("created_at", -1)],
    )
    if knowledge_asset_doc:
        if knowledge_asset_doc.get("course_id"):
            samples.setdefault("file_asset_course_id", str(knowledge_asset_doc.get("course_id")))
        if knowledge_asset_doc.get("filename"):
            samples.setdefault("file_asset_filename", str(knowledge_asset_doc.get("filename")))

    indexing_doc = await _first_doc(
        "indexing_jobs",
        {
            "course_id": {"$exists": True, "$ne": ""},
            "filename": {"$exists": True, "$ne": ""},
            "status": {"$ne": "hard_deleted"},
        },
        {"course_id": 1, "filename": 1},
        sort=[("created_at", -1)],
    )
    if indexing_doc:
        if indexing_doc.get("course_id"):
            samples.setdefault("indexing_course_id", str(indexing_doc.get("course_id")))
            samples.setdefault("file_asset_course_id", str(indexing_doc.get("course_id")))
        if indexing_doc.get("filename"):
            samples.setdefault("indexing_filename", str(indexing_doc.get("filename")))
            samples.setdefault("file_asset_filename", str(indexing_doc.get("filename")))

    user_doc = await _first_doc(
        "users",
        {"username": {"$exists": True, "$ne": ""}},
        {"username": 1},
        sort=[("role", 1), ("username", 1)],
    )
    if user_doc and user_doc.get("username"):
        samples.setdefault("admin_username", str(user_doc.get("username")))

    history_filename = samples.get("history_filename") or await _sample_history_filename()
    if history_filename:
        samples.setdefault("history_filename", history_filename)
        samples.setdefault("file_asset_filename", history_filename)
        samples.setdefault("indexing_filename", history_filename)

    return samples


async def _collection_summary(collection_name: str) -> dict[str, Any]:
    collection = db[collection_name]
    indexes: list[dict[str, Any]] = []
    try:
        raw_indexes = await collection.index_information()
        for name, spec in sorted(raw_indexes.items()):
            indexes.append(
                {
                    "name": name,
                    "keys": _jsonable(spec.get("key", [])),
                    "unique": bool(spec.get("unique", False)),
                    "sparse": bool(spec.get("sparse", False)),
                    "expireAfterSeconds": spec.get("expireAfterSeconds"),
                    "partialFilterExpression": _jsonable(spec.get("partialFilterExpression")),
                }
            )
    except Exception as exc:
        indexes.append({"error": str(exc)})

    stats: dict[str, Any] = {}
    try:
        stats = await db.command("collStats", collection_name)
    except Exception as exc:
        stats = {"error": str(exc)}

    count = stats.get("count")
    if count is None:
        try:
            count = await collection.estimated_document_count()
        except Exception:
            count = None

    return {
        "collection": collection_name,
        "count": count,
        "size": stats.get("size"),
        "storageSize": stats.get("storageSize"),
        "totalIndexSize": stats.get("totalIndexSize"),
        "indexes": indexes,
        "statsError": stats.get("error"),
    }


def _missing_samples(samples: dict[str, Any], required: list[str]) -> list[str]:
    missing: list[str] = []
    for key in required:
        value = samples.get(key)
        if value is None or value == "" or value == []:
            missing.append(key)
    return missing


def _skip_query(spec: dict[str, Any], missing: list[str]) -> dict[str, Any]:
    return {
        "name": spec["name"],
        "collection": spec["collection"],
        "operation": {"type": spec["operation"]},
        "execution": None,
        "recommendations": [],
        "skippedReason": f"Missing sample value(s): {', '.join(missing)}",
    }


async def _explain_find(
    *,
    name: str,
    collection: str,
    filt: dict[str, Any],
    sort: list[tuple[str, int]] | None = None,
    projection: dict[str, int] | None = None,
    skip: int = 0,
    limit: int = 50,
    high_docs_floor: int = 1000,
    high_docs_ratio: int = 20,
) -> dict[str, Any]:
    command: dict[str, Any] = {
        "find": collection,
        "filter": filt,
        "limit": int(limit),
    }
    if skip:
        command["skip"] = int(skip)
    if sort:
        command["sort"] = dict(sort)
    if projection:
        command["projection"] = projection

    explain = await db.command("explain", command, verbosity="executionStats")
    execution = _extract_explain_summary(explain)
    return {
        "name": name,
        "collection": collection,
        "operation": {
            "type": "find",
            "filter": _jsonable(filt),
            "sort": _jsonable(sort or []),
            "projection": _jsonable(projection or {}),
            "skip": skip,
            "limit": limit,
        },
        "execution": execution,
        "recommendations": _build_recommendations(
            name=name,
            execution=execution,
            expected_indexes=EXPECTED_INDEXES.get(name, []),
            high_docs_floor=high_docs_floor,
            high_docs_ratio=high_docs_ratio,
        ),
        "skippedReason": None,
    }


async def _explain_aggregate(
    *,
    name: str,
    collection: str,
    pipeline: list[dict[str, Any]],
    high_docs_floor: int = 1000,
    high_docs_ratio: int = 20,
) -> dict[str, Any]:
    command = {
        "aggregate": collection,
        "pipeline": pipeline,
        "cursor": {},
    }
    explain = await db.command("explain", command, verbosity="executionStats")
    execution = _extract_explain_summary(explain)
    return {
        "name": name,
        "collection": collection,
        "operation": {
            "type": "aggregate",
            "pipeline": _jsonable(pipeline),
        },
        "execution": execution,
        "recommendations": _build_recommendations(
            name=name,
            execution=execution,
            expected_indexes=EXPECTED_INDEXES.get(name, []),
            high_docs_floor=high_docs_floor,
            high_docs_ratio=high_docs_ratio,
        ),
        "skippedReason": None,
    }


def _build_query_specs(samples: dict[str, Any], args: argparse.Namespace) -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=args.hours)
    ready_filter = {"$lte": now}
    limit = int(args.limit)

    specs: list[dict[str, Any]] = [
        {
            "name": "chat.rooms_for_member",
            "collection": "chat_rooms",
            "operation": "find",
            "requires": ["chat_user_id"],
            "kwargs": {
                "filt": {"members": samples.get("chat_user_id")},
                "sort": [("createdAt", -1)],
                "projection": {"_id": 1, "type": 1, "createdAt": 1},
                "limit": limit,
            },
        },
        {
            "name": "chat.group_rooms_by_course",
            "collection": "chat_rooms",
            "operation": "find",
            "requires": ["chat_course_id"],
            "kwargs": {
                "filt": {"courseId": {"$in": [samples.get("chat_course_id")]}, "type": "group"},
                "projection": {"_id": 1, "courseId": 1},
                "limit": limit,
            },
        },
        {
            "name": "chat.messages_by_room",
            "collection": "chat_messages",
            "operation": "find",
            "requires": ["chat_room_id"],
            "kwargs": {
                "filt": {"roomId": samples.get("chat_room_id")},
                "sort": [("sentAt", -1)],
                "projection": {"_id": 1, "roomId": 1, "sentAt": 1},
                "limit": limit,
            },
        },
        {
            "name": "ai_sessions.list_for_user",
            "collection": "ai_chat_sessions",
            "operation": "find",
            "requires": ["ai_session_user_id"],
            "kwargs": {
                "filt": {"userId": samples.get("ai_session_user_id")},
                "sort": [("updatedAt", -1)],
                "projection": {"_id": 1, "userId": 1, "updatedAt": 1},
                "limit": limit,
            },
        },
        {
            "name": "file_assets.admin_default_page",
            "collection": "file_assets",
            "operation": "find",
            "requires": [],
            "kwargs": {
                "filt": {},
                "sort": [("created_at", -1)],
                "projection": {"_id": 1, "file_id": 1, "file_type": 1, "created_at": 1, "status": 1},
                "limit": limit,
            },
        },
        {
            "name": "file_assets.ai_personal_page",
            "collection": "file_assets",
            "operation": "find",
            "requires": ["file_asset_user_id"],
            "kwargs": {
                "filt": {
                    "scope": "ai_personal",
                    "user_id": samples.get("file_asset_user_id"),
                    "status": {"$ne": "hard_deleted"},
                },
                "sort": [("created_at", -1)],
                "limit": limit,
            },
        },
        {
            "name": "file_assets.chat_room_page",
            "collection": "file_assets",
            "operation": "find",
            "requires": ["file_asset_room_id"],
            "kwargs": {
                "filt": {
                    "room_id": samples.get("file_asset_room_id"),
                    "scope": "chat_group",
                    "status": {"$ne": "hard_deleted"},
                },
                "sort": [("created_at", -1)],
                "limit": limit,
            },
        },
        {
            "name": "file_assets.knowledge_source_by_name",
            "collection": "file_assets",
            "operation": "find",
            "requires": ["file_asset_course_id", "file_asset_filename"],
            "kwargs": {
                "filt": {
                    "file_type": "knowledge_source",
                    "course_id": samples.get("file_asset_course_id"),
                    "filename": samples.get("file_asset_filename"),
                    "status": {"$ne": "hard_deleted"},
                },
                "limit": limit,
            },
        },
        {
            "name": "indexing_jobs.by_course_and_filename",
            "collection": "indexing_jobs",
            "operation": "find",
            "requires": ["indexing_course_id", "indexing_filename"],
            "kwargs": {
                "filt": {
                    "course_id": samples.get("indexing_course_id"),
                    "filename": samples.get("indexing_filename"),
                    "status": {"$ne": "hard_deleted"},
                },
                "sort": [("created_at", -1)],
                "limit": limit,
            },
        },
        {
            "name": "background_jobs.claim_ready",
            "collection": "background_jobs",
            "operation": "find",
            "requires": [],
            "kwargs": {
                "filt": {"status": "queued", "available_at": ready_filter},
                "sort": [("created_at", 1)],
                "projection": {"_id": 1, "job_id": 1, "status": 1, "available_at": 1, "created_at": 1},
                "limit": limit,
            },
        },
        {
            "name": "background_jobs.claim_ready_by_type",
            "collection": "background_jobs",
            "operation": "find",
            "requires": [],
            "kwargs": {
                "filt": {"job_type": "course_rag_index", "status": "queued", "available_at": ready_filter},
                "sort": [("created_at", 1)],
                "projection": {"_id": 1, "job_id": 1, "job_type": 1, "status": 1, "available_at": 1, "created_at": 1},
                "limit": limit,
            },
        },
        {
            "name": "admin_db.users_list",
            "collection": "users",
            "operation": "find",
            "requires": [],
            "kwargs": {
                "filt": {},
                "sort": [("role", 1), ("username", 1)],
                "limit": limit,
            },
        },
        {
            "name": "admin_db.users_search",
            "collection": "users",
            "operation": "find",
            "requires": ["admin_username"],
            "kwargs": {
                "filt": build_admin_collection_search_filter("users", str(samples.get("admin_username") or "")[:24]),
                "sort": [("role", 1), ("username", 1)],
                "limit": limit,
            },
        },
        {
            "name": "llm_telemetry.stats_by_provider",
            "collection": "llm_telemetry",
            "operation": "aggregate",
            "requires": [],
            "kwargs": {
                "pipeline": [
                    {"$match": {"timestamp": {"$gte": cutoff}}},
                    {"$group": {"_id": "$provider", "total_calls": {"$sum": 1}, "failed_calls": {"$sum": {"$cond": ["$success", 0, 1]}}}},
                    {"$sort": {"total_calls": -1}},
                    {"$limit": int(args.provider_limit)},
                ],
            },
        },
        {
            "name": "llm_telemetry.recent_errors",
            "collection": "llm_telemetry",
            "operation": "find",
            "requires": [],
            "kwargs": {
                "filt": {"success": False},
                "sort": [("timestamp", -1)],
                "projection": {"_id": 0, "provider": 1, "endpoint": 1, "error_code": 1, "timestamp": 1},
                "limit": min(limit, 100),
            },
        },
        {
            "name": "llm_telemetry.breakdown_by_api_type",
            "collection": "llm_telemetry",
            "operation": "aggregate",
            "requires": [],
            "kwargs": {
                "pipeline": [
                    {"$match": {"timestamp": {"$gte": cutoff}, "api_type": {"$exists": True}}},
                    {"$group": {"_id": "$api_type", "calls": {"$sum": 1}, "errors": {"$sum": {"$cond": ["$success", 0, 1]}}}},
                    {"$sort": {"calls": -1}},
                    {"$limit": int(args.breakdown_limit)},
                ],
            },
        },
        {
            "name": "rag_telemetry.stats",
            "collection": "rag_telemetry",
            "operation": "aggregate",
            "requires": [],
            "kwargs": {
                "pipeline": [
                    {"$match": {"timestamp": {"$gte": cutoff}}},
                    {"$group": {"_id": None, "total": {"$sum": 1}, "empty_count": {"$sum": {"$cond": ["$empty", 1, 0]}}}},
                ],
            },
        },
        {
            "name": "rag_telemetry.course_breakdown",
            "collection": "rag_telemetry",
            "operation": "aggregate",
            "requires": [],
            "kwargs": {
                "pipeline": [
                    {"$match": {"timestamp": {"$gte": cutoff}}},
                    {"$unwind": "$course_ids"},
                    {"$group": {"_id": "$course_ids", "total": {"$sum": 1}, "empty_count": {"$sum": {"$cond": ["$empty", 1, 0]}}}},
                    {"$sort": {"total": -1}},
                    {"$limit": int(args.breakdown_limit)},
                ],
            },
        },
        {
            "name": "rag_telemetry.role_breakdown",
            "collection": "rag_telemetry",
            "operation": "aggregate",
            "requires": [],
            "kwargs": {
                "pipeline": [
                    {"$match": {"timestamp": {"$gte": cutoff}}},
                    {"$group": {"_id": "$role", "total": {"$sum": 1}, "empty_count": {"$sum": {"$cond": ["$empty", 1, 0]}}}},
                    {"$sort": {"total": -1}},
                    {"$limit": min(int(args.breakdown_limit), 100)},
                ],
            },
        },
    ]
    return specs


async def _run_query_spec(
    spec: dict[str, Any],
    samples: dict[str, Any],
    args: argparse.Namespace,
) -> dict[str, Any]:
    missing = _missing_samples(samples, spec.get("requires", []))
    if missing:
        return _skip_query(spec, missing)

    kwargs = dict(spec.get("kwargs") or {})
    try:
        if spec["operation"] == "find":
            return await _explain_find(
                name=spec["name"],
                collection=spec["collection"],
                high_docs_floor=args.high_docs_floor,
                high_docs_ratio=args.high_docs_ratio,
                **kwargs,
            )
        if spec["operation"] == "aggregate":
            return await _explain_aggregate(
                name=spec["name"],
                collection=spec["collection"],
                high_docs_floor=args.high_docs_floor,
                high_docs_ratio=args.high_docs_ratio,
                **kwargs,
            )
    except Exception as exc:
        return {
            "name": spec["name"],
            "collection": spec["collection"],
            "operation": {"type": spec["operation"], **_jsonable(kwargs)},
            "execution": None,
            "recommendations": [],
            "skippedReason": f"Explain failed: {exc}",
        }
    raise ValueError(f"Unsupported operation: {spec['operation']}")


async def build_report(args: argparse.Namespace) -> dict[str, Any]:
    report: dict[str, Any] = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "mongoReachable": False,
        "parameters": {
            "hours": args.hours,
            "limit": args.limit,
            "provider_limit": args.provider_limit,
            "breakdown_limit": args.breakdown_limit,
            "high_docs_floor": args.high_docs_floor,
            "high_docs_ratio": args.high_docs_ratio,
            "user_id_override": _clean_arg(args.user_id) or None,
            "room_id_override": _clean_arg(args.room_id) or None,
            "course_id_override": _clean_arg(args.course_id) or None,
            "filename_override": _clean_arg(args.filename) or None,
        },
        "samples": {},
        "collections": [],
        "queries": [],
        "errors": [],
    }

    try:
        await db.command("ping")
    except Exception as exc:
        report["errors"].append(f"MongoDB ping failed: {exc}")
        return report

    report["mongoReachable"] = True
    samples = await sample_query_values(args)
    report["samples"] = _jsonable(samples)

    for collection_name in BASELINE_COLLECTIONS:
        report["collections"].append(await _collection_summary(collection_name))

    specs = _build_query_specs(samples, args)
    for spec in specs:
        report["queries"].append(await _run_query_spec(spec, samples, args))

    return report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Capture MongoDB explain baselines for high-frequency database paths.")
    parser.add_argument("--user-id", default="", help="Optional user id override. Empty means sample from MongoDB.")
    parser.add_argument("--room-id", default="", help="Optional room id override. Empty means sample from MongoDB.")
    parser.add_argument("--course-id", default="", help="Optional course id override. Empty means sample from MongoDB.")
    parser.add_argument("--filename", default="", help="Optional filename override. Empty means sample from MongoDB.")
    parser.add_argument("--hours", type=int, default=24, help="Telemetry/RAG time window in hours.")
    parser.add_argument("--limit", type=int, default=50, help="Explain command limit for list-style queries.")
    parser.add_argument("--provider-limit", type=int, default=100, help="Provider stats aggregation limit.")
    parser.add_argument("--breakdown-limit", type=int, default=200, help="Telemetry breakdown aggregation limit.")
    parser.add_argument("--high-docs-floor", type=int, default=1000, help="Minimum docs examined before high-scan recommendations.")
    parser.add_argument("--high-docs-ratio", type=int, default=20, help="Docs-examined/returned ratio threshold.")
    parser.add_argument("--output", default="", help="Optional JSON output path.")
    return parser.parse_args()


async def main() -> None:
    args = parse_args()
    try:
        report = await build_report(args)
    finally:
        close_database_client()

    payload = json.dumps(report, indent=2, ensure_ascii=False, default=str)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as file:
            file.write(payload)
            file.write("\n")
    else:
        print(payload)


if __name__ == "__main__":
    asyncio.run(main())
