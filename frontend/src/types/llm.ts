import type { ChatMessage } from './api';

export type ChatRole = 'user' | 'assistant' | 'system';

export type { ChatMessage };

export interface FeedbackRequestPayload {
    provider?: 'coze' | 'local_ollama' | 'deepseek';
    submissionId: string;
    selectedText: string;
    assignment?: string;
    rubric?: Record<string, unknown>;
    messages?: ChatMessage[];
    useRag?: boolean;
    ragTopK?: number;
}

export interface StreamDeltaFrame {
    choices?: Array<{
        delta?: {
            content?: string;
        };
    }>;
    error?: string;
}

export interface StartStreamOptions {
    payload: FeedbackRequestPayload;
    question: string;
    onDelta?: (fullText: string) => void;
    onDone?: (fullText: string) => void;
}
