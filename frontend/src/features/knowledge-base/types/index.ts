import type { IndexedDoc } from '../../../api/knowledgeBaseApi';

export interface ChapterDraft {
    chapter_name: string;
    chapter_order: number;
    description: string;
}

export interface UploadTask {
    taskId: string;
    file: File;
    progress: number;
    status: 'uploading' | 'indexing' | 'done' | 'error';
    phase?: string;
    error?: string;
    chunkCount?: number;
    parserUsed?: string;
    qualityReport?: Record<string, unknown>;
    phaseTimings?: Record<string, number>;
    indexVersion?: string;
    artifactRefs?: Array<{ kind: string; file_id?: string; storage_path?: string }>;
}

export interface DocumentManagerProps {
    courseId: string;
    courseName: string;
    documents: IndexedDoc[];
    loadingDocs: boolean;
    uploadTasks: UploadTask[];
    deletingDoc: string | null;
    onUploadFile: (file: File) => void;
    onDeleteDoc: (docName: string) => void;
    onDismissUploadTasks: () => void;
    uploading: boolean;
    chapters: any[];
    selectedChapterId: string;
    onSelectChapter: (chapterId: string) => void;
    onCreateChapter: (chapterName: string, description?: string) => Promise<void>;
    onUpdateChapter: (
        chapterId: string,
        payload: Partial<Pick<ChapterDraft, 'chapter_name' | 'chapter_order' | 'description'>>,
    ) => Promise<void>;
    onDeleteChapter: (chapterId: string) => Promise<void>;
    onReassignDocChapter: (docName: string, chapterId: string) => void;
    useFastExtract: boolean;
    onToggleExtractMode: () => void;
    indexProfile: 'auto' | 'quality' | 'fast';
    parserStrategy: 'auto' | 'docling' | 'marker' | 'fast';
    forceReindex: boolean;
    onChangeIndexProfile: (value: 'auto' | 'quality' | 'fast') => void;
    onChangeParserStrategy: (value: 'auto' | 'docling' | 'marker' | 'fast') => void;
    onToggleForceReindex: () => void;
}

export type RetrievalResult = {
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
};

export type RetrievalPlan = {
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
};

export type RetrievalTraceItem = {
    stage: string;
    count?: number;
    query?: string;
    queries?: string[];
    latency_ms?: number;
    plan?: RetrievalPlan;
};

export type RetrievalConfidence = {
    label?: 'confident' | 'ambiguous' | 'incorrect';
    score?: number;
    coverage?: number;
    score_margin?: number;
    source_agreement?: number;
    filter_satisfaction?: number;
    source_diversity?: number;
};

export type EvidenceSpan = {
    doc_name: string;
    page_start?: number;
    page_end?: number;
    chunk_id?: number;
    section_path?: string;
    sentence_offsets?: Array<[number, number]>;
    source_type?: string;
    confidence?: number;
    retrieval_sources?: string[];
};
