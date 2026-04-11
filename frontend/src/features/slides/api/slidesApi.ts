/**
 * slidesApi — unified Slides (Sub1) API client.
 * Merges slidesDeliveryApi, slidesGenerationApi, and slidesHistoryApi.
 */
import client from '../../../api/client';
import type { AIProvider } from '../../../shared/aiProvider';
import type { GenerationHistoryItem } from '../../../types/api';

// ── Delivery Types ──

export type DeliveryArtifactType = 'agenda' | 'speaker_notes' | 'in_class_questions' | 'homework_suggestions';

export interface SlidesDeliveryPayload {
    provider?: AIProvider;
    title: string;
    ppt_schema: Record<string, unknown>;
    script_style?: string;
    locale?: string;
}

export interface SlidesDeliveryPreview {
    agenda_count: number;
    speaker_notes_count: number;
    in_class_questions_count: number;
    homework_count: number;
}

export interface SlidesDeliveryJobResponse {
    success: boolean;
    job_id: string;
    status: string;
    slides_count: number;
    artifacts_preview: SlidesDeliveryPreview;
}

export interface SlidesDeliveryJob {
    job_id: string;
    title: string;
    status: string;
    locale: string;
    script_style: string;
    slides_count: number;
    created_at?: string;
    updated_at?: string;
}

export interface SlidesArtifactResponse<T = unknown> {
    success: boolean;
    job_id: string;
    artifact_type: DeliveryArtifactType;
    data: T;
}

// ── Generation Types ──

export type SlidesGenerateV2Payload = {
    provider?: 'coze' | 'local_ollama';
    content?: string;
    chapterData?: Array<{ sectionTitle?: string; text?: string }>;
    total_pages: number;
    num_of_bullets: number;
    words_each_bullet: number;
    presentation_title?: string;
    script_style?: string;
    generate_talking_script?: boolean;
    generate_word_document?: boolean;
};

export type SlidesGenerateV2TaskCreateResponse = {
    success: boolean;
    task_id: string;
    status: 'queued' | 'running' | 'completed' | 'failed';
    request_id: string;
};

export type SlidesGenerateV2TaskStatusResponse = {
    success: boolean;
    task_id: string;
    status: 'queued' | 'running' | 'completed' | 'failed';
    current_step: string;
    progress: number;
    request_id: string;
    result?: {
        status: 'success';
        results: Array<{
            slide_number: number;
            title: string;
            content: string[];
            latex?: string[];
            chart_type?: string;
            chart_reasoning?: string[];
        }>;
        ppt_schema: {
            presentation_title: string;
            slides: Array<Record<string, unknown>>;
            metadata?: Record<string, unknown>;
        };
        provider: 'coze' | 'local_ollama';
        total_scripts?: number;
        estimated_total_duration?: string;
        word_document?: {
            available: boolean;
            filename: string;
            download_url: string;
        };
    };
    error?: string;
    events?: Array<{
        type: string;
        step: string;
        message: string;
        ts: number;
        payload?: Record<string, unknown>;
    }>;
};

// ── Delivery API ──

export const slidesDeliveryApi = {
    createJob: async (payload: SlidesDeliveryPayload): Promise<SlidesDeliveryJobResponse> => {
        const res = await client.post('/slides/delivery/jobs', payload);
        return res.data;
    },
    getJob: async (jobId: string): Promise<{ success: boolean; job: SlidesDeliveryJob }> => {
        const res = await client.get(`/slides/delivery/jobs/${jobId}`);
        return res.data;
    },
    getArtifact: async <T = unknown>(jobId: string, artifactType: DeliveryArtifactType): Promise<SlidesArtifactResponse<T>> => {
        const res = await client.get(`/slides/delivery/jobs/${jobId}/artifact/${artifactType}`);
        return res.data;
    },
};

// ── Generation API ──

export const slidesGenerationApi = {
    async createTask(payload: SlidesGenerateV2Payload): Promise<SlidesGenerateV2TaskCreateResponse> {
        const res = await client.post('/slides/generate_v2', payload);
        return res.data;
    },
    async getTask(taskId: string): Promise<SlidesGenerateV2TaskStatusResponse> {
        const res = await client.get(`/slides/tasks/${taskId}`);
        return res.data;
    },
    async checkProviderHealth(provider?: 'coze' | 'local_ollama') {
        const res = await client.get('/slides/provider-health', {
            params: provider ? { provider } : undefined,
        });
        return res.data;
    },
};

// ── History API (factory-based) ──

import { createHistoryApi } from '../../../api/historyApiFactory';

const _historyApi = createHistoryApi<GenerationHistoryItem>('/slides');
export const { getGenerationHistory, getGenerationDetail, replayGeneration } = _historyApi;
