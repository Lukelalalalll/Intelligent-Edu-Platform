import type { AIProvider, AITutorMode } from '../../../api/aiApi';
import type { AISession, ChatMessage } from '@/types/api';
import { getErrorMessage, toPayloadMessages } from './sessionHelpers';

export function resolveTargetSession(
    currentSessionId: string | null,
    sessions: (AISession & { _needFetch?: boolean })[] | null,
): { targetId: string | null; session: (AISession & { _needFetch?: boolean }) | null } {
    const targetId = currentSessionId || (sessions || [])[0]?.id || null;
    if (!targetId) return { targetId: null, session: null };
    const session = (sessions || []).find((s) => s.id === targetId) || null;
    return { targetId, session };
}

export async function replayFromHistory(params: {
    isTyping: boolean;
    history: ChatMessage[];
    targetId: string;
    abortRef: React.MutableRefObject<AbortController | null>;
    setIsTyping: (value: boolean) => void;
    setSessions: React.Dispatch<React.SetStateAction<(AISession & { _needFetch?: boolean })[] | null>>;
    sessionsRef: React.MutableRefObject<(AISession & { _needFetch?: boolean })[] | null>;
    streamSSE: (apiMessages: ChatMessage[], targetId: string, provider: AIProvider, mode: AITutorMode, signal: AbortSignal) => Promise<void>;
    syncToServer: (id: string, data: AISession) => Promise<void>;
    selectedProvider: AIProvider;
    tutorMode: AITutorMode;
}): Promise<void> {
    const {
        isTyping,
        history,
        targetId,
        abortRef,
        setIsTyping,
        setSessions,
        sessionsRef,
        streamSSE,
        syncToServer,
        selectedProvider,
        tutorMode,
    } = params;

    if (isTyping) return;
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setIsTyping(true);
    setSessions((prev) => prev?.map((s) => (s.id === targetId ? { ...s, messages: [...history, { role: 'assistant', content: '' }] } : s)) || prev);

    try {
        const payloadMsgs = toPayloadMessages(history);
        await streamSSE(payloadMsgs, targetId, selectedProvider, tutorMode, abortRef.current.signal);
    } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setSessions((prev) => prev?.map((s) => (
            s.id === targetId
                ? { ...s, messages: [...history, { role: 'assistant', content: `Network Error: ${getErrorMessage(err)}` }] }
                : s
        )) || prev);
    } finally {
        setIsTyping(false);
        abortRef.current = null;
        const final = (sessionsRef.current || []).find((s) => s.id === targetId);
        if (final) await syncToServer(targetId, final);
    }
}
