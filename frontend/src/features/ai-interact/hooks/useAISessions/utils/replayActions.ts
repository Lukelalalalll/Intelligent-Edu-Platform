import type React from 'react';
import type { AIProvider, AITutorMode, AISearchEngine } from '../../../api/aiApi';
import type { AISession, ChatMessage, RagCitation } from '@/types/api';
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
    streamSSE: (apiMessages: ChatMessage[], targetId: string, provider: AIProvider, mode: AITutorMode, signal: AbortSignal, wsearch?: boolean, sengine?: AISearchEngine, think?: boolean) => Promise<{ content: string; citations?: RagCitation[]; isCourseRelevant?: boolean } | void>;
    syncToServer: (id: string, data: AISession) => Promise<void>;
    selectedProvider: AIProvider;
    tutorMode: AITutorMode;
    enableThinking?: boolean;
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
        enableThinking,
    } = params;

    if (isTyping) return;
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setIsTyping(true);
    // Bug 1 fix: clear _needFetch so lazy-fetch cannot overwrite messages restored from history
    setSessions((prev) => prev?.map((s) => (s.id === targetId ? { ...s, _needFetch: false, messages: [...history, { role: 'assistant', content: '' }] } : s)) || prev);

    let streamResult: { content: string } | void = undefined;
    try {
        const payloadMsgs = toPayloadMessages(history);
        streamResult = await streamSSE(payloadMsgs, targetId, selectedProvider, tutorMode, abortRef.current.signal, undefined, undefined, enableThinking);
    } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setSessions((prev) => prev?.map((s) => (
            s.id === targetId
                ? { ...s, messages: [...history, { role: 'assistant', content: `Network Error: ${getErrorMessage(err)}` }] }
                : s
        )) || prev);
    } finally {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setIsTyping(false);
            });
        });
        abortRef.current = null;
        const final = (sessionsRef.current || []).find((s) => s.id === targetId);
        if (final) {
            const content = (streamResult as any)?.content;
            if (content) {
                const patched: AISession = {
                    ...final,
                    messages: final.messages.map((m, i, arr) =>
                        i === arr.length - 1 && m.role === 'assistant'
                            ? { ...m, content }
                            : m
                    ),
                };
                await syncToServer(targetId, patched);
            } else {
                await syncToServer(targetId, final);
            }
        }
    }
}
