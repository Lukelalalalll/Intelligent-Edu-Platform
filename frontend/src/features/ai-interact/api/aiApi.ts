import client from '@/shared/api/client';
import { resolveApiRoot } from '@/shared/api/root';
import type { AISession, AISessionListResponse, AIMemory, ChatMessage } from '../../../types/api';

const API_ROOT = resolveApiRoot();

export type AIProvider = 'coze' | 'local_ollama' | 'deepseek';
export type AITutorMode = 'tutor' | 'hint_only';
export type AISearchEngine = 'auto' | 'google' | 'bing' | 'duckduckgo' | 'wikipedia' | 'arxiv' | 'google_scholar';

export const SEARCH_ENGINE_LABELS: Record<AISearchEngine, string> = {
    auto:           'Auto (best match)',
    google:         'Google',
    bing:           'Bing',
    duckduckgo:     'DuckDuckGo',
    wikipedia:      'Wikipedia',
    arxiv:          'arXiv (papers)',
    google_scholar: 'Google Scholar',
};

export interface AIProviderHealth {
    provider: AIProvider;
    ok: boolean;
    detail: string;
    checking?: boolean;
}

interface AIMemoryResponse {
    memory: AIMemory;
}

export const aiSessionApi = {
    list: (): Promise<AISessionListResponse> => client.get('/ai/sessions').then(r => r.data),
    get: (id: string): Promise<AISession> => client.get(`/ai/sessions/${id}`).then(r => r.data),
    create: (): Promise<AISession> => client.post('/ai/sessions').then(r => r.data),
    update: (id: string, payload: { title?: string; messages?: ChatMessage[] }) => client.put(`/ai/sessions/${id}`, payload).then(r => r.data),
    remove: (id: string) => client.delete(`/ai/sessions/${id}`).then(r => r.data),
};

export const aiMemoryApi = {
    get: (): Promise<AIMemoryResponse> => client.get('/ai/memory').then(r => r.data),
    update: (form: Record<string, unknown>): Promise<AIMemoryResponse> => client.put('/ai/memory', form).then(r => r.data),
};

export interface AIRoleInfo {
    role: string;
    mode: 'socratic' | 'direct';
    rag_active: boolean;
    rag_courses: string[];
}

export function getRoleInfo(): Promise<AIRoleInfo> {
    return client.get('/ai/role-info').then(r => r.data);
}

export function getProviderHealth(provider: AIProvider): Promise<AIProviderHealth> {
    return client.get('/ai/provider-health', { params: { provider } }).then(r => r.data);
}

export async function extractPdfText(file: File): Promise<{ filename: string; text: string; char_count: number; has_text: boolean }> {
    const form = new FormData();
    form.append('file', file);
    return client.post('/ai/extract-pdf-text', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);
}

export function createChatStream(
    messages: ChatMessage[],
    provider: AIProvider,
    tutorMode: AITutorMode,
    sessionId?: string,
    signal?: AbortSignal,
    webSearch?: boolean,
    searchEngine?: AISearchEngine,
    enableThinking?: boolean,
): Promise<Response> {
    return fetch(`${API_ROOT}/api/ai/chat`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messages,
            provider,
            tutor_mode: tutorMode,
            session_id: sessionId || undefined,
            web_search: webSearch ?? false,
            search_engine: searchEngine ?? 'auto',
            enable_thinking: enableThinking ?? false,
        }),
        signal,
    });
}
