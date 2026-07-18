import client from '@/shared/api/client';

const QUESTION_API_PREFIX = '/sub2';

export interface QuestionOpsRunPayload {
    task_id?: string | null;
    course_id?: string | null;
    source_text?: string | null;
    dedupe_threshold?: number;
}

export interface QuestionOpsSummary {
    question_count: number;
    duplicate_count: number;
    avg_quality_score: number;
    after_dedupe_kept?: number;
    after_dedupe_removed?: number;
}

export interface QuestionOpsRun {
    run_id: string;
    status: string;
    dedupe_threshold: number;
    summary: QuestionOpsSummary;
    created_at?: string;
    updated_at?: string;
}

export interface QuestionOpsItem {
    run_id: string;
    item_id: string;
    question: string;
    quality_score: number;
    coverage_tags: string[];
    difficulty_estimate: 'low' | 'medium' | 'high' | string;
    is_duplicate: boolean;
    status: 'pending_review' | 'kept' | 'deduped' | string;
    created_at?: string;
    updated_at?: string;
}

export interface QuestionOpsRunResponse {
    success: boolean;
    run_id: string;
    status: string;
    summary: QuestionOpsSummary;
}

export interface QuestionOpsItemsResponse {
    success: boolean;
    items: QuestionOpsItem[];
    count: number;
}

export interface ApplyDedupePayload {
    dedupe_threshold: number;
}

export interface ApplyDedupeResponse {
    success: boolean;
    run_id: string;
    kept: number;
    removed: number;
    threshold: number;
}

export const questionOpsApi = {
    createRun: async (payload: QuestionOpsRunPayload): Promise<QuestionOpsRunResponse> => {
        const res = await client.post(`${QUESTION_API_PREFIX}/ops/runs`, payload);
        return res.data;
    },

    getRun: async (runId: string): Promise<{ success: boolean; run: QuestionOpsRun }> => {
        const res = await client.get(`${QUESTION_API_PREFIX}/ops/runs/${runId}`);
        return res.data;
    },

    getItems: async (runId: string): Promise<QuestionOpsItemsResponse> => {
        const res = await client.get(`${QUESTION_API_PREFIX}/ops/runs/${runId}/items`);
        return res.data;
    },

    applyDedupe: async (runId: string, payload: ApplyDedupePayload): Promise<ApplyDedupeResponse> => {
        const res = await client.post(`${QUESTION_API_PREFIX}/ops/runs/${runId}/apply-dedupe`, payload);
        return res.data;
    },
};
