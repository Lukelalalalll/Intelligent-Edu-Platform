import client from '../../../api/client';
import type { AIProvider } from '../../../shared/aiProvider';

// ── AI Assistant Types ──
export interface AiSummaryResult {
    ok: boolean;
    summary: string;
    mode: string;
    message_count: number;
}

export interface AiReplySuggestionsResult {
    ok: boolean;
    suggestions: string[];
}

export interface AiRewriteResult {
    ok: boolean;
    rewritten_text: string;
}

export interface AiAssistantResult {
    ok: boolean;
    answer: string;
}

export const chatAiApi = {
    aiSummary: (
        roomId: string,
        mode = 'summary',
        windowSize = 30,
        unreadSince?: string,
        provider: AIProvider = 'local_ollama',
    ): Promise<AiSummaryResult> =>
        client.post(`/chat/rooms/${roomId}/ai/summary`, {
            mode, window_size: windowSize, unread_since: unreadSince, provider,
        }).then(r => r.data),

    aiReplySuggestions: (
        roomId: string,
        tone = 'concise',
        latestCount = 10,
        provider: AIProvider = 'local_ollama',
    ): Promise<AiReplySuggestionsResult> =>
        client.post(`/chat/rooms/${roomId}/ai/reply-suggestions`, {
            tone, latest_count: latestCount, provider,
        }).then(r => r.data),

    aiRewrite: (
        roomId: string,
        draftText: string,
        style = 'concise',
        provider: AIProvider = 'local_ollama',
    ): Promise<AiRewriteResult> =>
        client.post(`/chat/rooms/${roomId}/ai/rewrite`, {
            draft_text: draftText, style, provider,
        }).then(r => r.data),

    aiAssistant: (
        roomId: string,
        query: string,
        contextWindow = 20,
        provider: AIProvider = 'local_ollama',
    ): Promise<AiAssistantResult> =>
        client.post(`/chat/rooms/${roomId}/ai/assistant`, {
            query, context_window: contextWindow, provider,
        }).then(r => r.data),
};
