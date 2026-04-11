"""RAG evaluation endpoints: datasets, runs, baselines, quality gate."""
from __future__ import annotations

import logging

from fastapi import Depends, HTTPException, Query

from backend.core.security import get_admin_user
from .router import admin_router

logger = logging.getLogger(__name__)


@admin_router.get("/rag-eval/datasets")
async def list_eval_datasets(admin: dict = Depends(get_admin_user)):
    from backend.services.rag_eval_service import list_datasets
    return {"datasets": await list_datasets()}


@admin_router.post("/rag-eval/datasets")
async def create_eval_dataset(req: dict, admin: dict = Depends(get_admin_user)):
    from backend.services.rag_eval_service import create_dataset
    name = (req.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Dataset name is required")
    cases = req.get("cases", [])
    if not cases:
        raise HTTPException(400, "At least one test case is required")
    ds = await create_dataset(name, cases, req.get("description", ""))
    return ds


@admin_router.get("/rag-eval/datasets/{dataset_id}")
async def get_eval_dataset(dataset_id: str, admin: dict = Depends(get_admin_user)):
    from backend.services.rag_eval_service import get_dataset
    ds = await get_dataset(dataset_id)
    if not ds:
        raise HTTPException(404, "Dataset not found")
    return ds


@admin_router.delete("/rag-eval/datasets/{dataset_id}")
async def delete_eval_dataset(dataset_id: str, admin: dict = Depends(get_admin_user)):
    from backend.services.rag_eval_service import delete_dataset
    ok = await delete_dataset(dataset_id)
    if not ok:
        raise HTTPException(404, "Dataset not found")
    return {"ok": True}


@admin_router.post("/rag-eval/run")
async def run_rag_evaluation(req: dict, admin: dict = Depends(get_admin_user)):
    """Start a full evaluation run on a dataset."""
    from backend.services.rag_eval_service import run_evaluation

    dataset_id = (req.get("dataset_id") or "").strip()
    course_id = (req.get("course_id") or "").strip()
    if not dataset_id or not course_id:
        raise HTTPException(400, "dataset_id and course_id are required")

    config = req.get("config", {})
    triggered_by = str(admin.get("username", admin.get("_id", "admin")))

    try:
        result = await run_evaluation(dataset_id, course_id, config, triggered_by)
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception:
        logger.exception("Eval run failed")
        raise HTTPException(500, "Evaluation run failed")


@admin_router.get("/rag-eval/runs")
async def list_eval_runs(
    limit: int = Query(default=50, ge=1, le=200),
    admin: dict = Depends(get_admin_user),
):
    from backend.services.rag_eval_service import list_runs
    return {"runs": await list_runs(limit)}


@admin_router.get("/rag-eval/run/{run_id}")
async def get_eval_run(run_id: str, admin: dict = Depends(get_admin_user)):
    from backend.services.rag_eval_service import get_run, get_run_results
    run = await get_run(run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    run["results"] = await get_run_results(run_id)
    return run


@admin_router.post("/rag-eval/case-test")
async def rag_case_test(req: dict, admin: dict = Depends(get_admin_user)):
    """Single-query debug test — not persisted."""
    from backend.services.rag_eval_service import case_test

    course_id = (req.get("course_id") or "").strip()
    query = (req.get("query") or "").strip()
    if not course_id or not query:
        raise HTTPException(400, "course_id and query are required")

    result = await case_test(
        course_id=course_id,
        query=query,
        top_k=int(req.get("top_k", 5)),
        use_hybrid=bool(req.get("use_hybrid", True)),
    )
    return result


@admin_router.post("/rag-eval/baseline/{run_id}")
async def set_eval_baseline(run_id: str, req: dict, admin: dict = Depends(get_admin_user)):
    from backend.services.rag_eval_service import set_baseline
    course_id = (req.get("course_id") or "").strip()
    if not course_id:
        raise HTTPException(400, "course_id is required")
    return await set_baseline(run_id, course_id)


@admin_router.get("/rag-eval/baseline/{course_id}")
async def get_eval_baseline(course_id: str, admin: dict = Depends(get_admin_user)):
    from backend.services.rag_eval_service import get_baseline, get_run
    bl = await get_baseline(course_id)
    if not bl:
        return {"baseline": None}
    run = await get_run(bl.get("run_id", ""))
    return {"baseline": bl, "run": run}


@admin_router.get("/rag-eval/compare")
async def compare_eval_runs(
    base: str = Query(...),
    target: str = Query(...),
    admin: dict = Depends(get_admin_user),
):
    from backend.services.rag_eval_service import compare_runs
    try:
        return await compare_runs(base, target)
    except ValueError as e:
        raise HTTPException(404, str(e))


@admin_router.post("/rag-eval/quality-gate")
async def rag_quality_gate(req: dict, admin: dict = Depends(get_admin_user)):
    """
    Release quality gate: run evaluation on a dataset, compare against baseline,
    and return pass/fail based on configurable thresholds.
    """
    from backend.services.rag_eval_service import (
        run_evaluation, get_baseline, compare_runs,
    )

    dataset_id = (req.get("dataset_id") or "").strip()
    course_id = (req.get("course_id") or "").strip()
    if not dataset_id or not course_id:
        raise HTTPException(400, "dataset_id and course_id are required")

    config = req.get("config", {})
    th = req.get("thresholds", {})
    max_hit_rate_drop = th.get("max_hit_rate_drop_pct", 3)
    max_p95_increase = th.get("max_p95_latency_increase_pct", 20)
    max_empty_rate = th.get("max_error_rate", 0.02)

    triggered_by = str(admin.get("username", admin.get("_id", "quality-gate")))

    # 1) Run evaluation
    try:
        run = await run_evaluation(dataset_id, course_id, config, triggered_by)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception:
        logger.exception("Quality gate eval run failed")
        raise HTTPException(500, "Evaluation run failed")

    run_metrics = run.get("metrics", {})
    run_id = run.get("run_id", "")

    # 2) Compare against baseline if one exists
    gate_checks: list[dict] = []
    baseline = await get_baseline(course_id)

    if baseline:
        baseline_run_id = baseline.get("run_id", "")
        try:
            comparison = await compare_runs(baseline_run_id, run_id)
            diff = comparison.get("diff", {})

            # hit_rate drop check
            hr_diff = diff.get("hit_rate", {})
            hr_delta_pct = hr_diff.get("pct_change", 0)
            hr_pass = hr_delta_pct >= -max_hit_rate_drop
            gate_checks.append({
                "check": "hit_rate_vs_baseline",
                "passed": hr_pass,
                "base": hr_diff.get("base", 0),
                "current": hr_diff.get("target", 0),
                "delta_pct": hr_delta_pct,
                "threshold": f">= -{max_hit_rate_drop}%",
            })

            # P95 latency increase check
            p95_diff = diff.get("p95_latency_ms", {})
            p95_delta_pct = p95_diff.get("pct_change", 0)
            p95_pass = p95_delta_pct <= max_p95_increase
            gate_checks.append({
                "check": "p95_latency_vs_baseline",
                "passed": p95_pass,
                "base": p95_diff.get("base", 0),
                "current": p95_diff.get("target", 0),
                "delta_pct": p95_delta_pct,
                "threshold": f"<= +{max_p95_increase}%",
            })
        except ValueError:
            gate_checks.append({
                "check": "baseline_comparison",
                "passed": True,
                "note": "Baseline run not found, skipping comparison",
            })
    else:
        gate_checks.append({
            "check": "baseline_comparison",
            "passed": True,
            "note": "No baseline set for this course, skipping comparison",
        })

    # 3) Absolute empty retrieval rate check
    er = run_metrics.get("empty_retrieval_rate", 0)
    er_pass = er <= max_empty_rate
    gate_checks.append({
        "check": "empty_retrieval_rate",
        "passed": er_pass,
        "current": er,
        "threshold": f"<= {max_empty_rate * 100}%",
    })

    overall_pass = all(c["passed"] for c in gate_checks)

    return {
        "passed": overall_pass,
        "run_id": run_id,
        "metrics": run_metrics,
        "checks": gate_checks,
    }
