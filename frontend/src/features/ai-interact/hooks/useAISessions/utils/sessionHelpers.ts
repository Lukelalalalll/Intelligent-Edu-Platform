import type { AISession, ChatMessage } from '@/types/api';

export const SYSTEM_MSG: ChatMessage = { role: 'system', content: 'You are a helpful academic AI assistant for HKU.' };
export const PROVIDER_STORAGE_KEY = 'ai_provider';
export const TUTOR_MODE_STORAGE_KEY = 'ai_tutor_mode';
export const WEB_SEARCH_STORAGE_KEY = 'ai_web_search';
export const SEARCH_ENGINE_STORAGE_KEY = 'ai_search_engine';
export const ENABLE_THINKING_STORAGE_KEY = 'ai_enable_thinking';

export function getErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err || 'unknown error');
}

export function buildSession(raw: Partial<AISession>): AISession {
    return {
        id: raw.id || `local_${Date.now()}`,
        title: raw.title || 'New Conversation',
        messages: raw.messages || raw.previewMessages || [SYSTEM_MSG],
        historyStart: raw.historyStart ?? 0,
        messageCount: raw.messageCount ?? (raw.messages?.length ?? raw.previewMessages?.length ?? 1),
        hasMoreMessages: raw.hasMoreMessages ?? false,
        previewMessages: raw.previewMessages,
    };
}

export function mergeMessageContent(message: ChatMessage): string {
    return [message.content, message.attachedText].filter(Boolean).join('\n\n').trim();
}

export function toPayloadMessages(messages: ChatMessage[]): ChatMessage[] {
    return messages
        .map((m) => ({
            role: m.role,
            content: mergeMessageContent(m),
            images: m.images,
        }))
        .filter((m) => m.role !== 'system' || messages.length < 5);
}
