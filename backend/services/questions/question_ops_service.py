from __future__ import annotations

import hashlib
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, Request

from backend.repositories import question_ops_repo
from backend.schemas import QuestionOpsDedupeApplySchema, QuestionOpsRunCreateSchema


def _normalize_question_line(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"^\s*\d+[\.)]\s*", "", str(text or "").strip())).lower()


def _parse_question_candidates(source_text: str) -> list[str]:
    lines = [line.strip() for line in str(source_text or "").splitlines() if line.strip()]
    candidates: list[str] = []
    for line in lines:
        if re.match(r"^\d+[\.)]\s+", line) or line.endswith("?"):
            candidates.append(line)
    if not candidates:
        for chunk in re.split(r"\n\s*\n", str(source_text or "")):
            sentence = chunk.strip()
            if sentence:
                candidates.append(sentence[:220])
    return candidates[:120]


def _score_question_item(question: str) -> dict[str, Any]:
    text = str(question or "")
    length = len(text)
    complexity = min(1.0, max(0.2, length / 140.0))
    has_numeric = bool(re.search(r"\d", text))
    has_verb = bool(
        re.search(r"\b(explain|derive|compare|analyze|prove|calculate|design|evaluate)\b", text, re.IGNORECASE)
    )
    quality = round(
        min(1.0, 0.45 + complexity * 0.35 + (0.1 if has_numeric else 0.0) + (0.1 if has_verb else 0.0)),
        3,
    )

    tags: list[str] = []
    if re.search(r"\b(define|what is|state)\b", text, re.IGNORECASE):
        tags.append("concept_recall")
    if re.search(r"\b(calculate|compute|derive)\b", text, re.IGNORECASE):
        tags.append("quantitative")
    if re.search(r"\b(compare|analyze|evaluate|why)\b", text, re.IGNORECASE):
        tags.append("reasoning")
    if not tags:
        tags.append("general")
    return {
        "quality_score": quality,
        "coverage_tags": tags,
        "difficulty_estimate": "high" if quality >= 0.82 else ("medium" if quality >= 0.68 else "low"),
    }


async def resolve_question_ops_source(
    *,
    request: Request,
    user: dict,
    task_id: str | None,
    source_text: str | None,
) -> str:
    if source_text and source_text.strip():
        return source_text.strip()
    if task_id:
        task = request.session.get("sub2_tasks", {}).get(task_id)
        if task:
            generated_path = task.get("generated_questions_path")
            if generated_path and os.path.exists(generated_path):
                with open(generated_path, "r", encoding="utf-8") as handle:
                    return handle.read()

    latest = await question_ops_repo.find_latest_generation_result_for_user(user.get("id", ""))
    if latest and latest.get("result_full"):
        return str(latest.get("result_full"))
    raise HTTPException(
        status_code=400,
        detail="No source content found. Generate questions first or provide source_text.",
    )


async def create_question_ops_run(
    *,
    payload: QuestionOpsRunCreateSchema,
    request: Request,
    user: dict,
) -> dict[str, Any]:
    source_text = await resolve_question_ops_source(
        request=request,
        user=user,
        task_id=payload.task_id,
        source_text=payload.source_text,
    )
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
        items.append(
            {
                "run_id": run_id,
                "item_id": f"q{idx}",
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

    avg_quality = round(sum(item["quality_score"] for item in items) / len(items), 3)
    run_doc = {
        "run_id": run_id,
        "user_id": user.get("id", ""),
        "course_id": payload.course_id,
        "task_id": payload.task_id,
        "status": "completed",
        "source_digest": hashlib.sha256(source_text.encode("utf-8", errors="ignore")).hexdigest(),
        "dedupe_threshold": dedupe_threshold,
        "summary": {
            "question_count": len(items),
            "duplicate_count": duplicate_count,
            "avg_quality_score": avg_quality,
        },
        "created_at": now,
        "updated_at": now,
    }
    await question_ops_repo.insert_run(run_doc)
    await question_ops_repo.insert_items(items)
    return {"success": True, "run_id": run_id, "status": "completed", "summary": run_doc["summary"]}


async def get_question_ops_run(*, run_id: str, user_id: str) -> dict[str, Any]:
    doc = await question_ops_repo.find_run(run_id, user_id, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="QuestionOps run not found")
    for key in ("created_at", "updated_at"):
        if hasattr(doc.get(key), "isoformat"):
            doc[key] = doc[key].isoformat()
    return {"success": True, "run": doc}


async def get_question_ops_items(*, run_id: str, user_id: str, limit: int) -> dict[str, Any]:
    run_doc = await question_ops_repo.find_run(run_id, user_id, {"_id": 1})
    if not run_doc:
        raise HTTPException(status_code=404, detail="QuestionOps run not found")
    items = await question_ops_repo.list_items(run_id, projection={"_id": 0, "normalized": 0}, limit=limit)
    for item in items:
        for key in ("created_at", "updated_at"):
            if hasattr(item.get(key), "isoformat"):
                item[key] = item[key].isoformat()
    return {"success": True, "items": items, "count": len(items)}


async def apply_question_ops_dedupe(
    *,
    run_id: str,
    payload: QuestionOpsDedupeApplySchema,
    user_id: str,
) -> dict[str, Any]:
    run_doc = await question_ops_repo.find_run(run_id, user_id)
    if not run_doc:
        raise HTTPException(status_code=404, detail="QuestionOps run not found")
    threshold = float(
        payload.dedupe_threshold
        if payload.dedupe_threshold is not None
        else run_doc.get("dedupe_threshold", 0.82)
    )
    all_items = await question_ops_repo.list_all_items(run_id, limit=2000)

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
        await question_ops_repo.update_item_status(run_id, item.get("item_id"), status=status, now=now)

    await question_ops_repo.update_run_dedupe_summary(
        run_id=run_id,
        threshold=threshold,
        kept=kept,
        removed=removed,
        now=now,
    )
    return {"success": True, "run_id": run_id, "kept": kept, "removed": removed, "threshold": threshold}
