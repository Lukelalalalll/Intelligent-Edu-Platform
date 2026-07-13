import { aiSessionApi } from '../../../api/aiApi';
import type { AISession, ChatMessage } from '@/types/api';

import { mergeMessageContent } from './sessionHelpers';

const SESSION_SYNC_TRIM_LIMIT = 150;

type SessionUpdatePayload = {
    title?: string;
    messages?: ChatMessage[];
    history_start?: number;
};

interface SessionSyncDeps {
    updateSession?: (id: string, payload: SessionUpdatePayload) => Promise<unknown>;
}

function getResponseStatus(err: unknown): number | undefined {
    return (err as { response?: { status?: number } })?.response?.status;
}

export function normalizeSessionMessages(messages: ChatMessage[]): ChatMessage[] {
    return messages.map((message) => ({
        ...message,
        content: mergeMessageContent(message),
    }));
}

export async function syncSessionToServer(
    id: string,
    data: AISession,
    deps: SessionSyncDeps = {},
): Promise<void> {
    if (!id || !data) {
        return;
    }

    const updateSession = deps.updateSession ?? aiSessionApi.update;
    const normalizedMessages = normalizeSessionMessages(data.messages || []);

    try {
        await updateSession(id, {
            title: data.title,
            messages: normalizedMessages,
            history_start: data.historyStart ?? 0,
        });
    } catch (err: unknown) {
        const status = getResponseStatus(err);
        if (status !== 422 && status !== 413) {
            return;
        }

        try {
            const trimmedMessages = normalizeSessionMessages((data.messages || []).slice(-SESSION_SYNC_TRIM_LIMIT));
            await updateSession(id, {
                title: data.title,
                messages: trimmedMessages,
                history_start: Math.max(
                    0,
                    (data.historyStart ?? 0) + Math.max(0, normalizedMessages.length - trimmedMessages.length),
                ),
            });
        } catch {
            // Local state remains the source of truth if the retry also fails.
        }
    }
}
