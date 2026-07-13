import client from '@/shared/api/client';
import type { AIProvider } from '../../../shared/aiProvider';

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
    provider: AIProvider = 'local_ollama',
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

export interface RetrievalTraceItem {
    stage: string;
    count?: number;
    query?: string;
    queries?: string[];
    latency_ms?: number;
}

export interface RetrievalConfidence {
    label?: 'confident' | 'ambiguous' | 'incorrect';
    score?: number;
    coverage?: number;
    score_margin?: number;
    source_agreement?: number;
    filter_satisfaction?: number;
    source_diversity?: number;
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
    retrieval_plan?: {
        query_class?: string;
        retrieval_profile?: string;
        decomposed_queries?: string[];
    };
    retrieval_trace?: RetrievalTraceItem[];
    retrieval_confidence?: RetrievalConfidence;
    fallback_reason?: string;
    evidence_spans?: Array<{
        doc_name: string;
        page_start?: number;
        page_end?: number;
        chunk_id?: number;
        section_path?: string;
        source_type?: string;
        confidence?: number;
    }>;
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
    ragProfile: 'low-latency' | 'balanced' | 'high-recall' = 'balanced',
    debugRetrieval: boolean = false,
    allowWebCorrection: boolean = false,
    forceQueryClass: '' | 'keyword/factoid' | 'concept/explanation' | 'comparison' | 'multi-hop' | 'chapter/doc constrained' | 'out-of-domain' = '',
): Promise<EvalABResult> {
    const { data } = await client.post('/admin/rag-eval/evaluate-ab', {
        dataset,
        top_k: topK,
        mode,
        selected_docs: selectedDocs ?? [],
        rag_profile: ragProfile,
        debug_retrieval: debugRetrieval,
        allow_web_correction: allowWebCorrection,
        force_query_class: forceQueryClass,
    });
    return data;
}
