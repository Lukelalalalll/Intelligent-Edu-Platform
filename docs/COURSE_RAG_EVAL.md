# Course RAG Evaluation

This project now includes a lightweight retrieval evaluation script for course RAG.

## Dataset format

Path: `data/rag_eval/course_rag_eval.jsonl`

Each line is a JSON object:

- `id`: sample ID
- `query`: user query
- `course_ids`: allowed course scope for retrieval
- `expected_doc_names`: relevant source document names (for hit/citation checks)
- `expected_keywords`: optional expected evidence keywords in retrieved chunk text

## Metrics

The script reports three metrics:

- `hit_rate`: proportion of samples where at least one relevant citation is retrieved
- `citation_correct_rate`: relevant citations / total returned citations
- `empty_retrieval_rate`: proportion of samples with zero retrieved chunks

## Run

From repo root:

```bash
backend\venv\Scripts\python.exe -m backend.scripts.eval_course_rag --dataset data/rag_eval/course_rag_eval.jsonl --top-k 4 --out data/rag_eval/report.json
```

To evaluate vector-only retrieval:

```bash
backend\venv\Scripts\python.exe -m backend.scripts.eval_course_rag --dataset data/rag_eval/course_rag_eval.jsonl --top-k 4 --no-hybrid
```

## Notes

- Replace sample dataset rows with your real queries and expected evidence.
- For reliable trend tracking, maintain at least 100 labeled samples across major courses.
- Keep the same fixed evaluation set for before/after A/B comparisons.
