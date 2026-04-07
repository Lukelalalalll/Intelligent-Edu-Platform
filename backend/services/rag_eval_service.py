"""
RAG Evaluation Service — data model + execution logic.

MongoDB Collections:
- rag_eval_datasets:   Evaluation datasets (name, version, cases)
- rag_eval_runs:       Each evaluation run (params, aggregate metrics)
- rag_eval_results:    Per-sample results within a run
- rag_eval_baselines:  Baseline run references per course

A "dataset" contains test cases: { query, expected_doc_names, expected_course_id, ... }
A "run" executes the retrieval pipeline on a dataset and records metrics.
"""
from __future__ import annotations

import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.core.database import db

logger = logging.getLogger(__name__)

# Collection names
DS_COL = "rag_eval_datasets"
RUN_COL = "rag_eval_runs"
RES_COL = "rag_eval_results"
BL_COL = "rag_eval_baselines"


# ---------------------------------------------------------------------------
# Dataset CRUD
# ---------------------------------------------------------------------------

async def create_dataset(name: str, cases: List[Dict[str, Any]], description: str = "") -> dict:
    doc = {
        "dataset_id": str(uuid.uuid4()),
        "name": name,
        "description": description,
        "version": 1,
        "cases": cases,  # [{ query, expected_doc_names?, expected_course_id? }, ...]
        "case_count": len(cases),
        "created_at": datetime.now(timezone.utc),
    }
    await db[DS_COL].insert_one(doc)
    return _serialize(doc)


async def list_datasets() -> List[dict]:
    cursor = db[DS_COL].find({}, {"cases": 0}).sort("created_at", -1)
    return [_serialize(d) async for d in cursor]


async def get_dataset(dataset_id: str) -> Optional[dict]:
    doc = await db[DS_COL].find_one({"dataset_id": dataset_id})
    return _serialize(doc) if doc else None


async def delete_dataset(dataset_id: str) -> bool:
    r = await db[DS_COL].delete_one({"dataset_id": dataset_id})
    return r.deleted_count > 0


# ---------------------------------------------------------------------------
# Run evaluation
# ---------------------------------------------------------------------------

async def run_evaluation(
    dataset_id: str,
    course_id: str,
    config: Dict[str, Any],
    triggered_by: str = "admin",
) -> dict:
    """Execute retrieval on every case in the dataset and record results."""
    dataset = await get_dataset(dataset_id)
    if not dataset:
        raise ValueError("Dataset not found")

    from backend.services.course_rag_service import course_rag_service

    top_k = config.get("top_k", 5)
    use_hybrid = config.get("use_hybrid", True)

    run_id = str(uuid.uuid4())
    started_at = datetime.now(timezone.utc)
    cases = dataset.get("cases", [])

    results: List[Dict[str, Any]] = []
    total_latency = 0.0
    hits = 0
    empty_retrievals = 0

    for case in cases:
        query = case.get("query", "")
        expected_docs = set(case.get("expected_doc_names", []))

        t0 = time.perf_counter()
        retrieved = course_rag_service.retrieve_for_student(
            student_id="eval_runner",
            query=query,
            top_k=top_k,
            course_ids=[course_id],
            use_hybrid=use_hybrid,
        )
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        total_latency += latency_ms

        retrieved_docs = {r.get("doc_name", "") for r in retrieved}
        hit = bool(expected_docs and expected_docs & retrieved_docs)
        if hit:
            hits += 1
        if not retrieved:
            empty_retrievals += 1

        result_doc = {
            "run_id": run_id,
            "query": query,
            "expected_doc_names": list(expected_docs),
            "retrieved": retrieved,
            "retrieved_doc_names": list(retrieved_docs),
            "hit": hit,
            "latency_ms": latency_ms,
            "top_k": top_k,
        }
        results.append(result_doc)

    finished_at = datetime.now(timezone.utc)
    n = max(len(cases), 1)

    # Compute aggregate metrics
    # MRR: Mean Reciprocal Rank
    mrr_sum = 0.0
    for res in results:
        expected = set(res["expected_doc_names"])
        for rank, doc_name in enumerate(res["retrieved_doc_names"], 1):
            if doc_name in expected:
                mrr_sum += 1.0 / rank
                break

    metrics = {
        "case_count": len(cases),
        "hit_rate": round(hits / n, 4),
        "empty_retrieval_rate": round(empty_retrievals / n, 4),
        "mrr": round(mrr_sum / n, 4),
        "avg_latency_ms": round(total_latency / n, 2),
        "p50_latency_ms": _percentile([r["latency_ms"] for r in results], 50),
        "p95_latency_ms": _percentile([r["latency_ms"] for r in results], 95),
        "total_latency_ms": round(total_latency, 2),
    }

    run_doc = {
        "run_id": run_id,
        "dataset_id": dataset_id,
        "dataset_name": dataset.get("name", ""),
        "course_id": course_id,
        "config": config,
        "metrics": metrics,
        "triggered_by": triggered_by,
        "started_at": started_at,
        "finished_at": finished_at,
    }

    await db[RUN_COL].insert_one(run_doc)

    # Insert per-sample results
    if results:
        await db[RES_COL].insert_many(results)

    logger.info("Eval run %s completed: %s", run_id, metrics)
    return _serialize(run_doc)


async def case_test(
    course_id: str,
    query: str,
    top_k: int = 5,
    use_hybrid: bool = True,
) -> dict:
    """Single-query debug test — not persisted as a run."""
    from backend.services.course_rag_service import course_rag_service

    t0 = time.perf_counter()
    retrieved = course_rag_service.retrieve_for_student(
        student_id="case_test",
        query=query,
        top_k=top_k,
        course_ids=[course_id],
        use_hybrid=use_hybrid,
    )
    latency_ms = round((time.perf_counter() - t0) * 1000, 2)

    return {
        "query": query,
        "course_id": course_id,
        "top_k": top_k,
        "use_hybrid": use_hybrid,
        "latency_ms": latency_ms,
        "results": retrieved,
    }


# ---------------------------------------------------------------------------
# Run history & comparison
# ---------------------------------------------------------------------------

async def list_runs(limit: int = 50) -> List[dict]:
    cursor = db[RUN_COL].find({}).sort("started_at", -1).limit(limit)
    return [_serialize(d) async for d in cursor]


async def get_run(run_id: str) -> Optional[dict]:
    doc = await db[RUN_COL].find_one({"run_id": run_id})
    return _serialize(doc) if doc else None


async def get_run_results(run_id: str) -> List[dict]:
    cursor = db[RES_COL].find({"run_id": run_id}, {"_id": 0})
    return [d async for d in cursor]


async def set_baseline(run_id: str, course_id: str) -> dict:
    """Set a run as the baseline for a course."""
    now = datetime.now(timezone.utc)
    await db[BL_COL].update_one(
        {"course_id": course_id},
        {"$set": {"run_id": run_id, "course_id": course_id, "set_at": now}},
        upsert=True,
    )
    return {"course_id": course_id, "baseline_run_id": run_id}


async def get_baseline(course_id: str) -> Optional[dict]:
    doc = await db[BL_COL].find_one({"course_id": course_id})
    return _serialize(doc) if doc else None


async def compare_runs(base_run_id: str, target_run_id: str) -> dict:
    """Compare metrics between two runs."""
    base = await get_run(base_run_id)
    target = await get_run(target_run_id)
    if not base or not target:
        raise ValueError("One or both runs not found")

    base_m = base.get("metrics", {})
    target_m = target.get("metrics", {})

    diff = {}
    for key in ("hit_rate", "mrr", "empty_retrieval_rate", "avg_latency_ms", "p50_latency_ms", "p95_latency_ms"):
        bv = base_m.get(key, 0)
        tv = target_m.get(key, 0)
        diff[key] = {
            "base": bv,
            "target": tv,
            "delta": round(tv - bv, 4),
            "pct_change": round((tv - bv) / bv * 100, 2) if bv else 0,
        }

    return {
        "base_run_id": base_run_id,
        "target_run_id": target_run_id,
        "diff": diff,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _serialize(doc: Optional[dict]) -> Optional[dict]:
    if not doc:
        return doc
    d = {k: v for k, v in doc.items() if k != "_id"}
    for key in ("created_at", "started_at", "finished_at", "set_at"):
        if key in d and isinstance(d[key], datetime):
            d[key] = d[key].isoformat()
    return d


def _percentile(values: List[float], pct: int) -> float:
    if not values:
        return 0.0
    sorted_v = sorted(values)
    idx = int(len(sorted_v) * pct / 100)
    idx = min(idx, len(sorted_v) - 1)
    return round(sorted_v[idx], 2)
