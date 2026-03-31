import client from '../api/client';

const API_ROOT = import.meta.env.VITE_API_ROOT || 'http://localhost:5009';

export const aiSessionApi = {
    list: () => client.get('/ai/sessions').then(r => r.data),
    get: (id) => client.get(`/ai/sessions/${id}`).then(r => r.data),
    create: () => client.post('/ai/sessions').then(r => r.data),
    update: (id, payload) => client.put(`/ai/sessions/${id}`, payload).then(r => r.data),
    remove: (id) => client.delete(`/ai/sessions/${id}`).then(r => r.data),
};

export const aiMemoryApi = {
    get: () => client.get('/ai/memory').then(r => r.data),
    update: (form) => client.put('/ai/memory', form).then(r => r.data),
};

export function createChatStream(messages, signal) {
    return fetch(`${API_ROOT}/api/ai/chat`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
        signal,
    });
}
