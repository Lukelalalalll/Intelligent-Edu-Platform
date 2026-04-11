/**
 * cozeApi — AI Gateway REST API client.
 * Replaces {cozeApi} previously in api.ts.
 */
import client from '../../../api/client';
import type { ChatMessage } from '../types/api';
import type { AIProvider } from '../../../shared/aiProvider';

export const cozeApi = {
    analyzeSubmission: (submissionId: string, provider: AIProvider = 'local_ollama') =>
        client.post('/ai/gateway/analyze', { submissionId, provider }).then(r => r.data),

    debugRag: (submissionId: string, selectedText: string, options: { useRag?: boolean; ragTopK?: number } = {}) =>
        client.post('/ai/gateway/rag/debug', {
            submissionId,
            selectedText,
            useRag: options.useRag ?? true,
            ragTopK: options.ragTopK ?? 4,
        }).then(r => r.data),

    askFeedback: (
        submissionId: string,
        selectedText: string,
        assignment: string | undefined,
        rubric: Record<string, unknown> | undefined,
        messages: ChatMessage[] = [],
        options: { useRag?: boolean; ragTopK?: number; provider?: AIProvider } = {},
    ) =>
        client.post('/ai/gateway/feedback', {
            submissionId,
            selectedText,
            assignment,
            rubric,
            messages,
            provider: options.provider || 'local_ollama',
            useRag: options.useRag ?? true,
            ragTopK: options.ragTopK ?? 4,
        }).then(r => r.data),

    suggestAnnotation: (
        submissionId: string,
        selectedText: string,
        assignment: string | undefined,
        rubric: Record<string, unknown> | undefined,
        messages: ChatMessage[] = [],
        options: { useRag?: boolean; ragTopK?: number; provider?: AIProvider } = {},
    ) =>
        client.post('/ai/gateway/annotate', {
            submissionId,
            selectedText,
            assignment,
            rubric,
            messages,
            provider: options.provider || 'local_ollama',
            useRag: options.useRag ?? true,
            ragTopK: options.ragTopK ?? 4,
        }).then(r => r.data),
};
