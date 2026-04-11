/**
 * studyNotesApi — unified Study Notes (Sub5) API client.
 * Merges studyNotesPlanApi and studyNotesHistoryApi.
 */
import client from './client';
import type { GenerationHistoryItem } from '../types/api';

// ── Types ──

export type StudyPlanDurationOption = '3d' | '7d' | '14d' | 'custom';
export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

export interface StudyPlanSession {
    session_id: string;
    day: number;
    focus: string;
    reading_minutes: number;
    review_minutes: number;
    practice_minutes: number;
    review_flashcards: Array<{ question?: string; answer?: string }>;
    queue_id?: string;
    status?: string;
}

export interface StudyPlan {
    plan_id: string;
    title: string;
    duration_days: number;
    duration_option?: StudyPlanDurationOption;
    custom_days?: number | null;
    sessions: StudyPlanSession[];
    created_at?: string;
    updated_at?: string;
}

export interface GenerateStudyPlanPayload {
    course_id?: string;
    title: string;
    notes: string;
    flashcards: Array<{ question?: string; answer?: string }>;
    duration_option: StudyPlanDurationOption;
    custom_days: number | null;
}

export interface GenerateStudyPlanResponse {
    success: boolean;
    plan_id: string;
    duration_days: number;
    sessions: StudyPlanSession[];
}

export interface ReviewQueueItem {
    queue_id: string;
    plan_id: string;
    due_at: string;
    status: 'scheduled' | 'pending' | 'completed' | string;
    repetitions: number;
    last_rating: ReviewRating | null;
    unit_index: number;
    focus: string;
    updated_at?: string;
}

export interface ReviewNextResponse {
    success: boolean;
    ready: boolean;
    item?: ReviewQueueItem;
    next_upcoming?: ReviewQueueItem;
    message?: string;
}

export interface SubmitReviewPayload {
    queue_id: string;
    rating: ReviewRating;
    correct: boolean;
}

export interface SubmitReviewResponse {
    success: boolean;
    queue_id: string;
    next_due_at: string;
    repetitions: number;
    status: string;
}

// ── Plan API ──

export const studyNotesPlanApi = {
    generatePlan: async (payload: GenerateStudyPlanPayload): Promise<GenerateStudyPlanResponse> => {
        const res = await client.post('/study-notes/plan/generate', payload);
        return res.data;
    },
    getPlan: async (planId: string): Promise<{ success: boolean; plan: StudyPlan }> => {
        const res = await client.get(`/study-notes/plan/${planId}`);
        return res.data;
    },
    getNextReview: async (planId?: string): Promise<ReviewNextResponse> => {
        const params = planId ? { plan_id: planId } : undefined;
        const res = await client.post('/study-notes/review/next', undefined, { params });
        return res.data;
    },
    submitReview: async (payload: SubmitReviewPayload): Promise<SubmitReviewResponse> => {
        const res = await client.post('/study-notes/review/submit', payload);
        return res.data;
    },
};

// ── History API ──

export async function getGenerationHistory(
    page = 1,
    pageSize = 10,
): Promise<{ items: GenerationHistoryItem[]; total: number }> {
    const res = await client.get('/study-notes/generation_history', {
        params: { page, page_size: pageSize },
    });
    return res.data;
}

export async function getGenerationDetail(
    historyId: string,
): Promise<GenerationHistoryItem> {
    const res = await client.get(`/study-notes/generation_history/${historyId}`);
    return res.data;
}

export async function replayGeneration(
    historyId: string,
): Promise<{ tool: string; params: Record<string, unknown>; data: Record<string, unknown> }> {
    const res = await client.post(`/study-notes/generation_history/${historyId}/replay`);
    return res.data;
}
