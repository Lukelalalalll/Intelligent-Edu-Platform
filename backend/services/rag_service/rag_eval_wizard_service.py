"""Business logic for RAG eval wizard endpoints: courses, generate-questions, A/B eval."""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from fastapi import HTTPException

from backend.core.database import db
from .rag_eval_scoring import compute_mrr, compute_ndcg, compute_recall_at_k, score_case

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Wizard — Course & Document listing
# ---------------------------------------------------------------------------


async def list_rag_courses_data() -> list[dict]:
    """Return all courses with their indexed document counts."""
    from backend.services.course_rag_service import course_rag_service
    from pathlib import Path

    all_courses = await db.courses.find({}, {"_id": 0, "courseId": 1, "name": 1}).to_list(500)
    name_map = {str(c.get("courseId", "")): c.get("name", "") for c in all_courses}

    indexed_counts: dict = {}
    # persist_root already points to .../vectorstore/courses — do NOT
    # append "/courses" again (that was the old bug).
    persist_root = Path(course_rag_service.persist_root)
    if persist_root.exists():
        for entry in sorted(persist_root.iterdir()):
            if not entry.is_dir():
                continue
            meta_path = entry / "meta.json"
            if not meta_path.exists():
                continue
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
            except Exception:
                continue
            docs = meta.get("documents", {})
            indexed_counts[entry.name] = len(docs)

    result = []
    for course_id, name in name_map.items():
        if not course_id:
            continue
        result.append({
            "course_id": course_id,
            "name": name or course_id,
            "doc_count": indexed_counts.get(course_id, 0),
        })

    for cid, count in indexed_counts.items():
        if cid not in name_map:
            result.append({
                "course_id": cid,
                "name": cid,
                "doc_count": count,
            })

    result.sort(key=lambda x: x["course_id"])
    return result


async def generate_eval_questions_data(
    *,
    course_id: str,
    doc_names: list[str],
    n_questions: int,
    topic_hint: str,
    provider: str,
) -> list[dict]:
    """Use AI to generate evaluation questions from indexed course documents."""
    from backend.services.course_rag_service import course_rag_service
    from backend.services.ai_gateway_service import AIGatewayService

    store = course_rag_service._get_store(course_id)
    all_docs = store.similarity_search("", k=200)
    if doc_names:
        doc_name_set = set(doc_names)
        all_docs = [d for d in all_docs if d.metadata.get("doc_name") in doc_name_set]

    if not all_docs:
        raise HTTPException(400, "No indexed content found for the specified course/documents")

    def _doc_sort_key(doc):
        meta = getattr(doc, "metadata", {}) or {}
        return (
            str(meta.get("doc_name", "")),
            str(meta.get("chapter_id", "")),
            str(meta.get("position", "")),
            str(getattr(doc, "page_content", "")[:80]),
        )

    sample_size = min(len(all_docs), 30)
    ordered_docs = sorted(all_docs, key=_doc_sort_key)
    if len(ordered_docs) <= sample_size:
        sampled = ordered_docs
    else:
        step = len(ordered_docs) / sample_size
        idxs = [min(len(ordered_docs) - 1, int(i * step)) for i in range(sample_size)]
        sampled = [ordered_docs[i] for i in idxs]

    content_snippets = "\n---\n".join(
        f"[Doc: {d.metadata.get('doc_name', '?')}]\n{d.page_content[:500]}"
        for d in sampled
    )
    available_doc_names = sorted({d.metadata.get("doc_name", "") for d in all_docs if d.metadata.get("doc_name")})
    topic_clause = f"\nFocus especially on: {topic_hint}" if topic_hint else ""

    prompt = f"""You are an evaluation dataset generator for a RAG A/B test that compares Hybrid retrieval (BM25 + Vector) vs Vector-only retrieval.

Your ONLY output must be a valid JSON array. No prose, no markdown fences, no explanations.

CRITICAL GOAL — design questions that expose the weakness of vector-only search:
The best questions combine TWO types of information in one query so that ALL expected_keywords must co-occur in the same chunk:
  • TYPE A — Specific factual details: exact numbers, percentages, dates, deadlines, IDs, names
  • TYPE B — Technical content: algorithms, concepts, procedures, definitions
  • BEST: questions that ask for BOTH at once (e.g. "What is the deadline AND penalty for late submission?")

WHY this matters: Vector-only search retrieves semantically similar chunks but may miss the exact chunk
containing all specific keywords. BM25 (keyword matching) surfaces that exact chunk.
So expected_keywords must be SPECIFIC words (numbers, proper nouns, technical terms) that ALL appear
together in a single sentence or paragraph — not generic words like "algorithm" or "method".

Rules:
- Output ONLY a raw JSON array.
- Each element has exactly three fields: "query", "expected_doc_names", "expected_keywords".
- Generate exactly {n_questions} objects.
- Distribute question types: ~40% Type A (factual/deadline), ~40% Type B (technical), ~20% mixed.
- expected_keywords: 3–5 words that MUST ALL co-occur in the correct chunk. Prefer specific terms.
  BAD:  ["algorithm", "method", "data"]       ← too generic, appears everywhere
  GOOD: ["20%", "late", "penalty", "Friday"]  ← specific, forces exact chunk match
{topic_clause}

Available documents: {json.dumps(available_doc_names)}

Content excerpts (use these to find specific facts, numbers, dates, and terms):
{content_snippets}

Example of the EXACT format required:
[
  {{"query": "What is the late submission penalty and when is Assignment 2 due?", "expected_doc_names": ["syllabus.pdf"], "expected_keywords": ["20%", "late", "penalty", "deadline"]}},
  {{"query": "Which algorithm is used for shortest path routing and what is its time complexity?", "expected_doc_names": ["lecture3.pdf"], "expected_keywords": ["Dijkstra", "shortest path", "O(V log V)"]}},
  {{"query": "How many marks is the final exam and what topics does it cover?", "expected_doc_names": ["syllabus.pdf"], "expected_keywords": ["final", "40%", "marks", "exam"]}}
]"""

    ai_service = AIGatewayService()
    try:
        raw_response = await ai_service.chat_with_provider(message=prompt, context=None, provider=provider)
    except Exception as e:
        logger.exception("AI generation failed")
        raise HTTPException(500, f"AI generation failed: {e}")

    questions = _parse_ai_questions(raw_response)

    if not questions:
        raise HTTPException(500, f"Failed to parse AI response. Raw: {raw_response[:500]}")

    sanitized = []
    for i, q in enumerate(questions[:n_questions]):
        if not isinstance(q, dict) or not q.get("query"):
            continue
        sanitized.append({
            "id": f"gen_{i + 1:02d}",
            "query": str(q["query"]).strip(),
            "course_ids": [course_id],
            "expected_doc_names": [str(d) for d in q.get("expected_doc_names", []) if d],
            "expected_keywords": [str(k) for k in q.get("expected_keywords", []) if k],
        })

    return sanitized


def _parse_ai_questions(raw_response: str) -> Optional[list]:
    """Try up to 4 strategies to parse the AI response into a list of dicts."""

    def _try_json_parse(text: str):
        result = json.loads(text)
        return result if isinstance(result, list) else [result]

    # Strategy 1: clean markdown fences and parse
    cleaned = raw_response.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()
    if cleaned.startswith("json"):
        cleaned = cleaned[4:].strip()
    try:
        return _try_json_parse(cleaned)
    except (json.JSONDecodeError, ValueError):
        pass

    # Strategy 2: extract [ ... ] substring
    start = raw_response.find("[")
    end = raw_response.rfind("]")
    if start != -1 and end > start:
        try:
            return _try_json_parse(raw_response[start : end + 1])
        except (json.JSONDecodeError, ValueError):
            pass

    # Strategy 3: extract individual { ... } objects
    obj_blocks = re.findall(r"\{[^{}]*\}", raw_response, re.DOTALL)
    parsed_objs = []
    for block in obj_blocks:
        try:
            parsed_objs.append(json.loads(block))
        except json.JSONDecodeError:
            continue
    if parsed_objs:
        return parsed_objs

    # Strategy 4: fallback — numbered questions
    numbered = re.findall(r"(?:^|\n)\s*\d+[.)]\s+([^\n?]+\?)", raw_response)
    if numbered:
        return [{"query": q.strip()} for q in numbered]

    return None


# ---------------------------------------------------------------------------
# Wizard — A/B evaluation
# ---------------------------------------------------------------------------


async def _run_one_ab_mode(
    cases: list[dict],
    use_hybrid: bool,
    top_k: int,
    selected_docs: Optional[List[str]] = None,
) -> dict:
    """Run evaluation for one retrieval mode.

    When *selected_docs* is non-empty, retrieved chunks whose doc_name
    is not in the set are filtered out before scoring (mirroring the
    user's selection in Step 1).
    """
    from backend.services.course_rag_service import course_rag_service

    label = "hybrid" if use_hybrid else "vector"
    total = len(cases)
    evaluable_total = 0
    invalid_total = 0
    degenerate_total = 0
    hits = 0
    empty = 0
    total_cites = 0
    correct_cites = 0
    mrr_sum = 0.0
    ndcg_sum = 0.0
    recall_sum = 0.0
    latencies: list[float] = []
    details: list[dict] = []

    selected_doc_set: Optional[Set[str]] = set(selected_docs) if selected_docs else None

    for case in cases:
        query = str(case.get("query", "")).strip()
        course_ids = [str(c) for c in case.get("course_ids", []) if c]
        exp_docs: Set[str] = {str(d) for d in case.get("expected_doc_names", []) if d}
        exp_kws: List[str] = [str(k) for k in case.get("expected_keywords", []) if k]

        if not query or not course_ids:
            invalid_total += 1
            details.append({
                "id": case.get("id", "?"),
                "query": query,
                "invalid": True,
                "degenerate": False,
                "hit": False,
                "expected_doc_names": sorted(exp_docs),
                "expected_keywords": exp_kws,
                "retrieved_count": 0,
                "correct_citations": 0,
                "latency_ms": 0,
                "chunks": [],
            })
            continue

        is_degenerate = not exp_docs and not exp_kws
        if is_degenerate:
            degenerate_total += 1
        else:
            evaluable_total += 1

        t0 = time.perf_counter()
        retrieved = await course_rag_service.retrieve_for_student(
            student_id="__evaluator__",
            query=query,
            top_k=top_k,
            course_ids=course_ids,
            use_hybrid=use_hybrid,
        )
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        latencies.append(latency_ms)

        # Optionally filter by selected_docs
        if selected_doc_set:
            retrieved = [c for c in retrieved if str(c.get("doc_name", "")).strip() in selected_doc_set]

        if not retrieved and not is_degenerate:
            empty += 1

        scoring = score_case(retrieved, exp_docs, exp_kws, is_degenerate)

        if scoring["hit"]:
            hits += 1
        if not is_degenerate:
            total_cites += scoring["total_citations"]
            correct_cites += scoring["correct_citations"]

        # MRR, NDCG, Recall: for first matching doc
        if not is_degenerate:
            retrieved_doc_names = [str(c.get("doc_name", "")) for c in retrieved]
            mrr_sum += compute_mrr(retrieved_doc_names, exp_docs)
            ndcg_sum += compute_ndcg(retrieved_doc_names, exp_docs, k=5)
            recall_sum += compute_recall_at_k(retrieved_doc_names, exp_docs, k=10)

        details.append({
            "id": case.get("id", f"q{len(details)+1}"),
            "query": query,
            "hit": scoring["hit"],
            "invalid": False,
            "degenerate": is_degenerate,
            "expected_doc_names": sorted(exp_docs),
            "expected_keywords": exp_kws,
            "retrieved_count": len(retrieved),
            "correct_citations": scoring["correct_citations"],
            "latency_ms": latency_ms,
            "chunks": [
                {
                    "doc": chunk.get("doc_name", ""),
                    "score": chunk.get("score", 0),
                    "preview": str(chunk.get("text", ""))[:150],
                    "correct": scoring["per_chunk"][i] if i < len(scoring["per_chunk"]) else False,
                }
                for i, chunk in enumerate(retrieved)
            ],
        })

    n = max(evaluable_total, 1)
    sorted_lat = sorted(latencies) if latencies else [0]

    return {
        "label": label,
        "total": total,
        "evaluable_total": evaluable_total,
        "top_k": top_k,
        "hit_rate": round(hits / n, 4),
        "citation_correct_rate": round(correct_cites / max(total_cites, 1), 4),
        "empty_retrieval_rate": round(empty / n, 4),
        "mrr": round(mrr_sum / n, 4),
        "ndcg_at_5": round(ndcg_sum / n, 4),
        "recall_at_10": round(recall_sum / n, 4),
        "avg_latency_ms": round(sum(latencies) / max(len(latencies), 1), 2),
        "p50_latency_ms": round(sorted_lat[len(sorted_lat) // 2], 2),
        "p95_latency_ms": round(sorted_lat[min(len(sorted_lat) - 1, int(len(sorted_lat) * 0.95))], 2),
        "counts": {
            "hit": hits,
            "empty": empty,
            "invalid": invalid_total,
            "degenerate": degenerate_total,
            "correct_citations": correct_cites,
            "total_citations": total_cites,
        },
        "details": details,
    }


async def run_ab_evaluation(
    *,
    dataset: list[dict],
    top_k: int,
    mode: str,
    selected_docs: Optional[List[str]] = None,
) -> dict:
    """Run A/B evaluation and return results dict."""
    results: Dict[str, Any] = {}

    if mode in ("hybrid", "comparison"):
        results["hybrid"] = await _run_one_ab_mode(
            dataset, use_hybrid=True, top_k=top_k, selected_docs=selected_docs,
        )

    if mode in ("vector", "comparison"):
        results["vector"] = await _run_one_ab_mode(
            dataset, use_hybrid=False, top_k=top_k, selected_docs=selected_docs,
        )

    if mode == "comparison" and "hybrid" in results and "vector" in results:
        h = results["hybrid"]
        v = results["vector"]
        results["comparison"] = {
            "hit_rate_delta": round(h["hit_rate"] - v["hit_rate"], 4),
            "citation_rate_delta": round(h["citation_correct_rate"] - v["citation_correct_rate"], 4),
            "empty_rate_delta": round(h["empty_retrieval_rate"] - v["empty_retrieval_rate"], 4),
            "mrr_delta": round(h["mrr"] - v["mrr"], 4),
        }

    return results


async def persist_ab_results(eval_result: dict, config: dict) -> str:
    """Persist wizard A/B results to MongoDB so they survive page refreshes."""
    run_id = str(uuid.uuid4())
    doc = {
        "run_id": run_id,
        "type": "wizard_ab",
        "mode": config.get("mode", "comparison"),
        "top_k": config.get("top_k", 4),
        "course_id": config.get("course_id", ""),
        "case_count": len(config.get("dataset", [])),
        "results": eval_result,
        "created_at": datetime.now(timezone.utc),
    }
    await db["rag_eval_ab_runs"].insert_one(doc)
    logger.info("Persisted A/B eval run %s", run_id)
    return run_id


async def list_ab_runs(limit: int = 20) -> list[dict]:
    """Return recent wizard A/B evaluation runs."""
    cursor = (
        db["rag_eval_ab_runs"]
        .find({}, {"results.hybrid.details": 0, "results.vector.details": 0})
        .sort("created_at", -1)
        .limit(limit)
    )
    runs = []
    async for doc in cursor:
        doc.pop("_id", None)
        if isinstance(doc.get("created_at"), datetime):
            doc["created_at"] = doc["created_at"].isoformat()
        runs.append(doc)
    return runs
