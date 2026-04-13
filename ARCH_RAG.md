# RAG (Retrieval-Augmented Generation) — Detailed Architecture

---

## Overview

The RAG system allows students to ask questions and receive answers **grounded in their actual course materials** — PDFs and documents uploaded by teachers. It uses a dual-retrieval strategy (semantic vector search + keyword TF-IDF) and routes the final answer through the configured AI provider (Coze or local Llama).

---

## 1. End-to-End Data Flow

```
═══════════════════════════════════════════════════════════════════════════════
 PHASE 1 — INDEXING  (Teacher uploads course material)
═══════════════════════════════════════════════════════════════════════════════

  Teacher (Browser)
       │
       │  POST /api/ai/index-course
       │  { course_id, filename, file_bytes }
       ▼
  ┌─────────────────────────────────┐
  │  routes/ai_routes/              │
  │  index_course.py                │
  │                                 │
  │  1. Validate file type & size   │
  │  2. Compute SHA-256 hash        │
  │  3. Dedup check (same hash →    │
  │     skip re-indexing)           │
  └──────────────┬──────────────────┘
                 │
                 │  asyncio.create_task()
                 │  (runs in background, non-blocking)
                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │  services/indexing_job_service.py                           │
  │                                                             │
  │  Job statuses: pending → running → done | failed           │
  │  Stored in MongoDB: collection "indexing_jobs"              │
  │                                                             │
  │  ┌──────────────────────────────────────────────────────┐   │
  │  │  Step 1: Extract raw text                            │   │
  │  │                                                      │   │
  │  │  PDF  ──→  PyMuPDF (fitz)  ──→  plain text          │   │
  │  │  DOCX ──→  python-docx     ──→  plain text          │   │
  │  │  TXT  ──→  direct read     ──→  plain text          │   │
  │  └──────────────────────┬───────────────────────────────┘   │
  │                         │                                   │
  │  ┌──────────────────────▼───────────────────────────────┐   │
  │  │  Step 2: Chunking (LangChain Text Splitter)          │   │
  │  │                                                      │   │
  │  │  RecursiveCharacterTextSplitter                      │   │
  │  │  chunk_size    = 800 tokens                          │   │
  │  │  chunk_overlap = 120 tokens                          │   │
  │  │  separators: ["\n\n", "\n", ". ", " ", ""]           │   │
  │  │                                                      │   │
  │  │  Input: "This is section A.  This is section B..."   │   │
  │  │                   │                                  │   │
  │  │                   ▼                                  │   │
  │  │  Output: ["This is section A.",                      │   │
  │  │           "section A.  This is section B.",   ←overlap│   │
  │  │           "This is section B..."]                   │   │
  │  └──────────────────────┬───────────────────────────────┘   │
  │                         │                                   │
  │  ┌──────────────────────▼───────────────────────────────┐   │
  │  │  Step 3: Embedding (HuggingFace Sentence-Transformers│   │
  │  │                                                      │   │
  │  │  Model: all-MiniLM-L6-v2 (default)                   │   │
  │  │  Runs LOCALLY — no external API call                 │   │
  │  │  Each chunk → 384-dim float vector                   │   │
  │  │                                                      │   │
  │  │  "This is section A." → [0.12, -0.34, ..., 0.09]    │   │
  │  └──────────────────────┬───────────────────────────────┘   │
  │                         │                                   │
  │  ┌──────────────────────▼───────────────────────────────┐   │
  │  │  Step 4: Store in ChromaDB                           │   │
  │  │                                                      │   │
  │  │  Path: generated/vectorstore/courses/<course_id>/    │   │
  │  │  Collection: "course_<course_id>"                    │   │
  │  │  Stored per chunk: vector, text, metadata            │   │
  │  │  (page_num, char_start, char_end, chunk_id)          │   │
  │  └──────────────────────────────────────────────────────┘   │
  └─────────────────────────────────────────────────────────────┘
                 │
                 │  Job status → MongoDB "indexing_jobs"
                 │  File asset → MongoDB "file_assets"
                 ▼
         Teacher sees "Indexed ✓"


═══════════════════════════════════════════════════════════════════════════════
 PHASE 2 — RETRIEVAL  (Student asks a question)
═══════════════════════════════════════════════════════════════════════════════

  Student (Browser)
       │
       │  POST /api/ai/chat
       │  { messages: [...], provider: "coze" | "local_ollama" }
       ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │  routes/ai_routes/chat.py                                        │
  │                                                                  │
  │  1. Parse & validate request                                     │
  │  2. Load user AI memory from MongoDB (name, major, year, prefs)  │
  │  3. Detect role: student → RAG mode, teacher → direct mode       │
  └──────────────────────────┬───────────────────────────────────────┘
                             │  role == "student"
                             ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │  routes/ai_routes/rag_orchestrator.py → run_student_rag()        │
  │                                                                  │
  │  ┌─────────────────────────────────────────────────────────┐     │
  │  │  Step A: Query Rewriting (Ollama llama3.2)              │     │
  │  │                                                         │     │
  │  │  Original:  "what's covered in chapter 3?"             │     │
  │  │  Rewritten: "chapter 3 topics main concepts overview"  │     │
  │  │                                                         │     │
  │  │  Purpose: expand query for better retrieval precision   │     │
  │  │  Falls back to original on LLM error                    │     │
  │  └───────────────────────┬─────────────────────────────────┘     │
  │                          │  rewritten query                      │
  │            ┌─────────────┴──────────────┐                        │
  │            │                            │                        │
  │            ▼                            ▼                        │
  │  ┌──────────────────┐        ┌──────────────────────┐            │
  │  │  Vector RAG       │        │   TF-IDF RAG          │           │
  │  │  (semantic)       │        │   (keyword)           │           │
  │  │                  │        │                       │            │
  │  │  HuggingFace     │        │  sklearn TfidfVec-   │            │
  │  │  embed query →   │        │  torizer on chunks   │            │
  │  │  ChromaDB        │        │  cosine_similarity   │            │
  │  │  cosine search   │        │  min_score ≥ 0.02    │            │
  │  │  top-N chunks    │        │  top-N chunks         │           │
  │  └────────┬─────────┘        └──────────┬────────────┘           │
  │           │                             │                        │
  │           └──────────────┬──────────────┘                        │
  │                          │  merge results                        │
  │                          ▼                                       │
  │  ┌─────────────────────────────────────────────────────────┐     │
  │  │  RRF Merge + Re-rank                                    │     │
  │  │  (Reciprocal Rank Fusion)                               │     │
  │  │                                                         │     │
  │  │  Combines both result sets by rank position:            │     │
  │  │  score = Σ  1 / (k + rank_i)   where k=60              │     │
  │  │  Deduplicates by text content                           │     │
  │  │  Returns top RAG_ANSWER_TOP_K chunks (default: 5)       │     │
  │  └───────────────────────┬─────────────────────────────────┘     │
  │                          │                                       │
  │  ┌───────────────────────▼─────────────────────────────────┐     │
  │  │  Retry Logic                                             │     │
  │  │                                                          │     │
  │  │  If retrieved chunks are insufficient (score too low):  │     │
  │  │  → broaden query, retry retrieval once                  │     │
  │  │  → set rag_retry_used = True in response metadata       │     │
  │  └───────────────────────┬─────────────────────────────────┘     │
  └──────────────────────────┬───────────────────────────────────────┘
                             │  RAG context (top-5 chunks + citations)
                             ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │  services/rag_chat_pipeline.py → pack_evidence()                 │
  │                                                                  │
  │  Builds structured evidence cards:                               │
  │  [                                                               │
  │    { chunk_id: 3, score: 0.87, page: 2,                         │
  │      text: "Newton's second law states F=ma..." },               │
  │    { chunk_id: 7, score: 0.79, page: 5, text: "..." },           │
  │    ...up to 5 chunks, max 600 chars each                         │
  │  ]                                                               │
  │  Total evidence capped at max_total_chars to control cost       │
  └──────────────────────────┬───────────────────────────────────────┘
                             │  inject into LLM context
                             ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │  routes/ai_routes/chat_providers.py → generate_chat_response()  │
  │                                                                  │
  │  Builds final prompt:                                            │
  │  ┌────────────────────────────────────────────────────────────┐  │
  │  │  [System]  You are a Socratic tutor. Use only the evidence │  │
  │  │            below. Guide the student; don't give answers     │  │
  │  │            directly.                                        │  │
  │  │  [Context] Student: { name, major, year, preferences }     │  │
  │  │  [RAG Evidence]                                            │  │
  │  │    Chunk 3 (page 2, score 0.87): "Newton's..."            │  │
  │  │    Chunk 7 (page 5, score 0.79): "..."                     │  │
  │  │  [Chat History] last 6 turns                               │  │
  │  │  [User] "what's covered in chapter 3?"                    │  │
  │  └────────────────────────────────────────────────────────────┘  │
  │                                                                  │
  │  → routes to Coze API or Ollama based on resolved_provider      │
  └──────────────────────────┬───────────────────────────────────────┘
                             │  streaming SSE response
                             ▼
                    Student Browser
                    (typewriter animation)
```

---

## 2. Component File Map

```
INDEXING PATH
─────────────────────────────────────────────────────────────────────
  routes/ai_routes/index_course.py          ← HTTP endpoint, auth, dedup
  services/indexing_job_service.py          ← async job runner + MongoDB status
  services/course_rag_service/
    ├── service.py                          ← CourseRagService class
    ├── chunking.py                         ← RecursiveCharacterTextSplitter wrapper
    ├── retrieval_helpers.py                ← doc_hash, rerank_results, rrf_merge
    └── types.py                            ← shared types
  generated/vectorstore/courses/<id>/       ← ChromaDB persistent store (on disk)
  MongoDB: collection "indexing_jobs"       ← job status tracking
  MongoDB: collection "file_assets"         ← file registration

RETRIEVAL PATH
─────────────────────────────────────────────────────────────────────
  routes/ai_routes/chat.py                  ← main /chat endpoint, role detection
  routes/ai_routes/rag_orchestrator.py      ← run_student_rag(), query rewrite
  services/rag_chat_pipeline.py             ← build_rewrite_prompt, pack_evidence
  services/vector_rag_service.py            ← LangChainRagService (ChromaDB search)
  services/tfidf_rag_service.py             ← LocalRagService (TF-IDF search)
  routes/ai_routes/helpers.py               ← _build_evidence_cards, compact history
  routes/ai_routes/chat_providers.py        ← final LLM call routing
  routes/ai_routes/chat_streaming.py        ← SSE output formatters
```

---

## 3. Chunking Strategy

```
  Raw Document Text (e.g. 50,000 chars)
  ┌──────────────────────────────────────────────────────────┐
  │  Lorem ipsum chapter 1 ... [page break] ... chapter 2   │
  └──────────────────────────────────────────────────────────┘
                    │
                    │  RecursiveCharacterTextSplitter
                    │  Priority separators: \n\n → \n → ". " → " " → ""
                    ▼
  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
  │ Chunk 0 │  │ Chunk 1 │  │ Chunk 2 │  │ Chunk N │
  │ 800 tok │  │ 800 tok │  │ 800 tok │  │ 800 tok │
  │         │  │         │  │         │  │         │
  │         │◄─┤overlap  │◄─┤overlap  │  │         │
  │←────────│──│─120 tok─│──│─120 tok─│  │         │
  └─────────┘  └─────────┘  └─────────┘  └─────────┘

  Each chunk stores:
  { text, chunk_id, page_num, char_start, char_end }
```

---

## 4. Dual Retrieval + RRF Merge

```
                    User Query (rewritten)
                            │
              ┌─────────────┴──────────────┐
              │                            │
              ▼                            ▼
   ┌─────────────────────┐      ┌──────────────────────┐
   │   Vector Search      │      │   TF-IDF Search       │
   │   (ChromaDB)         │      │   (sklearn)           │
   │                     │      │                      │
   │  embed query         │      │  tokenize query      │
   │  → 384-dim vector    │      │  → term freq matrix  │
   │  cosine similarity   │      │  cosine_similarity   │
   │  against all chunks  │      │  against chunk corpus│
   │                     │      │                      │
   │  Result set V:       │      │  Result set T:       │
   │  [(chunk_5, 0.91),   │      │  [(chunk_5, 0.73),   │
   │   (chunk_3, 0.87),   │      │   (chunk_12, 0.68),  │
   │   (chunk_7, 0.79)]   │      │   (chunk_3, 0.61)]   │
   └──────────┬──────────┘      └──────────┬────────────┘
              │                            │
              └────────────┬───────────────┘
                           ▼
                  RRF Merge formula:
            score(d) = 1/(60 + rank_V(d))
                     + 1/(60 + rank_T(d))

         Results after merge (deduplicated):
         ┌────────────────────────────────┐
         │  chunk_5   RRF = 0.032 + 0.029 = 0.061  ← rank 1 │
         │  chunk_3   RRF = 0.029 + 0.025 = 0.054  ← rank 2 │
         │  chunk_12  RRF = 0.000 + 0.028 = 0.028  ← rank 3 │
         │  chunk_7   RRF = 0.028 + 0.000 = 0.028  ← rank 4 │
         └────────────────────────────────┘
                           │
                 Top-5 chunks passed to
                 pack_evidence() and injected
                 into the final LLM prompt
```

---

## 5. RAG Telemetry

```
  Every RAG retrieval records to MongoDB ("rag_telemetry"):
  {
    user_id, course_ids,
    query (original + rewritten),
    retrieval_latency_ms,
    chunks_retrieved (count),
    top_score,
    rag_retry_used,   ← was a retry needed?
    rag_empty_after_retry,
    provider,
    timestamp
  }

  Admin can view RAG evaluation via:
  routes/admin_routes/rag_eval.py   ← /api/admin/rag-eval
  services/rag_eval_service.py      ← aggregated stats
```

---

## 6. Teacher vs Student Mode

```
  Request arrives at POST /api/ai/chat
               │
               ▼
    ┌──────────────────────┐
    │  get_current_user()  │
    │  role = "student"    │
    │       or "teacher"   │
    └──────────┬───────────┘
               │
        ┌──────┴──────┐
        │             │
  role = student    role = teacher / admin
        │             │
        ▼             ▼
  Socratic mode    Direct mode
  RAG active       No RAG
  Guided hints     Full answer
  Memory injected  Memory injected
        │             │
        └──────┬───────┘
               │
               ▼
      AIGatewayService
      (Coze or Ollama)
```

---

*Generated: 2026-04-12*
