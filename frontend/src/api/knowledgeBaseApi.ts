import client from '@/shared/api/client';

export interface IndexedDoc {
    doc_name: string;
    chunk_count: number;
    indexed_at: string;
    chapter_id?: string;
    parser_used?: string;
    page_count?: number;
    node_counts?: Record<string, number>;
    quality_status?: string;
    index_version?: string;
}

export interface DocumentArtifactRef {
    kind: string;
    file_id?: string;
    storage_path?: string;
}

export interface DocumentDiagnostics {
    job_id?: string;
    course_id?: string;
    doc_name?: string;
    parser_used?: string;
    parser_strategy?: string;
    fallback_chain?: string[];
    quality_report?: Record<string, unknown>;
    artifact_refs?: DocumentArtifactRef[];
    index_version?: string;
    updated_at?: string;
    reused_from_job_id?: string;
}

export interface IndexCourseSummary {
    course_id: string;
    doc_count: number;
    total_chunks: number;
    active_index_version?: string;
}

export interface CourseInfo {
    id: string;
    courseId: string;
    name: string;
    semester: string;
}

export interface RetrievalResult {
    course_id: string;
    text: string;
    score: number;
    doc_name: string;
    chapter_id?: string;
    heading_path?: string;
    page_start?: number;
    page_end?: number;
    node_type?: string;
    element_type?: string;
    parser_used?: string;
    token_count?: number;
    index_version?: string;
    retrieval_score?: number;
    rerank_score?: number;
    parent_expanded?: boolean;
    active_index_version?: string;
    retrieval_sources?: string[];
    source_rank?: number;
    source_type?: string;
    section_path?: string;
    lexical_overlap?: number;
    fusion_score?: number;
    ce_score?: number;
}

export interface RetrievalPlan {
    query_class?: string;
    decomposed_queries?: string[];
    metadata_filters?: Record<string, unknown>;
    retrieval_profile?: string;
    web_fallback_policy?: string;
    allow_multi_query?: boolean;
    allow_hyde?: boolean;
    use_hybrid?: boolean;
    use_late_interaction?: boolean;
    notes?: string[];
}

export interface RetrievalTraceItem {
    stage: string;
    count?: number;
    query?: string;
    queries?: string[];
    latency_ms?: number;
    plan?: RetrievalPlan;
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

export interface EvidenceSpan {
    doc_name: string;
    page_start?: number;
    page_end?: number;
    chunk_id?: number;
    section_path?: string;
    sentence_offsets?: Array<[number, number]>;
    source_type?: string;
    confidence?: number;
    retrieval_sources?: string[];
}

export interface TestRetrievalResponse {
    query: string;
    course_id: string;
    top_k: number;
    debug: boolean;
    rag_profile?: string;
    debug_retrieval?: boolean;
    allow_web_correction?: boolean;
    force_query_class?: string;
    active_index_version: string;
    latency_ms: number;
    results: RetrievalResult[];
    retrieval_plan?: RetrievalPlan;
    retrieval_trace?: RetrievalTraceItem[];
    retrieval_confidence?: RetrievalConfidence;
    fallback_reason?: string;
    evidence_spans?: EvidenceSpan[];
}

export const knowledgeBaseApi = {
    getCourses: (): Promise<{ role: string; semester: string; courses: CourseInfo[] }> =>
        client.get('/profile/courses').then(r => r.data),

    getSummary: (): Promise<{ courses: IndexCourseSummary[] }> =>
        client.get('/ai/index-course/summary').then(r => r.data),

    listDocs: (courseId: string): Promise<{ course_id: string; documents: IndexedDoc[] }> =>
        client.get(`/ai/index-course/${encodeURIComponent(courseId)}`).then(r => r.data),

    uploadDoc: (
        courseId: string,
        file: File,
        chapterId?: string,
        onProgress?: (pct: number) => void,
        useFastExtract?: boolean,
        indexProfile: 'auto' | 'quality' | 'fast' = 'quality',
        parserStrategy: 'auto' | 'docling' | 'marker' | 'fast' = 'auto',
        forceReindex?: boolean,
    ): Promise<{ job_id: string; status: string; filename: string; content_hash: string; index_profile?: string; parser_strategy?: string }> => {
        const formData = new FormData();
        formData.append('file', file);
        if (chapterId) formData.append('chapter_id', chapterId);
        if (useFastExtract) formData.append('use_fast_extract', 'true');
        formData.append('index_profile', indexProfile);
        formData.append('parser_strategy', parserStrategy);
        if (forceReindex) formData.append('force_reindex', 'true');
        return client
            .post(`/ai/index-course/${encodeURIComponent(courseId)}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (e) => {
                    if (e.total && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
                },
            })
            .then(r => r.data);
    },

    getJobStatus: (jobId: string): Promise<{
        job_id: string;
        status: string;
        progress?: number;
        phase?: string;
        error?: string;
        result?: { indexed: boolean; chunk_count?: number; reason?: string; index_version?: string };
        parser_used?: string;
        fallback_chain?: string[];
        quality_report?: Record<string, unknown>;
        phase_timings?: Record<string, number>;
        index_version?: string;
        artifact_refs?: DocumentArtifactRef[];
        normalized_hash?: string;
        index_profile?: string;
        parser_strategy?: string;
    }> =>
        client.get(`/ai/index-course/job/${encodeURIComponent(jobId)}`).then(r => r.data),

    removeDoc: (courseId: string, docName: string): Promise<{ ok: boolean }> =>
        client
            .delete(`/ai/index-course/${encodeURIComponent(courseId)}/${encodeURIComponent(docName)}`)
            .then(r => r.data),

    getDocDiagnostics: (courseId: string, docName: string): Promise<DocumentDiagnostics> =>
        client.get(`/ai/index-course/${encodeURIComponent(courseId)}/${encodeURIComponent(docName)}/diagnostics`).then(r => r.data),

    testRetrieval: (
        courseId: string,
        query: string,
        chapterId: string = '',
        topK: number = 5,
        debug: boolean = false,
        ragProfile: 'low-latency' | 'balanced' | 'high-recall' = 'balanced',
        debugRetrieval: boolean = false,
        allowWebCorrection: boolean = false,
        forceQueryClass: '' | 'keyword/factoid' | 'concept/explanation' | 'comparison' | 'multi-hop' | 'chapter/doc constrained' | 'out-of-domain' = '',
    ): Promise<TestRetrievalResponse> =>
        client
            .post(`/ai/index-course/${encodeURIComponent(courseId)}/test-retrieval`, {
                query,
                top_k: topK,
                chapter_id: chapterId,
                debug,
                rag_profile: ragProfile,
                debug_retrieval: debugRetrieval,
                allow_web_correction: allowWebCorrection,
                force_query_class: forceQueryClass,
            })
            .then(r => r.data),
};
