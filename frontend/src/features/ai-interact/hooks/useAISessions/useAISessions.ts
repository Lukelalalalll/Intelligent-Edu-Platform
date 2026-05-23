import { useState, useEffect, useRef, useCallback } from 'react';
import {
    aiSessionApi,
    aiMemoryApi,
    createChatStream,
    type AIProvider,
    type AITutorMode,
    type AISearchEngine,
} from '../../api/aiApi';
import { networkBus } from '@/shared/hooks/useNetworkStatus';
import type { AISession, ChatMessage, RagCitation, UIElement, ToolProgress } from '@/types/api';
import { prepareAttachmentPayload, type AttachmentInput } from './utils/attachmentHelpers';
import {
    PROVIDER_STORAGE_KEY,
    TUTOR_MODE_STORAGE_KEY,
    WEB_SEARCH_STORAGE_KEY,
    SEARCH_ENGINE_STORAGE_KEY,
    ENABLE_THINKING_STORAGE_KEY,
    buildSession,
    getErrorMessage,
    mergeMessageContent,
    toPayloadMessages,
} from './utils/sessionHelpers';
import { createRafBufferedUpdater, type UIElementHandler, type ToolProgressHandler } from './utils/streamHelpers';
import {
    useInitialSessionsLoad,
    useLazyFetchSessionMessages,
    usePersistAiPreferences,
    useProviderHealthCheck,
} from './utils/sessionLifecycle';
import { replayFromHistory, resolveTargetSession } from './utils/replayActions';

interface ModalConfig {
    show: boolean;
    sessionId: string | null;
}

export function useAISessions() {
    const [sessions, setSessions] = useState<(AISession & { _needFetch?: boolean })[] | null>(null);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [isTyping, setIsTyping] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [modalConfig, setModalConfig] = useState<ModalConfig>({ show: false, sessionId: null });
    const [selectedProvider, setSelectedProvider] = useState<AIProvider>(() => {
        const stored = localStorage.getItem(PROVIDER_STORAGE_KEY);
        if (stored === 'coze') return 'coze';
        if (stored === 'deepseek') return 'deepseek';
        return 'local_ollama';
    });
    const [tutorMode, setTutorMode] = useState<AITutorMode>(() => {
        const stored = localStorage.getItem(TUTOR_MODE_STORAGE_KEY);
        if (stored === 'tutor' || stored === 'hint_only') return stored;
        return 'hint_only';
    });
    const [webSearch, setWebSearch] = useState<boolean>(() => {
        return localStorage.getItem(WEB_SEARCH_STORAGE_KEY) === 'true';
    });
    const [searchEngine, setSearchEngine] = useState<AISearchEngine>(() => {
        const stored = localStorage.getItem(SEARCH_ENGINE_STORAGE_KEY) as AISearchEngine | null;
        const valid: AISearchEngine[] = ['auto', 'google', 'bing', 'duckduckgo', 'wikipedia', 'arxiv', 'google_scholar'];
        return stored && valid.includes(stored) ? stored : 'auto';
    });
    const [enableThinking, setEnableThinking] = useState<boolean>(() => {
        return localStorage.getItem(ENABLE_THINKING_STORAGE_KEY) === 'true';
    });
    const [providerHealth, setProviderHealth] = useState<{ ok: boolean; detail: string }>({ ok: true, detail: 'ok' });

    const abortRef = useRef<AbortController | null>(null);
    const rafRef = useRef<number | null>(null);
    const sendingRef = useRef(false);
    const sessionsRef = useRef(sessions);
    sessionsRef.current = sessions;
    const isTypingRef = useRef(isTyping);
    isTypingRef.current = isTyping;
    // Keep latest web-search state accessible in callbacks without stale closures
    const webSearchRef = useRef(webSearch);
    webSearchRef.current = webSearch;
    const searchEngineRef = useRef(searchEngine);
    searchEngineRef.current = searchEngine;
    const enableThinkingRef = useRef(enableThinking);
    enableThinkingRef.current = enableThinking;

    const applyFetchedSession = useCallback((id: string, data: Partial<AISession>) => {
        setSessions(prev => {
            const list = prev || [];
            return list.map(s => {
                if (s.id !== id) return s;
                if (s._needFetch) {
                    // Normal path: apply fetched data directly
                    return { ...s, title: data.title || s.title, messages: data.messages || s.messages, _needFetch: false };
                }
                // _needFetch was cleared by sendMessage while fetch was in-flight.
                // Merge historical messages into the head of the current messages
                // so we don't lose chat history.
                const fetchedMsgs = data.messages || [];
                if (fetchedMsgs.length === 0) return s;
                const localKeys = new Set(s.messages.map(m => `${m.role}:${(m.content || '').slice(0, 120)}`));
                const missing = fetchedMsgs.filter(m => !localKeys.has(`${m.role}:${(m.content || '').slice(0, 120)}`));
                if (missing.length === 0) return s;
                return { ...s, title: data.title || s.title, messages: [...missing, ...s.messages] };
            });
        });
    }, []);

    const markSessionFetchDone = useCallback((id: string) => {
        setSessions(prev => {
            const list = prev || [];
            return list.map(s => (s.id === id ? { ...s, _needFetch: false } : s));
        });
    }, []);

    const applyAssistantSnapshot = useCallback((targetId: string, snapshot: string, citations?: RagCitation[], isCourseRelevant?: boolean, reasoning?: string) => {
        setSessions(prev => (prev || []).map(s => {
            if (s.id !== targetId) return s;
            const msgs = [...s.messages];
            const lastMsg = msgs.at(-1);
            if (!lastMsg || lastMsg.role !== 'assistant') return s;
            msgs[msgs.length - 1] = {
                ...lastMsg,
                content: snapshot,
                ...(citations ? { citations } : {}),
                ...(isCourseRelevant !== undefined ? { is_course_relevant: isCourseRelevant } : {}),
                ...(reasoning ? { reasoning } : {}),
            };
            return { ...s, messages: msgs };
        }));
    }, []);

    usePersistAiPreferences(selectedProvider, tutorMode, webSearch, searchEngine, enableThinking);
    useProviderHealthCheck(selectedProvider, setProviderHealth);
    useInitialSessionsLoad(setSessions, setCurrentSessionId);
    useLazyFetchSessionMessages(currentSessionId, sessionsRef, applyFetchedSession, markSessionFetchDone);

    // ── Sync helper ──
    const syncToServer = useCallback(async (id: string, data: AISession) => {
        if (!id || !data) return;
        try {
            const normalizedMessages = (data.messages || []).map((msg) => ({
                ...msg,
                content: mergeMessageContent(msg),
            }));
            await aiSessionApi.update(id, { title: data.title, messages: normalizedMessages });
        } catch (err: unknown) {
            // If the payload is too large (422/413), trim oldest messages and retry once
            const status = (err as { response?: { status?: number } })?.response?.status;
            if (status === 422 || status === 413) {
                try {
                    const trimmed = (data.messages || []).slice(-150).map((msg) => ({
                        ...msg,
                        content: mergeMessageContent(msg),
                    }));
                    await aiSessionApi.update(id, { title: data.title, messages: trimmed });
                } catch { /* give up — local state is source of truth */ }
            }
        }
    }, []);

    // ── Create / switch ──
    const createNewSession = useCallback(async (switchImmediately = true) => {
        try {
            const ns = await aiSessionApi.create();
            setSessions(prev => [buildSession(ns), ...(prev || [])]);
            if (switchImmediately) setCurrentSessionId(ns.id);
        } catch {
            const local = { ...buildSession({}), id: 'local_' + Date.now() };
            setSessions(prev => [local, ...(prev || [])]);
            if (switchImmediately) setCurrentSessionId(local.id);
        }
    }, []);

    // ── Delete ──
    const confirmDelete = useCallback(async () => {
        const id = modalConfig.sessionId;
        setModalConfig({ show: false, sessionId: null });
        if (!id) return;
        setDeletingId(id);
        aiSessionApi.remove(id).catch(() => {});

        setTimeout(async () => {
            const remaining = (sessionsRef.current || []).filter(s => s.id !== id);
            setSessions(remaining);
            if (remaining.length === 0) {
                await createNewSession(true);
            } else if (currentSessionId === id) {
                setCurrentSessionId(remaining[0].id);
            }
            setDeletingId(null);
        }, 300);
    }, [modalConfig.sessionId, currentSessionId, createNewSession]);

    // ── SSE streaming with rAF batching ──
    const streamSSE = useCallback(async (apiMessages: ChatMessage[], targetId: string, provider: AIProvider, mode: AITutorMode, signal: AbortSignal, wsearch?: boolean, sengine?: AISearchEngine, think?: boolean) => { // NOSONAR
        const response = await createChatStream(apiMessages, provider, mode, targetId, signal, wsearch, sengine, think);

        if (!response.ok) {
            setSessions(prev => (prev || []).map(s => s.id === targetId
                ? { ...s, messages: [...s.messages.slice(0, -1), { role: 'assistant', content: `API Error: ${response.status}` }] }
                : s));
            setIsTyping(false);
            return;
        }

        if (!response.body) {
            setSessions(prev => (prev || []).map(s => s.id === targetId
                ? { ...s, messages: [...s.messages.slice(0, -1), { role: 'assistant', content: 'Error: Empty response body from server.' }] }
                : s));
            setIsTyping(false);
            return;
        }

        // Collect ui_elements and tool_progresses during this stream
        const uiElements: UIElement[] = [];
        const toolProgresses: ToolProgress[] = [];

        const onUIElement: UIElementHandler = (el) => { uiElements.push(el); };
        const onToolProgress: ToolProgressHandler = (tp) => {
            // Replace or append — same-name running replaces previous running entry
            const existingIdx = toolProgresses.findIndex(p => p.name === tp.name && p.status === 'running');
            if (existingIdx >= 0 && tp.status === 'running') {
                toolProgresses[existingIdx] = tp;
            } else if (existingIdx >= 0) {
                toolProgresses[existingIdx] = tp;
            } else {
                toolProgresses.push(tp);
            }
        };

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        const buffered = createRafBufferedUpdater(
            (snapshot, citations?: RagCitation[], isCourseRelevant?: boolean, reasoning?: string) => applyAssistantSnapshot(targetId, snapshot, citations, isCourseRelevant, reasoning),
            rafRef,
            onUIElement,
            onToolProgress,
        );

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed?.startsWith('data: ')) continue;
                const raw = trimmed.slice(6);
                if (raw === '[DONE]') continue;
                try {
                    const obj = JSON.parse(raw);
                    buffered.consumeSseObject(obj);
                } catch { /* skip */ }
            }
        }

        const finalResult = buffered.finalize();

        // Stash collected ui_elements / tool_progresses onto the last assistant message
        if (uiElements.length > 0 || toolProgresses.length > 0) {
            setSessions(prev => (prev || []).map(s => {
                if (s.id !== targetId) return s;
                const msgs = [...s.messages];
                const lastMsg = msgs.at(-1);
                const patch: Partial<ChatMessage> = {};
                if (uiElements.length > 0) patch.ui_elements = [...uiElements];
                if (toolProgresses.length > 0) patch.tool_progresses = [...toolProgresses];
                msgs[msgs.length - 1] = { ...lastMsg, ...patch } as ChatMessage;
                return { ...s, messages: msgs };
            }));
        }

        return { content: finalResult.snapshot, citations: finalResult.citations, isCourseRelevant: finalResult.isCourseRelevant, reasoning: finalResult.reasoning };
    }, [applyAssistantSnapshot]);

    // ── Send message ──
    const sendMessage = useCallback(async (text: string, attachedFiles: AttachmentInput[] = []) => {
        if (sendingRef.current || isTyping || (!text.trim() && attachedFiles.length === 0)) return;
        sendingRef.current = true;
        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();

        const { targetId } = resolveTargetSession(currentSessionId, sessions);
        if (!targetId) {
            sendingRef.current = false;
            return;
        }
        if (targetId !== currentSessionId) setCurrentSessionId(targetId);

        const trimmed = text.trim();

        const { images, attachmentNotes, filesMeta } = await prepareAttachmentPayload(attachedFiles);

        const combinedUserContent = trimmed;
        const attachedText = attachmentNotes.length > 0 ? attachmentNotes.join('\n\n') : undefined;

        if (!combinedUserContent && !attachedText && images.length === 0) {
            sendingRef.current = false;
            return;
        }

        // Refuse to stream while offline — show an inline error message
        if (networkBus.isOffline) {
            setSessions(prev => (prev || []).map(s => s.id !== targetId ? s : {
                ...s,
                messages: [
                    ...s.messages,
                    { role: 'user' as const, content: combinedUserContent, attachedText: attachedText, images: images.length ? images : undefined, files: filesMeta.length ? filesMeta : undefined },
                    { role: 'assistant' as const, content: 'You appear to be offline. Please check your network connection and try again.' },
                ],
            }));
            sendingRef.current = false;
            return;
        }

        setIsTyping(true);

        setSessions(prev => (prev || []).map(s => {
            if (s.id !== targetId) return s;
            let title = s.title;
            // Bug 5 fix: only update title for genuinely new sessions (no prior user messages and not awaiting fetch)
            const hasUserMessages = s.messages.some(m => m.role === 'user');
            if (!s._needFetch && !hasUserMessages) {
                const display = combinedUserContent || filesMeta[0]?.file_name || attachmentNotes[0];
                title = display.length > 20 ? `${display.slice(0, 20)}...` : (display || "Attachment only");
            }
            return {
                ...s,
                // Bug 1 fix: clear _needFetch so lazy-fetch cannot overwrite the message we're about to add
                _needFetch: false,
                title,
                messages: [
                    ...s.messages,
                    { role: 'user' as const, content: combinedUserContent, attachedText: attachedText, images: images.length ? images : undefined, files: filesMeta.length ? filesMeta : undefined },
                    { role: 'assistant' as const, content: '' }
                ]
            };
        }));

        let streamResult: { content: string; citations?: RagCitation[]; isCourseRelevant?: boolean; reasoning?: string } | undefined;
        try {
            const sess = (sessionsRef.current || []).find(s => s.id === targetId);
            if (!sess) {
                sendingRef.current = false;
                setIsTyping(false);
                return;
            }
            const apiMsgs: ChatMessage[] = [
                ...sess.messages,
                { role: 'user' as const, content: combinedUserContent, attachedText: attachedText, images: images.length ? images : undefined, files: filesMeta.length ? filesMeta : undefined },
            ];
            
            // Map the messages before sending to API so the backend receives the combined text
            const payloadMsgs = toPayloadMessages(apiMsgs);

            streamResult = await streamSSE(
                payloadMsgs,
                targetId,
                selectedProvider,
                tutorMode,
                abortRef.current.signal,
                webSearchRef.current,
                searchEngineRef.current,
                enableThinkingRef.current,
            );
        } catch (err: unknown) {
            if (err instanceof Error && err.name === 'AbortError') return;
            setSessions(prev => (prev || []).map(s => s.id === targetId
                ? { ...s, messages: [...s.messages.slice(0, -1), { role: 'assistant', content: `Network Error: ${getErrorMessage(err)}` }] } : s));
        } finally {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setIsTyping(false);
                });
            });
            abortRef.current = null;
            sendingRef.current = false;
            const final = (sessionsRef.current || []).find(s => s.id === targetId);
            if (final) {
                // Use the definitive stream result instead of the potentially stale sessionsRef
                if (streamResult?.content) {
                    const patched: AISession = {
                        ...final,
                        messages: final.messages.map((m, i, arr) =>
                            i === arr.length - 1 && m.role === 'assistant'
                                ? {
                                    ...m,
                                    content: streamResult!.content,
                                    ...(streamResult!.citations ? { citations: streamResult!.citations } : {}),
                                    ...(streamResult!.isCourseRelevant !== undefined ? { is_course_relevant: streamResult!.isCourseRelevant } : {}),
                                    ...(streamResult!.reasoning ? { reasoning: streamResult!.reasoning } : {}),
                                  }
                                : m
                        ),
                    };
                    syncToServer(targetId, patched);
                } else {
                    syncToServer(targetId, final);
                }
            }
        }
    }, [isTyping, currentSessionId, sessions, streamSSE, syncToServer, selectedProvider, tutorMode, webSearchRef, searchEngineRef]);

    const replayExistingHistory = useCallback(async (history: ChatMessage[]) => {
        const cid = currentSessionId || (sessionsRef.current || [])[0]?.id || null;
        if (!cid) return;
        await replayFromHistory({
            isTyping: isTypingRef.current,
            history,
            targetId: cid,
            abortRef,
            setIsTyping,
            setSessions,
            sessionsRef,
            streamSSE,
            syncToServer,
            selectedProvider,
            tutorMode,
            enableThinking: enableThinkingRef.current,
        });
    }, [currentSessionId, streamSSE, syncToServer, selectedProvider, tutorMode]);

    // ── Regenerate ──
    const regenerate = useCallback(async (msgIndex: number) => {
        const { targetId, session } = resolveTargetSession(
            currentSessionId, sessionsRef.current,
        );
        if (!targetId || !session) return;
        const history = session.messages.slice(0, msgIndex);
        await replayExistingHistory(history);
    }, [currentSessionId, replayExistingHistory]);

    // ── Edit user message ──
    const editUserMsg = useCallback(async (msgIndex: number, newVal: string) => {
        if (!newVal?.trim()) return;
        const { targetId, session } = resolveTargetSession(
            currentSessionId, sessionsRef.current,
        );
        if (!targetId || !session || session.messages[msgIndex]?.role !== 'user') return;

        const history = [
            ...session.messages.slice(0, msgIndex),
            { ...session.messages[msgIndex], content: newVal.trim() },
        ];
        await replayExistingHistory(history);
    }, [currentSessionId, replayExistingHistory]);

    // ── Stop streaming ──
    const stopStream = useCallback(() => {
        if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
        if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        setIsTyping(false);
    }, []);

    return {
        sessions, currentSessionId, isTyping, deletingId, modalConfig,
        setCurrentSessionId, setModalConfig,
        createNewSession, confirmDelete,
        sendMessage, regenerate, editUserMsg, stopStream,
        selectedProvider, setSelectedProvider, providerHealth,
        tutorMode, setTutorMode,
        webSearch, setWebSearch,
        searchEngine, setSearchEngine,
        enableThinking, setEnableThinking,
    };
}

export function useAIMemory() {
    const [memory, setMemory] = useState<any>({});
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        aiMemoryApi.get().then(d => setMemory(d.memory || {})).catch(() => {});
    }, []);

    const save = useCallback(async (form: Record<string, unknown>) => {
        setSaving(true);
        try {
            const res = await aiMemoryApi.update(form);
            setMemory((res.memory || form) as Record<string, unknown>);
            setOpen(false);
        } catch { /* keep modal open for retry */ }
        finally { setSaving(false); }
    }, []);

    return { memory, open, setOpen, saving, save };
}
