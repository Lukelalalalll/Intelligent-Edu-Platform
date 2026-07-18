import client from '@/shared/api/client';
import { resolveApiRoot } from '@/shared/api/root';
import type { AIProvider } from '@/shared/aiProvider';
import { createHistoryApi } from '../../../api/historyApiFactory';
import type {
    GenerationHistoryItem,
    QuestionDraft,
    QuestionHistoryDetail,
    Sub2ExtractResponse,
    Sub2GenerateResponse,
    Sub2UploadResponse,
} from '../../../types/api';

export interface ExtractPayload {
    provider?: AIProvider;
    task_id: string;
    page_numbers: number[];
    prompt: string;
}

export interface GeneratePayload {
    provider?: AIProvider;
    task_id?: string | null;
    source_text?: string;
    question_type: string;
    num_questions: number;
    difficulty: number | string;
    constraints?: string[];
    output_language?: string;
    source_type: 'pdf' | 'screenshot_set';
    page_numbers?: number[];
    saved_screenshots?: string[];
    subject?: string;
    question_basis?: string | null;
    knowledge_points?: string;
}

export interface SuggestConstraintsPayload {
    provider?: AIProvider;
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

export interface QuestionGenerationResponse extends Sub2GenerateResponse {
    markdown?: string;
    question_drafts?: QuestionDraft[];
    history_id?: string;
    task_id?: string;
    source_kind?: string;
    provider_source?: string;
    effective_model?: string;
}

export interface QuestionProviderStatus {
    id: AIProvider;
    label: string;
    available: boolean;
    configured: boolean;
    source: string;
    model: string;
    message: string;
    is_recommended: boolean;
}

export type QuestionGenerationStreamEvent =
    | { type: 'status'; phase: string; message: string }
    | { type: 'question'; index: number; question: QuestionDraft }
    | {
        type: 'complete';
        task_id: string;
        history_id: string;
        provider: string;
        provider_source?: string;
        effective_model?: string;
        markdown: string;
        question_drafts: QuestionDraft[];
        source_kind: string;
    }
    | { type: 'error'; message: string };

export interface QuestionExportPayload {
    questions: QuestionDraft[];
    format: 'markdown' | 'txt';
    filename?: string;
}

export interface QuestionHistoryFinalizePayload {
    questions: QuestionDraft[];
    markdown: string;
    selected_question_ids: string[];
}

const API_ROOT = resolveApiRoot();
const QUESTION_API_PREFIX = '/sub2';
const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';

function readCookie(name: string): string {
    if (typeof document === 'undefined') return '';
    const cookie = document.cookie
        .split('; ')
        .find((item) => item.startsWith(`${name}=`));
    return cookie ? decodeURIComponent(cookie.split('=').slice(1).join('=')) : '';
}

export async function uploadFile(file: File): Promise<Sub2UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await client.post(`${QUESTION_API_PREFIX}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
}

export async function extractQuestions(
    payload: ExtractPayload,
): Promise<Sub2ExtractResponse> {
    const res = await client.post(`${QUESTION_API_PREFIX}/extract_questions`, payload);
    return res.data;
}

export async function generateQuestions(
    payload: GeneratePayload,
): Promise<QuestionGenerationResponse> {
    const res = await client.post(`${QUESTION_API_PREFIX}/generate_questions`, payload);
    return res.data;
}

export async function streamGenerateQuestions(
    payload: GeneratePayload,
    onEvent: (event: QuestionGenerationStreamEvent) => void,
    signal?: AbortSignal,
): Promise<void> {
    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    const response = await fetch(`${API_ROOT}/api${QUESTION_API_PREFIX}/generate_questions/stream`, {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...(csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {}),
        },
        body: JSON.stringify(payload),
        signal,
    });

    if (!response.ok || !response.body) {
        const text = await response.text();
        try {
            const parsed = JSON.parse(text) as { error?: string; detail?: string };
            throw new Error(parsed.error || parsed.detail || text || 'Failed to start question generation stream');
        } catch {
            throw new Error(text || 'Failed to start question generation stream');
        }
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundaryIndex = buffer.indexOf('\n\n');
        while (boundaryIndex !== -1) {
            const chunk = buffer.slice(0, boundaryIndex).trim();
            buffer = buffer.slice(boundaryIndex + 2);
            if (chunk.startsWith('data:')) {
                const raw = chunk.slice(5).trim();
                if (raw === '[DONE]') return;
                const parsed = JSON.parse(raw) as QuestionGenerationStreamEvent;
                onEvent(parsed);
            }
            boundaryIndex = buffer.indexOf('\n\n');
        }
    }
}

export async function suggestConstraints(
    payload: SuggestConstraintsPayload,
): Promise<SuggestConstraintsResponse> {
    const res = await client.post(`${QUESTION_API_PREFIX}/suggest_constraints`, payload);
    return res.data;
}

export async function exportQuestions(taskId: string | null): Promise<Blob> {
    const params: { task_id?: string } = taskId ? { task_id: taskId } : {};
    const res = await client.post(`${QUESTION_API_PREFIX}/export_questions`, {}, { params, responseType: 'blob' });
    return res.data;
}

export async function exportQuestionSelection(payload: QuestionExportPayload): Promise<Blob> {
    const res = await client.post(`${QUESTION_API_PREFIX}/export_selection`, payload, { responseType: 'blob' });
    return res.data;
}

export async function finalizeQuestionHistory(
    historyId: string,
    payload: QuestionHistoryFinalizePayload,
): Promise<{ success: boolean; history_id: string }> {
    const res = await client.post(`${QUESTION_API_PREFIX}/generation_history/${historyId}/finalize`, payload);
    return res.data;
}

export async function uploadScreenshot(
    payload: { image: string; chapter_number?: string; sub_chapter_number?: string; exercise_number?: string },
): Promise<{ success: boolean; filename: string; error?: string }> {
    const res = await client.post(`${QUESTION_API_PREFIX}/upload_screenshot`, payload);
    return res.data;
}

export async function listQuestionProviders(): Promise<{ providers: QuestionProviderStatus[] }> {
    const res = await client.get(`${QUESTION_API_PREFIX}/providers`);
    return res.data;
}

const historyApi = createHistoryApi<GenerationHistoryItem>(QUESTION_API_PREFIX);

export async function getGenerationHistory(page = 1, pageSize = 10) {
    return historyApi.getGenerationHistory(page, pageSize);
}

export async function getGenerationDetail(historyId: string): Promise<QuestionHistoryDetail> {
    const res = await client.get(`${QUESTION_API_PREFIX}/generation_history/${historyId}`);
    return res.data;
}

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
    const res = await client.post(`${QUESTION_API_PREFIX}/generation_history/${historyId}/replay`);
    return res.data;
}
