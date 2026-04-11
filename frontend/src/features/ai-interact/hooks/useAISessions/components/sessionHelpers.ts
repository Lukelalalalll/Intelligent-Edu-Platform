import type { AISession, ChatMessage } from '@/types/api';

export const SYSTEM_MSG: ChatMessage = { role: 'system', content: 'You are a helpful academic AI assistant for HKU.' };
export const PROVIDER_STORAGE_KEY = 'ai_provider';
export const TUTOR_MODE_STORAGE_KEY = 'ai_tutor_mode';

export function getErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err || 'unknown error');
}

export function buildSession(raw: Partial<AISession>): AISession {
    return {
        id: raw.id!,
        title: raw.title || 'New Conversation',
        messages: raw.messages || [SYSTEM_MSG],
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
