import { useState, useEffect, useRef, useCallback } from 'react';
import {
    aiSessionApi,
    aiMemoryApi,
    createChatStream,
    type AIProvider,
    type AITutorMode,
} from '../../api/aiApi';
import { networkBus } from '@/shared/hooks/useNetworkStatus';
import type { AISession, ChatMessage, RagCitation } from '@/types/api';
import { prepareAttachmentPayload, type AttachmentInput } from './utils/attachmentHelpers';
import {
    PROVIDER_STORAGE_KEY,
    TUTOR_MODE_STORAGE_KEY,
    buildSession,
    getErrorMessage,
    mergeMessageContent,
    toPayloadMessages,
} from './utils/sessionHelpers';
import { createRafBufferedUpdater } from './utils/streamHelpers';
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
        return stored === 'coze' ? 'coze' : 'local_ollama';
    });
    const [tutorMode, setTutorMode] = useState<AITutorMode>(() => {
        const stored = localStorage.getItem(TUTOR_MODE_STORAGE_KEY);
        if (stored === 'tutor' || stored === 'hint_only') return stored;
        return 'hint_only';
    });
    const [providerHealth, setProviderHealth] = useState<{ ok: boolean; detail: string }>({ ok: true, detail: 'ok' });

    const abortRef = useRef<AbortController | null>(null);
    const rafRef = useRef<number | null>(null);
    const sendingRef = useRef(false);
    const sessionsRef = useRef(sessions);
    sessionsRef.current = sessions;

    const applyFetchedSession = useCallback((id: string, data: Partial<AISession>) => {
        setSessions(prev => {
            const list = prev || [];
            return list.map(s => {
                if (s.id !== id) return s;
                // If _needFetch was already cleared (e.g. by sendMessage starting a stream),
                // discard the stale server response to avoid overwriting live streaming data.
                if (!s._needFetch) return s;
                return { ...s, title: data.title || s.title, messages: data.messages || s.messages, _needFetch: false };
            });
        });
    }, []);

    const markSessionFetchDone = useCallback((id: string) => {
        setSessions(prev => {
            const list = prev || [];
            return list.map(s => (s.id === id ? { ...s, _needFetch: false } : s));
        });
    }, []);

    const applyAssistantSnapshot = useCallback((targetId: string, snapshot: string, citations?: RagCitation[]) => {
        setSessions(prev => prev.map(s => {
            if (s.id !== targetId) return s;
            const msgs = [...s.messages];
            const lastMsg = msgs.at(-1);
            msgs[msgs.length - 1] = { ...lastMsg, content: snapshot, ...(citations ? { citations } : {}) };
            return { ...s, messages: msgs };
        }));
    }, []);

    usePersistAiPreferences(selectedProvider, tutorMode);
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
        }
        catch { /* local state is source of truth */ }
    }, []);

    // ── Create / switch ──
    const createNewSession = useCallback(async (switchImmediately = true, forceId: string | null = null) => {
        if (forceId) { setCurrentSessionId(forceId); return; }
        try {
            const ns = await aiSessionApi.create();
            setSessions(prev => [buildSession(ns), ...(prev || [])]);
            if (switchImmediately) setCurrentSessionId(ns.id);
        } catch {
            const local = { id: 'local_' + Date.now(), ...buildSession({}) };
            setSessions(prev => [local, ...(prev || [])]);
            if (switchImmediately) setCurrentSessionId(local.id);
        }
    }, []);

    // ── Delete ──
    const promptDelete = useCallback((e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setModalConfig({ show: true, sessionId: id });
    }, []);

    const confirmDelete = useCallback(async () => {
        const id = modalConfig.sessionId;
        setModalConfig({ show: false, sessionId: null });
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
    const streamSSE = useCallback(async (apiMessages: ChatMessage[], targetId: string, provider: AIProvider, mode: AITutorMode, signal: AbortSignal) => { // NOSONAR
        const response = await createChatStream(apiMessages, provider, mode, signal);

        if (!response.ok) {
            setSessions(prev => prev.map(s => s.id === targetId
                ? { ...s, messages: [...s.messages.slice(0, -1), { role: 'assistant', content: `API Error: ${response.status}` }] }
                : s));
            setIsTyping(false);
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        const buffered = createRafBufferedUpdater(
            (snapshot, citations?: RagCitation[]) => applyAssistantSnapshot(targetId, snapshot, citations),
            rafRef,
        );

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
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

        buffered.finalize();
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
            setSessions(prev => prev.map(s => s.id !== targetId ? s : {
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

        setSessions(prev => prev.map(s => {
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

        try {
            // Bug 3 fix: use sessionsRef.current (always latest) instead of the stale `sessions` closure value
            const sess = (sessionsRef.current || []).find(s => s.id === targetId);
            const apiMsgs: ChatMessage[] = sess
                ? [...sess.messages, { role: 'user' as const, content: combinedUserContent, attachedText: attachedText, images: images.length ? images : undefined, files: filesMeta.length ? filesMeta : undefined }]
                : [];
            
            // Map the messages before sending to API so the backend receives the combined text
            const payloadMsgs = toPayloadMessages(apiMsgs);

            await streamSSE(
                payloadMsgs,
                targetId,
                selectedProvider,
                tutorMode,
                abortRef.current.signal,
            );
        } catch (err: unknown) {
            if (err instanceof Error && err.name === 'AbortError') return;
            setSessions(prev => prev.map(s => s.id === targetId
                ? { ...s, messages: [...s.messages.slice(0, -1), { role: 'assistant', content: `Network Error: ${getErrorMessage(err)}` }] } : s));
        } finally {
            // Defer setIsTyping(false) by two animation frames so the typewriter
            // effect has at least one render cycle with isActive=true before snapping.
            // Without this, React may batch the final snapshot + isTyping=false into
            // the same render, causing the typewriter to initialise with isActive=false
            // and snap to full content immediately.
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setIsTyping(false);
                });
            });
            abortRef.current = null;
            sendingRef.current = false;
            const final = (sessionsRef.current || []).find(s => s.id === targetId);
            if (final) syncToServer(targetId, final);
        }
    }, [isTyping, currentSessionId, sessions, streamSSE, syncToServer, selectedProvider, tutorMode]);

    const replayExistingHistory = useCallback(async (history: ChatMessage[]) => {
        const { targetId } = resolveTargetSession(currentSessionId, sessions);
        if (!targetId) return;
        await replayFromHistory({
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
        });
    }, [isTyping, currentSessionId, sessions, streamSSE, syncToServer, selectedProvider, tutorMode]);

    // ── Regenerate ──
    const regenerate = useCallback(async (msgIndex: number) => {
        const { targetId, session } = resolveTargetSession(currentSessionId, sessions);
        if (!targetId || !session) return;
        const history = session.messages.slice(0, msgIndex);
        await replayExistingHistory(history);
    }, [currentSessionId, sessions, replayExistingHistory]);

    // ── Edit user message ──
    const editUserMsg = useCallback(async (msgIndex: number, newVal: string) => {
        if (!newVal?.trim()) return;
        const { targetId, session } = resolveTargetSession(currentSessionId, sessions);
        if (!targetId || !session || session.messages[msgIndex]?.role !== 'user') return;

        const history = [
            ...session.messages.slice(0, msgIndex),
            { ...session.messages[msgIndex], content: newVal.trim() },
        ];
        await replayExistingHistory(history);
    }, [currentSessionId, sessions, replayExistingHistory]);

    // ── Stop streaming ──
    const stopStream = useCallback(() => {
        if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
        if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        setIsTyping(false);
    }, []);

    return {
        sessions, currentSessionId, isTyping, deletingId, modalConfig,
        setCurrentSessionId, setModalConfig,
        createNewSession, promptDelete, confirmDelete,
        sendMessage, regenerate, editUserMsg, stopStream,
        selectedProvider, setSelectedProvider, providerHealth,
        tutorMode, setTutorMode,
    };
}

export function useAIMemory() {
    const [memory, setMemory] = useState<Record<string, unknown>>({});
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
