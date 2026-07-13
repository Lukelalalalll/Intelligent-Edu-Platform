"""RAG evaluation endpoints: datasets, runs, baselines, quality gate, wizard."""
from __future__ import annotations

import logging

from fastapi import Depends, HTTPException, Query

from backend.core.security import get_admin_user
from backend.schemas.rag_eval import (
    CaseTestRequest,
    CreateDatasetRequest,
    EvaluateABRequest,
    GenerateQuestionsRequest,
    QualityGateRequest,
    RunEvaluationRequest,
    SetBaselineRequest,
)
from fastapi import APIRouter
router = APIRouter()

logger = logging.getLogger(__name__)


@router.get("/rag-eval/datasets")
async def list_eval_datasets(admin: dict = Depends(get_admin_user)):
    from backend.services.rag_service.rag_eval_service import list_datasets
    return {"datasets": await list_datasets()}


@router.post("/rag-eval/datasets")
async def create_eval_dataset(req: CreateDatasetRequest, admin: dict = Depends(get_admin_user)):
    from backend.services.rag_service.rag_eval_service import create_dataset
    ds = await create_dataset(req.name, [c.model_dump() for c in req.cases], req.description)
    return ds


@router.get("/rag-eval/datasets/{dataset_id}")
async def get_eval_dataset(dataset_id: str, admin: dict = Depends(get_admin_user)):
    from backend.services.rag_service.rag_eval_service import get_dataset
    ds = await get_dataset(dataset_id)
    if not ds:
        raise HTTPException(404, "Dataset not found")
    return ds


@router.delete("/rag-eval/datasets/{dataset_id}")
async def delete_eval_dataset(dataset_id: str, admin: dict = Depends(get_admin_user)):
    from backend.services.rag_service.rag_eval_service import delete_dataset
    ok = await delete_dataset(dataset_id)
    if not ok:
        raise HTTPException(404, "Dataset not found")
    return {"ok": True}


@router.post("/rag-eval/run")
async def run_rag_evaluation(req: RunEvaluationRequest, admin: dict = Depends(get_admin_user)):
    """Start a full evaluation run on a dataset."""
    from backend.services.rag_service.rag_eval_service import run_evaluation

    triggered_by = str(admin.get("username", admin.get("_id", "admin")))

    try:
        result = await run_evaluation(req.dataset_id, req.course_id, req.config, triggered_by)
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception:
        logger.exception("Eval run failed")
        raise HTTPException(500, "Evaluation run failed")


@router.get("/rag-eval/runs")
async def list_eval_runs(
    limit: int = Query(default=50, ge=1, le=200),
    admin: dict = Depends(get_admin_user),
):
    from backend.services.rag_service.rag_eval_service import list_runs
    return {"runs": await list_runs(limit)}


@router.get("/rag-eval/run/{run_id}")
async def get_eval_run(run_id: str, admin: dict = Depends(get_admin_user)):
    from backend.services.rag_service.rag_eval_service import get_run, get_run_results
    run = await get_run(run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    run["results"] = await get_run_results(run_id)
    return run


@router.post("/rag-eval/case-test")
async def rag_case_test(req: CaseTestRequest, admin: dict = Depends(get_admin_user)):
    """Single-query debug test — not persisted."""
    from backend.services.rag_service.rag_eval_service import case_test

    result = await case_test(
        course_id=req.course_id,
        query=req.query,
        top_k=req.top_k,
        use_hybrid=req.use_hybrid,
        rag_profile=req.rag_profile,
        debug_retrieval=req.debug_retrieval,
        allow_web_correction=req.allow_web_correction,
        force_query_class=req.force_query_class,
    )
    return result


@router.post("/rag-eval/baseline/{run_id}")
async def set_eval_baseline(run_id: str, req: SetBaselineRequest, admin: dict = Depends(get_admin_user)):
    from backend.services.rag_service.rag_eval_service import set_baseline
    return await set_baseline(run_id, req.course_id)


@router.get("/rag-eval/baseline/{course_id}")
async def get_eval_baseline(course_id: str, admin: dict = Depends(get_admin_user)):
    from backend.services.rag_service.rag_eval_service import get_baseline, get_run
    bl = await get_baseline(course_id)
    if not bl:
        return {"baseline": None}
    run = await get_run(bl.get("run_id", ""))
    return {"baseline": bl, "run": run}


@router.get("/rag-eval/compare")
async def compare_eval_runs(
    base: str = Query(...),
    target: str = Query(...),
    admin: dict = Depends(get_admin_user),
):
    from backend.services.rag_service.rag_eval_service import compare_runs
    try:
        return await compare_runs(base, target)
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.post("/rag-eval/quality-gate")
async def rag_quality_gate(req: QualityGateRequest, admin: dict = Depends(get_admin_user)):
    """
    Release quality gate: run evaluation on a dataset, compare against baseline,
    and return pass/fail based on configurable thresholds.
    """
    from backend.services.rag_service.rag_eval_service import (
        run_evaluation, get_baseline, compare_runs,
    )

    th = req.thresholds
    max_hit_rate_drop = th.max_hit_rate_drop_pct
    max_p95_increase = th.max_p95_latency_increase_pct
    max_empty_rate = th.max_error_rate

    triggered_by = str(admin.get("username", admin.get("_id", "quality-gate")))

    # 1) Run evaluation
    try:
        run = await run_evaluation(req.dataset_id, req.course_id, req.config, triggered_by)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception:
        logger.exception("Quality gate eval run failed")
        raise HTTPException(500, "Evaluation run failed")

    run_metrics = run.get("metrics", {})
    run_id = run.get("run_id", "")

    # 2) Compare against baseline if one exists
    gate_checks: list[dict] = []
    baseline = await get_baseline(req.course_id)
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


# ---------------------------------------------------------------------------
# Wizard endpoints — courses, docs, generate questions, A/B evaluate
# ---------------------------------------------------------------------------

@router.get("/rag-eval/courses")
async def list_rag_courses(admin: dict = Depends(get_admin_user)):
    """Return all courses (admin view). Courses with indexed documents show their doc counts."""
    from backend.services.rag_service.rag_eval_wizard_service import list_rag_courses_data
    return {"courses": await list_rag_courses_data()}


@router.get("/rag-eval/docs")
async def list_rag_docs(
    course_id: str = Query(...),
    admin: dict = Depends(get_admin_user),
):
    """Return indexed documents for a specific course."""
    from backend.services.course_rag_service import course_rag_service

    docs = course_rag_service.list_indexed_documents(course_id)
    return {"docs": docs}


@router.post("/rag-eval/generate-questions")
async def generate_eval_questions(req: GenerateQuestionsRequest, admin: dict = Depends(get_admin_user)):
    """Use AI to generate evaluation questions from indexed course documents."""
    from backend.services.rag_service.rag_eval_wizard_service import generate_eval_questions_data

    questions = await generate_eval_questions_data(
        course_id=req.course_id,
        doc_names=req.doc_names,
        n_questions=req.n_questions,
        topic_hint=req.topic_hint,
        provider=req.provider,
    )
    return {"questions": questions}


@router.post("/rag-eval/evaluate-ab")
async def evaluate_ab(req: EvaluateABRequest, admin: dict = Depends(get_admin_user)):
    """A/B evaluation: run dataset through both hybrid and vector-only modes."""
    from backend.services.rag_service.rag_eval_wizard_service import run_ab_evaluation, persist_ab_results

    dataset_dicts = [c.model_dump() for c in req.dataset]

    eval_result = await run_ab_evaluation(
        dataset=dataset_dicts,
        top_k=req.top_k,
        mode=req.mode,
        selected_docs=req.selected_docs if req.selected_docs else None,
        rag_profile=req.rag_profile,
        debug_retrieval=req.debug_retrieval,
        allow_web_correction=req.allow_web_correction,
        force_query_class=req.force_query_class,
    )

    # Persist results so they survive page refreshes
    run_id = await persist_ab_results(eval_result, {
        "mode": req.mode,
        "top_k": req.top_k,
        "dataset": dataset_dicts,
        "course_id": dataset_dicts[0].get("course_ids", [""])[0] if dataset_dicts else "",
        "rag_profile": req.rag_profile,
        "debug_retrieval": req.debug_retrieval,
        "allow_web_correction": req.allow_web_correction,
        "force_query_class": req.force_query_class,
    })
    eval_result["run_id"] = run_id

    return eval_result
