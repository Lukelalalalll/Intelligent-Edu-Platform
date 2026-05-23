import client from '@/shared/api/client';

/* ── Course / Document listing ─────────────────────────────── */

export interface RagCourse {
    course_id: string;
    name: string;
    doc_count: number;
}

export interface RagDoc {
    doc_name: string;
    chunk_count: number;
    indexed_at: string;
    chapter_id: string;
}

export async function listCourses(): Promise<RagCourse[]> {
    const { data } = await client.get('/admin/rag-eval/courses');
    return data.courses;
}

export async function listDocs(courseId: string): Promise<RagDoc[]> {
    const { data } = await client.get('/admin/rag-eval/docs', { params: { course_id: courseId } });
    return data.docs;
}

/* ── AI question generation ────────────────────────────────── */

export interface GeneratedQuestion {
    id: string;
    query: string;
    course_ids: string[];
    expected_doc_names: string[];
    expected_keywords: string[];
}

export async function generateQuestions(
    courseId: string,
    docNames: string[],
    nQuestions: number,
    topicHint?: string,
    provider: 'coze' | 'local_ollama' | 'deepseek' = 'local_ollama',
): Promise<GeneratedQuestion[]> {
    const { data } = await client.post('/admin/rag-eval/generate-questions', {
        course_id: courseId,
        doc_names: docNames,
        n_questions: nQuestions,
        topic_hint: topicHint,
        provider,
    });
    return data.questions;
}

/* ── A/B Evaluation ────────────────────────────────────────── */

export type EvalMode = 'hybrid' | 'vector' | 'comparison';

export interface EvalChunk {
    doc: string;
    score: number;
    preview: string;
    correct?: boolean;
}

export interface EvalDetail {
    id: string;
    query: string;
    hit: boolean;
    invalid?: boolean;
    degenerate?: boolean;
    expected_doc_names?: string[];
    expected_keywords?: string[];
    retrieved_count: number;
    correct_citations: number;
    latency_ms?: number;
    chunks: EvalChunk[];
}

export interface ModeResult {
    label: string;
    total: number;
    evaluable_total?: number;
    top_k: number;
    hit_rate: number;
    citation_correct_rate: number;
    empty_retrieval_rate: number;
    mrr: number;
    avg_latency_ms?: number;
    p50_latency_ms?: number;
    p95_latency_ms?: number;
    counts: {
        hit: number;
        empty: number;
        invalid?: number;
        degenerate?: number;
        correct_citations: number;
        total_citations: number;
    };
    details: EvalDetail[];
}

export interface ComparisonDelta {
    hit_rate_delta: number;
    citation_rate_delta: number;
    empty_rate_delta: number;
    mrr_delta: number;
}

export interface EvalABResult {
    hybrid?: ModeResult;
    vector?: ModeResult;
    comparison?: ComparisonDelta;
    run_id?: string;
}

export interface TestCase {
    id?: string;
    query: string;
    course_ids: string[];
    expected_doc_names: string[];
    expected_keywords: string[];
}

export async function evaluateAB(
    dataset: TestCase[],
    topK: number,
    mode: EvalMode,
    selectedDocs?: string[],
): Promise<EvalABResult> {
    const { data } = await client.post('/admin/rag-eval/evaluate-ab', {
        dataset,
        top_k: topK,
        mode,
        selected_docs: selectedDocs ?? [],
    });
    return data;
}