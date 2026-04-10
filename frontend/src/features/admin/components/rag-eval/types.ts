export type Tab = 'overview' | 'datasets' | 'runs' | 'case-test' | 'compare';

export interface RAGStats {
    period_hours: number;
    total: number;
    empty_retrieval_rate?: number;
    avg_latency_ms?: number;
    p50_latency_ms?: number;
    p95_latency_ms?: number;
    avg_result_count?: number;
    hybrid_pct?: number;
}

export interface RAGAlert {
    rule: string;
    severity: string;
    message: string;
    value: number;
    threshold: number;
}

export interface CourseBreakdownItem {
    course_id: string;
    total: number;
    empty_count: number;
    empty_rate: number;
    avg_latency_ms: number;
}
