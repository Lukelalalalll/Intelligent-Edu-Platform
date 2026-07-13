import { useEffect } from 'react';
import type React from 'react';
import { aiSessionApi, getProviderHealth, type AIProvider, type AIProviderHealth } from '../../../api/aiApi';
import type { AISession } from '@/types/api';
import { buildSession, getErrorMessage, PROVIDER_STORAGE_KEY, TUTOR_MODE_STORAGE_KEY, WEB_SEARCH_STORAGE_KEY, SEARCH_ENGINE_STORAGE_KEY, ENABLE_THINKING_STORAGE_KEY } from './sessionHelpers';

export function usePersistAiPreferences(selectedProvider: string, tutorMode: string, webSearch: boolean, searchEngine: string, enableThinking?: boolean): void {
    useEffect(() => {
        localStorage.setItem(PROVIDER_STORAGE_KEY, selectedProvider);
    }, [selectedProvider]);

    useEffect(() => {
        localStorage.setItem(TUTOR_MODE_STORAGE_KEY, tutorMode);
    }, [tutorMode]);

    useEffect(() => {
        localStorage.setItem(WEB_SEARCH_STORAGE_KEY, String(webSearch));
    }, [webSearch]);

    useEffect(() => {
        localStorage.setItem(SEARCH_ENGINE_STORAGE_KEY, searchEngine);
    }, [searchEngine]);

    useEffect(() => {
        if (enableThinking !== undefined) {
            localStorage.setItem(ENABLE_THINKING_STORAGE_KEY, String(enableThinking));
        }
    }, [enableThinking]);
}

export function useProviderHealthCheck(
    selectedProvider: AIProvider,
    setProviderHealth: (value: AIProviderHealth) => void,
    enabled = true,
): void {
    useEffect(() => {
        if (!enabled) {
            return;
        }
        let cancelled = false;
        setProviderHealth({
            provider: selectedProvider,
            ok: false,
            detail: 'Checking provider status...',
            checking: true,
        });
        (async () => {
            try {
                const health = await getProviderHealth(selectedProvider);
                if (!cancelled) {
                    setProviderHealth({
                        provider: selectedProvider,
                        ok: !!health.ok,
                        detail: String(health.detail || ''),
                    });
                }
            } catch (err) {
                if (!cancelled) {
                    setProviderHealth({
                        provider: selectedProvider,
                        ok: false,
                        detail: getErrorMessage(err) || 'health check failed',
                    });
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [selectedProvider, setProviderHealth, enabled]);
}

export function useInitialSessionsLoad(
    setSessions: React.Dispatch<React.SetStateAction<(AISession & { _needFetch?: boolean })[] | null>>,
    setCurrentSessionId: (value: string | null) => void,
): void {
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const data = await aiSessionApi.list();
                if (cancelled) return;
                const list = (data.sessions || []).map((s) => ({
                    ...buildSession(s),
                    messages: s.previewMessages?.length ? s.previewMessages : buildSession(s).messages,
                    historyStart: s.historyStart ?? Math.max(0, (s.messageCount ?? s.previewMessages?.length ?? 0) - (s.previewMessages?.length ?? 0)),
                    _needFetch: !!s.hasMoreMessages,
                }));
                if (list.length === 0) {
                    const ns = await aiSessionApi.create();
                    if (cancelled) return;
                    setSessions([buildSession(ns)]);
                    setCurrentSessionId(ns.id);
                } else {
                    setSessions(list);
                    setCurrentSessionId(list[0].id);
                }
            } catch {
                if (cancelled) return;
                const fallback = { ...buildSession({}), id: `local_${Date.now()}` };
                setSessions([fallback]);
                setCurrentSessionId(fallback.id);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [setSessions, setCurrentSessionId]);
}

export function useLazyFetchSessionMessages(
    currentSessionId: string | null,
    sessionsRef: React.MutableRefObject<(AISession & { _needFetch?: boolean })[] | null>,
    applyFetchedSession: (id: string, data: Partial<AISession>) => void,
    markSessionFetchDone: (id: string) => void,
): void {
    useEffect(() => {
        if (!currentSessionId) return;
        const sess = (sessionsRef.current || []).find((s) => s.id === currentSessionId);
        if (!sess?._needFetch) return;

        let cancelled = false;
        (async () => {
            try {
                const data = await aiSessionApi.get(currentSessionId, 80);
                if (cancelled) return;
                applyFetchedSession(currentSessionId, data);
            } catch {
                markSessionFetchDone(currentSessionId);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [currentSessionId, sessionsRef, applyFetchedSession, markSessionFetchDone]);
}
