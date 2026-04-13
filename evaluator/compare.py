#!/usr/bin/env python3
"""
evaluator/compare.py
====================
A/B comparison: Hybrid RAG (ChromaDB + TF-IDF + RRF)  vs  Vector-Only RAG.

Usage (from repo root, with venv activated):
    python evaluator/compare.py
    python evaluator/compare.py --dataset evaluator/datasets/rag_eval.jsonl
    python evaluator/compare.py --dataset evaluator/datasets/rag_eval.jsonl --top-k 6 --verbose

Output goes entirely to the terminal — no files written.
"""

from __future__ import annotations

import argparse
import json
import sys
import textwrap
from pathlib import Path


# ── allow running from repo root without installing the package ──────────────
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


# ── colour helpers (no external deps) ────────────────────────────────────────
def _green(s: str) -> str:
    return f"\033[32m{s}\033[0m"

def _yellow(s: str) -> str:
    return f"\033[33m{s}\033[0m"

def _cyan(s: str) -> str:
    return f"\033[36m{s}\033[0m"

def _bold(s: str) -> str:
    return f"\033[1m{s}\033[0m"

def _red(s: str) -> str:
    return f"\033[31m{s}\033[0m"


# ── data loading ──────────────────────────────────────────────────────────────
def _load_jsonl(path: Path) -> list[dict]:
    rows = []
    for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        raw = line.strip()
        if not raw:
            continue
        try:
            rows.append(json.loads(raw))
        except json.JSONDecodeError as exc:
            print(_red(f"  [!] Skipping invalid JSONL at line {i}: {exc}"))
    return rows


# ── retrieval wrapper ─────────────────────────────────────────────────────────
def _retrieve(query: str, course_ids: list[str], top_k: int, use_hybrid: bool) -> list[dict]:
    from backend.services.course_rag_service import course_rag_service
    return course_rag_service.retrieve_for_student(
        student_id="__evaluator__",
        query=query,
        top_k=top_k,
        course_ids=course_ids,
        use_hybrid=use_hybrid,
    )


def _contains_keyword(text: str, keywords: list[str]) -> bool:
    lower = text.lower()
    return any(k.strip().lower() in lower for k in keywords if k.strip())


# ── core evaluation ──────────────────────────────────────────────────────────
def _evaluate_one_mode(
    dataset: list[dict],
    top_k: int,
    use_hybrid: bool,
    verbose: bool,
) -> dict:
    """Run retrieval for every sample, return aggregated metrics + per-sample detail."""
    total = len(dataset)
    hit = 0
    empty = 0
    total_cites = 0
    correct_cites = 0
    details = []

    label = "HYBRID" if use_hybrid else "VECTOR-ONLY"

    for row in dataset:
        sid     = str(row.get("id", "?"))
        query   = str(row.get("query", "")).strip()
        cids    = [str(c) for c in row.get("course_ids", []) if str(c).strip()]
        exp_docs = {str(d).strip() for d in row.get("expected_doc_names", []) if str(d).strip()}
        exp_kws  = [str(k).strip() for k in row.get("expected_keywords", []) if str(k).strip()]

        retrieved = _retrieve(query, cids, top_k, use_hybrid)

        if not retrieved:
            empty += 1

        sample_correct = 0
        for chunk in retrieved:
            total_cites += 1
            doc_name = str(chunk.get("doc_name", "")).strip()
            text     = str(chunk.get("text", ""))
            ok = (doc_name in exp_docs) if exp_docs else False
            if not ok and exp_kws:
                ok = _contains_keyword(text, exp_kws)
            if ok:
                sample_correct += 1
                correct_cites += 1

        sample_hit = sample_correct > 0
        if sample_hit:
            hit += 1

        details.append({
            "id": sid,
            "query": query,
            "hit": sample_hit,
            "retrieved_count": len(retrieved),
            "correct_citations": sample_correct,
            "chunks": [
                {
                    "doc": chunk.get("doc_name", ""),
                    "score": chunk.get("score", 0),
                    "preview": str(chunk.get("text", ""))[:120],
                }
                for chunk in retrieved
            ],
        })

        if verbose:
            icon = "✓" if sample_hit else "✗"
            colour = _green if sample_hit else _red
            print(colour(f'  [{label}] {icon} {sid}: retrieved={len(retrieved)}, correct={sample_correct}  — "{query[:60]}"'))

    hit_rate   = round(hit / total, 4) if total else 0.0
    cite_rate  = round(correct_cites / total_cites, 4) if total_cites else 0.0
    empty_rate = round(empty / total, 4) if total else 0.0

    return {
        "label": label,
        "total": total,
        "top_k": top_k,
        "hit_rate": hit_rate,
        "citation_correct_rate": cite_rate,
        "empty_retrieval_rate": empty_rate,
        "counts": {
            "hit": hit,
            "empty": empty,
            "correct_citations": correct_cites,
            "total_citations": total_cites,
        },
        "details": details,
    }


# ── pretty-print helpers ──────────────────────────────────────────────────────
def _bar(value: float, width: int = 30) -> str:
    filled = round(value * width)
    return "█" * filled + "░" * (width - filled)


def _delta(a: float, b: float) -> str:
    """Return coloured delta string: b - a."""
    d = b - a
    sign = "+" if d >= 0 else ""
    pct = f"{sign}{d * 100:.1f}%"
    return _green(pct) if d > 0.005 else (_red(pct) if d < -0.005 else _yellow(pct))


def _print_comparison(hybrid: dict, vector: dict) -> None:
    sep = "─" * 68

    print()
    print(_bold("=" * 68))
    print(_bold("  RAG RETRIEVAL QUALITY  —  A/B Comparison"))
    print(_bold("=" * 68))
    print(f"  Dataset size : {hybrid['total']} questions")
    print(f"  Top-K        : {hybrid['top_k']}")
    print()

    metrics = [
        ("Hit Rate",              "hit_rate",              True),
        ("Citation Correct Rate", "citation_correct_rate", True),
        ("Empty Retrieval Rate",  "empty_retrieval_rate",  False),   # lower is better
    ]

    # Header row
    print(f"  {'Metric':<28}  {'Vector-Only':>12}  {'Hybrid':>12}  {'Delta':>10}")
    print(f"  {sep}")

    for label, key, higher_better in metrics:
        v_val = vector[key]
        h_val = hybrid[key]
        delta = _delta(v_val, h_val) if higher_better else _delta(h_val, v_val)
        print(
            f"  {label:<28}"
            f"  {v_val * 100:>10.1f}%"
            f"  {h_val * 100:>10.1f}%"
            f"  {delta:>10}"
        )

    print()

    # Bar chart section
    print(_bold("  Visual comparison (each █ ≈ 3.3%)"))
    print()
    for label, key, higher_better in metrics:
        v_val = vector[key]
        h_val = hybrid[key]
        print(f"  {label}")
        print(f"  Vector-Only  {_cyan(_bar(v_val))}  {v_val * 100:.1f}%")
        print(f"  Hybrid (RRF) {_green(_bar(h_val))}  {h_val * 100:.1f}%")
        print()

    # Counts summary
    print(sep)
    print(_bold("  Raw counts"))
    hc = hybrid["counts"]
    vc = vector["counts"]
    print(f"  {'':28}  {'Vector-Only':>12}  {'Hybrid':>12}")
    print(f"  {'Hits':28}  {vc['hit']:>12}  {hc['hit']:>12}")
    print(f"  {'Empty results':28}  {vc['empty']:>12}  {hc['empty']:>12}")
    print(f"  {'Total citations returned':28}  {vc['total_citations']:>12}  {hc['total_citations']:>12}")
    print(f"  {'Correct citations':28}  {vc['correct_citations']:>12}  {hc['correct_citations']:>12}")

    print()
    print(_bold("=" * 68))

    # One-line presentation summary
    hr_imp = (hybrid["hit_rate"] - vector["hit_rate"]) * 100
    er_imp = (vector["empty_retrieval_rate"] - hybrid["empty_retrieval_rate"]) * 100
    print()
    print(_bold("  PRESENTATION SUMMARY:"))
    if hr_imp > 0:
        print(_green(f"  ✓  Hit rate improved by {hr_imp:.1f} percentage points with Hybrid RAG"))
    if er_imp > 0:
        print(_green(f"  ✓  Empty-result rate reduced by {er_imp:.1f} pp (fewer unanswered queries)"))
    if hr_imp <= 0 and er_imp <= 0:
        print(_yellow("  ⚠  No improvement detected — check that course_ids in the dataset are correct"))
        print(_yellow("      and that documents have been indexed via the teacher upload flow."))
    print()


def _print_verbose_detail(result: dict, show_chunks: bool) -> None:
    print()
    print(_bold(f"  Per-question detail — {result['label']}"))
    print("─" * 68)
    for d in result["details"]:
        icon = _green("✓") if d["hit"] else _red("✗")
        print(f"  {icon}  [{d['id']}]  {d['query'][:70]}")
        print(f"      retrieved={d['retrieved_count']}  correct_citations={d['correct_citations']}")
        if show_chunks and d["chunks"]:
            for c in d["chunks"]:
                print(f"       ├─ {c['doc']}  (score {c['score']:.3f})")
                print(f"       │  {textwrap.shorten(c['preview'], 90)}")
    print()


# ── entry point ───────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(
        description="A/B compare Hybrid vs Vector-Only RAG retrieval quality"
    )
    parser.add_argument(
        "--dataset",
        default="evaluator/datasets/rag_eval.jsonl",
        help="Path to .jsonl evaluation dataset  (default: evaluator/datasets/rag_eval.jsonl)",
    )
    parser.add_argument(
        "--top-k", type=int, default=4,
        help="Number of chunks to retrieve per query  (default: 4)",
    )
    parser.add_argument(
        "--verbose", action="store_true",
        help="Print per-question results while running",
    )
    parser.add_argument(
        "--chunks", action="store_true",
        help="Show individual chunk previews in per-question detail (implies --verbose)",
    )
    args = parser.parse_args()

    dataset_path = Path(args.dataset)
    if not dataset_path.exists():
        print(_red(f"\n  [!] Dataset not found: {dataset_path}"))
        print(_yellow("      Edit evaluator/datasets/rag_eval.jsonl and replace the placeholder"))
        print(_yellow("      course_ids / doc names with real values from your running instance.\n"))
        sys.exit(1)

    dataset = _load_jsonl(dataset_path)
    if not dataset:
        print(_red("  [!] Dataset is empty — nothing to evaluate."))
        sys.exit(1)

    # Sanity-check for placeholder values
    all_ids = set()
    for row in dataset:
        for cid in row.get("course_ids", []):
            all_ids.add(str(cid))
    if "REPLACE_WITH_REAL_COURSE_ID" in all_ids:
        print(_red("\n  [!] Dataset still contains placeholder course_ids."))
        print(_yellow("  Open evaluator/datasets/rag_eval.jsonl and replace"))
        print(_yellow("  REPLACE_WITH_REAL_COURSE_ID with your actual MongoDB course _id values.\n"))
        sys.exit(1)

    verbose = args.verbose or args.chunks
    top_k   = max(1, args.top_k)

    print(_bold(f"\n  Loading dataset: {dataset_path}  ({len(dataset)} questions)"))
    print(f"  Top-K = {top_k}\n")

    print(_cyan("  Running VECTOR-ONLY evaluation …"))
    vector_result = _evaluate_one_mode(dataset, top_k, use_hybrid=False, verbose=verbose)

    print(_cyan("\n  Running HYBRID (ChromaDB + TF-IDF + RRF) evaluation …"))
    hybrid_result = _evaluate_one_mode(dataset, top_k, use_hybrid=True, verbose=verbose)

    _print_comparison(hybrid_result, vector_result)

    if verbose:
        _print_verbose_detail(vector_result, args.chunks)
        _print_verbose_detail(hybrid_result, args.chunks)


if __name__ == "__main__":
    main()
