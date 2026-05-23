/**
 * Sub2 (Question Generator) API client layer.
 * Centralizes all sub2 backend calls with consistent error handling.
 *
 * Request body types are sourced from the auto-generated schema (src/types/schema.d.ts).
 * Response types reuse established interfaces from src/types/api.ts because the
 * FastAPI routes return untyped `unknown` in the OpenAPI spec.
 * Regenerate schema with: npm run openapi:sync
 */
import client from '@/shared/api/client';
import type { components, operations } from '../types/generated/schema';
import type {
    Sub2UploadResponse,
    Sub2ExtractResponse,
    Sub2GenerateResponse,
    GenerationHistoryItem,
} from '../types/api';

// ── Derived request-body types from generated schema ─────────────────────────
type ExtractPayload = components['schemas']['ExtractQuestionsSchema'];
type ScreenshotPayload = components['schemas']['UploadScreenshotSchema'];
type HistoryParams = NonNullable<
    operations['get_generation_history_api_sub2_generation_history_get']['parameters']['query']
>;

export interface GeneratePayload {
    provider?: 'coze' | 'local_ollama' | 'deepseek';
    task_id: string;
    question_type: string;
    num_questions: number;
    difficulty: number | string;
    constraints?: string[];
    output_language?: string;
    source_type: 'pdf' | 'screenshot_set';
    page_numbers?: number[];
    saved_screenshots?: string[];
    // backward compatibility fields (ignored by backend if provided by stale clients)
    subject?: string;
    question_basis?: string | null;
    knowledge_points?: string;
}

export interface SuggestConstraintsPayload {
    provider?: 'coze' | 'local_ollama' | 'deepseek';
    task_id: string;
    source_type: 'pdf' | 'screenshot_set';
    page_numbers?: number[];
    question_type: string;
    num_questions: number;
    difficulty: number | string;
    output_language: string;
}

export interface SuggestConstraintsResponse {
    success: boolean;
    suggestions?: string[];
    error?: string;
}

export async function uploadFile(file: File): Promise<Sub2UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await client.post('/questions/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
}

export async function extractQuestions(
    payload: ExtractPayload,
): Promise<Sub2ExtractResponse> {
    const res = await client.post('/questions/extract_questions', payload);
    return res.data;
}

export async function generateQuestions(
    payload: GeneratePayload,
): Promise<Sub2GenerateResponse> {
    const res = await client.post('/questions/generate_questions', payload);
    return res.data;
}

export async function suggestConstraints(
    payload: SuggestConstraintsPayload,
): Promise<SuggestConstraintsResponse> {
    const res = await client.post('/questions/suggest_constraints', payload);
    return res.data;
}

export async function exportQuestions(taskId: string | null): Promise<Blob> {
    const params: { task_id?: string } = taskId ? { task_id: taskId } : {};
    const res = await client.post('/questions/export_questions', {}, { params, responseType: 'blob' });
    return res.data;
}

export async function uploadScreenshot(
    payload: ScreenshotPayload,
): Promise<{ success: boolean; filename: string; error?: string }> {
    const res = await client.post('/questions/upload_screenshot', payload);
    return res.data;
}

// ── History API (factory-based) ──

import { createHistoryApi } from './historyApiFactory';

const _historyApi = createHistoryApi<GenerationHistoryItem>('/questions');
export const { getGenerationHistory, getGenerationDetail } = _historyApi;

export interface GenerationReplaySessionResponse {
    success: boolean;
    task_id: string;
    filename: string;
    file_type: string;
    total_pages: number;
    page_numbers?: number[];
    source_type?: 'pdf' | 'screenshot_set';
    error?: string;
}

export async function replayGenerationHistory(historyId: string): Promise<GenerationReplaySessionResponse> {
    const res = await client.post(`/questions/generation_history/${historyId}/replay`);
    return res.data;
}
