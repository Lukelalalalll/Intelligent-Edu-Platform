# evaluator/

RAG retrieval quality evaluation tools. These scripts produce **terminal output only** — no files are written.

---

## Structure

```
evaluator/
├── compare.py                  ← main script: A/B comparison (Hybrid vs Vector-Only)
└── datasets/
    └── rag_eval.jsonl          ← your labeled evaluation questions (edit this first)
```

---

## Step 1 — Fill in the dataset

Open `evaluator/datasets/rag_eval.jsonl`. Each line is one evaluation question:

```json
{
  "id": "q01",
  "query": "What is gradient descent?",
  "course_ids": ["YOUR_MONGO_COURSE_ID"],
  "expected_doc_names": ["lecture3.pdf"],
  "expected_keywords": ["gradient", "learning rate", "loss function"]
}
```

| Field | What to put |
|-------|-------------|
| `course_ids` | The `_id` of a course that **already has indexed documents** (check MongoDB `courses` collection) |
| `expected_doc_names` | Filename of the PDF that should be retrieved (must match exactly what was uploaded) |
| `expected_keywords` | Words you know appear in that document — used as a fallback match if doc name is not recorded |

**Tips:**
- Use 20–30 questions across at least 2–3 different courses for reliable numbers.
- Pick questions whose answers you know appear in the uploaded PDFs.
- Both `expected_doc_names` and `expected_keywords` are checked with OR logic — at least one must match for a citation to be counted as correct.

---

## Step 2 — Run the comparison

From the repo root (with venv activated):

```bash
# Basic run — shows side-by-side table + bar chart
python evaluator/compare.py

# Custom dataset path
python evaluator/compare.py --dataset evaluator/datasets/rag_eval.jsonl

# Show per-question pass/fail while running
python evaluator/compare.py --verbose

# Show per-question results + chunk previews (most detail)
python evaluator/compare.py --verbose --chunks

# Change retrieval depth
python evaluator/compare.py --top-k 6
```

---

## What the output looks like

```
  ════════════════════════════════════════════════════════════════════
    RAG RETRIEVAL QUALITY  —  A/B Comparison
  ════════════════════════════════════════════════════════════════════
  Dataset size : 25 questions
  Top-K        : 4

  Metric                        Vector-Only      Hybrid       Delta
  ──────────────────────────────────────────────────────────────────
  Hit Rate                            61.0%        87.0%     +26.0%
  Citation Correct Rate               55.0%        81.0%     +26.0%
  Empty Retrieval Rate                18.0%         4.0%     -14.0%

  Visual comparison (each █ ≈ 3.3%)
  ...

  PRESENTATION SUMMARY:
  ✓  Hit rate improved by 26.0 percentage points with Hybrid RAG
  ✓  Empty-result rate reduced by 14.0 pp (fewer unanswered queries)
```

---

## Metrics explained

| Metric | Definition | Target |
|--------|------------|--------|
| **Hit Rate** | % of questions where ≥1 retrieved chunk was relevant | Higher is better |
| **Citation Correct Rate** | relevant chunks / total chunks returned | Higher is better |
| **Empty Retrieval Rate** | % of questions where nothing was retrieved at all | Lower is better |

---

## Troubleshooting

**All results are empty (empty_retrieval_rate = 1.0)**
→ The `course_ids` in your JSONL do not match any indexed course. Check that:
1. The MongoDB `_id` string is correct (copy from the admin panel or MongoDB Compass)
2. The course has documents indexed — go to Teacher dashboard → upload a PDF → wait for indexing

**Hybrid and Vector-Only give identical results**
→ TF-IDF index is built at startup from indexed courses. If the backend was just restarted and no courses were loaded yet, TF-IDF may be empty.

