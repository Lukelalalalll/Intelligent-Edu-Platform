import client from './client';

/* ── Dataset CRUD ─────────────────────────────────────────────── */

export async function listDatasets() {
    const { data } = await client.get('/admin/rag-eval/datasets');
    return data.datasets as DatasetSummary[];
}

export async function createDataset(name: string, cases: EvalCase[], description = '') {
    const { data } = await client.post('/admin/rag-eval/datasets', { name, cases, description });
    return data as Dataset;
}

export async function getDataset(datasetId: string) {
    const { data } = await client.get(`/admin/rag-eval/datasets/${datasetId}`);
    return data as Dataset;
}

export async function deleteDataset(datasetId: string) {
    await client.delete(`/admin/rag-eval/datasets/${datasetId}`);
}

/* ── Runs ─────────────────────────────────────────────────────── */

export async function startRun(datasetId: string, courseId: string, config: RunConfig = {}) {
    const { data } = await client.post('/admin/rag-eval/run', {
        dataset_id: datasetId,
        course_id: courseId,
        config,
    });
    return data as EvalRun;
}

export async function listRuns(limit = 50) {
    const { data } = await client.get('/admin/rag-eval/runs', { params: { limit } });
    return data.runs as EvalRun[];
}

export async function getRun(runId: string) {
    const { data } = await client.get(`/admin/rag-eval/run/${runId}`);
    return data as EvalRun & { results: EvalResult[] };
}

/* ── Case Test ────────────────────────────────────────────────── */

export async function caseTest(courseId: string, query: string, topK = 5, useHybrid = true) {
    const { data } = await client.post('/admin/rag-eval/case-test', {
        course_id: courseId,
        query,
        top_k: topK,
        use_hybrid: useHybrid,
    });
    return data as CaseTestResult;
}

/* ── Baseline ─────────────────────────────────────────────────── */

export async function setBaseline(runId: string, courseId: string) {
    const { data } = await client.post(`/admin/rag-eval/baseline/${runId}`, { course_id: courseId });
    return data;
}

export async function getBaseline(courseId: string) {
    const { data } = await client.get(`/admin/rag-eval/baseline/${courseId}`);
    return data as { baseline: any; run: EvalRun | null };
}

/* ── Compare ──────────────────────────────────────────────────── */

export async function compareRuns(baseRunId: string, targetRunId: string) {
    const { data } = await client.get('/admin/rag-eval/compare', {
        params: { base: baseRunId, target: targetRunId },
    });
    return data as CompareResult;
}

/* ── Types ────────────────────────────────────────────────────── */

export interface EvalCase {
    query: string;
    expected_doc_names?: string[];
    expected_course_id?: string;
}

export interface DatasetSummary {
    dataset_id: string;
    name: string;
    description: string;
    version: number;
    case_count: number;
    created_at: string;
}

export interface Dataset extends DatasetSummary {
    cases: EvalCase[];
}

export interface RunConfig {
    top_k?: number;
    use_hybrid?: boolean;
}

export interface EvalMetrics {
    case_count: number;
    hit_rate: number;
    empty_retrieval_rate: number;
    mrr: number;
    avg_latency_ms: number;
    p50_latency_ms: number;
    p95_latency_ms: number;
    total_latency_ms: number;
}

export interface EvalRun {
    run_id: string;
    dataset_id: string;
    dataset_name: string;
    course_id: string;
    config: RunConfig;
    metrics: EvalMetrics;
    triggered_by: string;
    started_at: string;
    finished_at: string;
}

export interface EvalResult {
    run_id: string;
    query: string;
    expected_doc_names: string[];
    retrieved_doc_names: string[];
    hit: boolean;
    latency_ms: number;
    top_k: number;
    retrieved: any[];
}

export interface CaseTestResult {
    query: string;
    course_id: string;
    top_k: number;
    use_hybrid: boolean;
    latency_ms: number;
    results: any[];
}

export interface MetricDiff {
    base: number;
    target: number;
    delta: number;
    pct_change: number;
}

export interface CompareResult {
    base_run_id: string;
    target_run_id: string;
    diff: Record<string, MetricDiff>;
}
