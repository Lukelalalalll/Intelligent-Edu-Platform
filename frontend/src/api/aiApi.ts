import client from './client';
import type { AISession, AISessionListResponse, AIMemory, ChatMessage } from '../types/api';

const API_ROOT = import.meta.env.VITE_API_ROOT || 'http://localhost:5009';

export const aiSessionApi = {
    list: (): Promise<AISessionListResponse> => client.get('/ai/sessions').then(r => r.data),
    get: (id: string): Promise<AISession> => client.get(`/ai/sessions/${id}`).then(r => r.data),
    create: (): Promise<AISession> => client.post('/ai/sessions').then(r => r.data),
    update: (id: string, payload: { title?: string; messages?: ChatMessage[] }) => client.put(`/ai/sessions/${id}`, payload).then(r => r.data),
    remove: (id: string) => client.delete(`/ai/sessions/${id}`).then(r => r.data),
};

export const aiMemoryApi = {
    get: (): Promise<AIMemory> => client.get('/ai/memory').then(r => r.data),
    update: (form: Record<string, unknown>) => client.put('/ai/memory', form).then(r => r.data),
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

export function createChatStream(messages: ChatMessage[], signal?: AbortSignal): Promise<Response> {
    return fetch(`${API_ROOT}/api/ai/chat`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
        signal,
    });
}
