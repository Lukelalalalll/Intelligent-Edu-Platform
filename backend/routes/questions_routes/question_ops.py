"""QuestionOps Phase 1 MVP endpoints: runs, items, dedupe."""
from __future__ import annotations

import hashlib
import os
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import Depends, HTTPException, Request, Query
from fastapi.responses import JSONResponse

from backend.core.database import db
from backend.core.security import get_current_user
from backend.schemas import QuestionOpsRunCreateSchema, QuestionOpsDedupeApplySchema
from .router import questions_router, _get_task
from .validators import _normalize_question_line, _parse_question_candidates, _score_question_item


async def _resolve_question_ops_source(request: Request, user: dict, task_id: str | None, source_text: str | None) -> str:
    if source_text and source_text.strip():
        return source_text.strip()

    if task_id:
        task = _get_task(request, task_id)
        if task:
            generated_path = task.get("generated_questions_path")
            if generated_path and os.path.exists(generated_path):
                with open(generated_path, "r", encoding="utf-8") as f:
                    return f.read()

    latest = await db.sub2_generation_history.find_one(
        {"user_id": user.get("id", "")},
        sort=[("created_at", -1)],
    )
    if latest and latest.get("result_full"):
        return str(latest.get("result_full"))

    raise HTTPException(status_code=400, detail="No source content found. Generate questions first or provide source_text.")


@questions_router.post("/ops/runs")
async def create_question_ops_run(
    payload: QuestionOpsRunCreateSchema,
    request: Request,
    user: dict = Depends(get_current_user),
):
    source_text = await _resolve_question_ops_source(request, user, payload.task_id, payload.source_text)
    questions = _parse_question_candidates(source_text)
    if not questions:
        raise HTTPException(status_code=400, detail="No question candidates found in source text.")

    run_id = uuid.uuid4().hex
    now = datetime.now(timezone.utc)
    dedupe_threshold = float(payload.dedupe_threshold or 0.82)

    normalized_seen: dict[str, str] = {}
    items: list[dict[str, Any]] = []
    duplicate_count = 0
    for idx, question in enumerate(questions, start=1):
        base = _score_question_item(question)
        normalized = _normalize_question_line(question)
        is_duplicate = normalized in normalized_seen
        if is_duplicate:
            duplicate_count += 1
        else:
            normalized_seen[normalized] = f"q{idx}"

        item_id = f"q{idx}"
        items.append(
            {
                "run_id": run_id,
                "item_id": item_id,
                "question": question,
                "normalized": normalized,
                "quality_score": base["quality_score"],
                "coverage_tags": base["coverage_tags"],
                "difficulty_estimate": base["difficulty_estimate"],
                "is_duplicate": is_duplicate,
                "status": "pending_review",
                "created_at": now,
                "updated_at": now,
            }
        )

    avg_quality = round(sum(i["quality_score"] for i in items) / len(items), 3)
    source_digest = hashlib.sha256(source_text.encode("utf-8", errors="ignore")).hexdigest()

    run_doc = {
        "run_id": run_id,
        "user_id": user.get("id", ""),
        "course_id": payload.course_id,
        "task_id": payload.task_id,
        "status": "completed",
        "source_digest": source_digest,
        "dedupe_threshold": dedupe_threshold,
        "summary": {
            "question_count": len(items),
            "duplicate_count": duplicate_count,
            "avg_quality_score": avg_quality,
        },
        "created_at": now,
        "updated_at": now,
    }

    await db.question_ops_runs.insert_one(run_doc)
    if items:
        await db.question_ops_items.insert_many(items)

    return {
        "success": True,
        "run_id": run_id,
        "status": "completed",
        "summary": run_doc["summary"],
    }


@questions_router.get("/ops/runs/{run_id}")
async def get_question_ops_run(run_id: str, user: dict = Depends(get_current_user)):
    doc = await db.question_ops_runs.find_one({"run_id": run_id, "user_id": user.get("id", "")}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="QuestionOps run not found")

    for key in ("created_at", "updated_at"):
        if hasattr(doc.get(key), "isoformat"):
            doc[key] = doc[key].isoformat()
    return {"success": True, "run": doc}


@questions_router.get("/ops/runs/{run_id}/items")
async def get_question_ops_items(
    run_id: str,
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(get_current_user),
):
    run_doc = await db.question_ops_runs.find_one({"run_id": run_id, "user_id": user.get("id", "")}, {"_id": 1})
    if not run_doc:
        raise HTTPException(status_code=404, detail="QuestionOps run not found")

    cursor = db.question_ops_items.find({"run_id": run_id}, {"_id": 0, "normalized": 0}).sort("item_id", 1).limit(limit)
    items: list[dict[str, Any]] = []
    async for doc in cursor:
        for key in ("created_at", "updated_at"):
            if hasattr(doc.get(key), "isoformat"):
                doc[key] = doc[key].isoformat()
        items.append(doc)
    return {"success": True, "items": items, "count": len(items)}


@questions_router.post("/ops/runs/{run_id}/apply-dedupe")
async def apply_question_ops_dedupe(
    run_id: str,
    payload: QuestionOpsDedupeApplySchema,
    user: dict = Depends(get_current_user),
):
    run_doc = await db.question_ops_runs.find_one({"run_id": run_id, "user_id": user.get("id", "")})
    if not run_doc:
        raise HTTPException(status_code=404, detail="QuestionOps run not found")

    threshold = float(payload.dedupe_threshold if payload.dedupe_threshold is not None else run_doc.get("dedupe_threshold", 0.82))
    all_items = await db.question_ops_items.find({"run_id": run_id}).to_list(length=2000)

    seen: set[str] = set()
    kept = 0
    removed = 0
    now = datetime.now(timezone.utc)
    for item in all_items:
        normalized = str(item.get("normalized", ""))
        quality = float(item.get("quality_score", 0.0))
        is_dup = normalized in seen or bool(item.get("is_duplicate"))
        should_remove = is_dup and quality <= threshold
        if should_remove:
            removed += 1
            status = "deduped"
        else:
            kept += 1
            status = "kept"
            seen.add(normalized)
        await db.question_ops_items.update_one(
            {"run_id": run_id, "item_id": item.get("item_id")},
            {"$set": {"status": status, "updated_at": now}},
        )

    await db.question_ops_runs.update_one(
        {"run_id": run_id},
        {"$set": {
            "updated_at": now,
            "dedupe_threshold": threshold,
            "summary.after_dedupe_kept": kept,
            "summary.after_dedupe_removed": removed,
        }},
    )
    return {
        "success": True,
        "run_id": run_id,
        "kept": kept,
        "removed": removed,
        "threshold": threshold,
    }
