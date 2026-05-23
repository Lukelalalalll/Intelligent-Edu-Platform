from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any

from backend.services.course_rag_service import course_rag_service


def _load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for idx, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        raw = line.strip()
        if not raw:
            continue
        try:
            obj = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid JSONL at line {idx}: {exc}") from exc
        if not isinstance(obj, dict):
            raise ValueError(f"Line {idx} must be a JSON object")
        rows.append(obj)
    return rows


def _contains_any_keyword(text: str, keywords: list[str]) -> bool:
    content = str(text or "").lower()
    return any(str(k or "").strip().lower() in content for k in keywords if str(k or "").strip())


async def _evaluate_async(dataset: list[dict[str, Any]], top_k: int, use_hybrid: bool) -> dict[str, Any]:
    total = len(dataset)
    empty_count = 0
    hit_count = 0

    total_citations = 0
    correct_citations = 0

    details: list[dict[str, Any]] = []

    for row in dataset:
        sample_id = str(row.get("id") or "")
        query = str(row.get("query") or "").strip()
        course_ids = [str(c) for c in row.get("course_ids", []) if str(c).strip()]
        expected_docs = {str(d).strip() for d in row.get("expected_doc_names", []) if str(d).strip()}
        expected_keywords = [str(k).strip() for k in row.get("expected_keywords", []) if str(k).strip()]

        retrieved = await course_rag_service.retrieve_for_student(
            student_id="rag_eval",
            query=query,
            top_k=top_k,
            course_ids=course_ids,
            use_hybrid=use_hybrid,
        )

        if not retrieved:
            empty_count += 1

        sample_hit = False
        sample_correct_citations = 0

        for item in retrieved:
            total_citations += 1
            doc_name = str(item.get("doc_name", "")).strip()
            text = str(item.get("text", ""))

            citation_ok = False
            if expected_docs and doc_name in expected_docs:
                citation_ok = True
            elif expected_keywords and _contains_any_keyword(text, expected_keywords):
                citation_ok = True

            if citation_ok:
                sample_correct_citations += 1
                correct_citations += 1

        if sample_correct_citations > 0:
            sample_hit = True
            hit_count += 1

        details.append(
            {
                "id": sample_id,
                "query": query,
                "retrieved_count": len(retrieved),
                "sample_hit": sample_hit,
                "correct_citations": sample_correct_citations,
                "retrieved": [
                    {
                        "course_id": r.get("course_id", ""),
                        "doc_name": r.get("doc_name", ""),
                        "section_title": r.get("section_title", ""),
                        "score": r.get("score", 0),
                        "retrieval_score": r.get("retrieval_score", 0),
                        "overlap_score": r.get("overlap_score", 0),
                        "preview": str(r.get("text", ""))[:160],
                    }
                    for r in retrieved
                ],
            }
        )

    hit_rate = (hit_count / total) if total else 0.0
    citation_correct_rate = (correct_citations / total_citations) if total_citations else 0.0
    empty_retrieval_rate = (empty_count / total) if total else 0.0

    return {
        "total": total,
        "top_k": top_k,
        "use_hybrid": use_hybrid,
        "hit_rate": round(hit_rate, 4),
        "citation_correct_rate": round(citation_correct_rate, 4),
        "empty_retrieval_rate": round(empty_retrieval_rate, 4),
        "counts": {
            "hit": hit_count,
            "empty": empty_count,
            "correct_citations": correct_citations,
            "total_citations": total_citations,
        },
        "details": details,
    }


def evaluate(dataset: list[dict[str, Any]], top_k: int, use_hybrid: bool) -> dict[str, Any]:
    """Synchronous wrapper — uses a single event loop for all cases."""
    return asyncio.run(_evaluate_async(dataset, top_k, use_hybrid))


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate course RAG retrieval quality")
    parser.add_argument(
        "--dataset",
        default="data/rag_eval/course_rag_eval.jsonl",
        help="Path to JSONL retrieval evaluation dataset",
    )
    parser.add_argument("--top-k", type=int, default=4, help="Top-k retrieval size")
    parser.add_argument("--no-hybrid", action="store_true", help="Disable hybrid retrieval")
    parser.add_argument(
        "--out",
        default="",
        help="Optional output path for full evaluation JSON report",
    )

    args = parser.parse_args()

    dataset_path = Path(args.dataset)
    if not dataset_path.exists():
        raise SystemExit(f"Dataset not found: {dataset_path}")

    dataset = _load_jsonl(dataset_path)
    result = evaluate(dataset=dataset, top_k=max(1, args.top_k), use_hybrid=not args.no_hybrid)

    print("=== Course RAG Evaluation ===")
    print(f"total: {result['total']}")
    print(f"top_k: {result['top_k']}")
    print(f"use_hybrid: {result['use_hybrid']}")
    print(f"hit_rate: {result['hit_rate']}")
    print(f"citation_correct_rate: {result['citation_correct_rate']}")
    print(f"empty_retrieval_rate: {result['empty_retrieval_rate']}")

    if args.out:
        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Saved report: {out_path}")


if __name__ == "__main__":
    main()
