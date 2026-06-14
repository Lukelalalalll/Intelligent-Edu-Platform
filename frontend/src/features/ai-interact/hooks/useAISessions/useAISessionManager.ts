import { useCallback, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import {
    aiSessionApi,
    createChatStream,
    type AIProvider,
    type AITutorMode,
    type AISearchEngine,
} from '../../api/aiApi';
import { networkBus } from '@/shared/hooks/useNetworkStatus';
import type { AISession, ChatMessage, RagCitation, UIElement, ToolProgress } from '@/types/api';
import { prepareAttachmentPayload, type AttachmentInput } from './utils/attachmentHelpers';
import {
    buildSession,
    getErrorMessage,
    mergeMessageContent,
    toPayloadMessages,
} from './utils/sessionHelpers';
import { createRafBufferedUpdater, type UIElementHandler, type ToolProgressHandler } from './utils/streamHelpers';
import {
    useInitialSessionsLoad,
    useLazyFetchSessionMessages,
} from './utils/sessionLifecycle';
import { replayFromHistory, resolveTargetSession } from './utils/replayActions';

interface ModalConfig {
    show: boolean;
    sessionId: string | null;
}

interface UseAISessionManagerOptions {
    selectedProvider: AIProvider;
    tutorMode: AITutorMode;
    webSearchRef: MutableRefObject<boolean>;
    searchEngineRef: MutableRefObject<AISearchEngine>;
    enableThinkingRef: MutableRefObject<boolean>;
}

type SessionState = AISession & { _needFetch?: boolean };
type SessionSetter = Dispatch<SetStateAction<SessionState[] | null>>;

export function useAISessionManager({
    selectedProvider,
    tutorMode,
    webSearchRef,
    searchEngineRef,
    enableThinkingRef,
}: UseAISessionManagerOptions) {
    const [sessions, setSessions] = useState<(AISession & { _needFetch?: boolean })[] | null>(null);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [isTyping, setIsTyping] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [modalConfig, setModalConfig] = useState<ModalConfig>({ show: false, sessionId: null });

    const sessionsRef = useRef<SessionState[] | null>(sessions);
    const abortRef = useRef<AbortController | null>(null);
    const rafRef = useRef<number | null>(null);
    const sendingRef = useRef(false);
    sessionsRef.current = sessions;
    const isTypingRef = useRef(isTyping);
    isTypingRef.current = isTyping;

    const applyFetchedSession = useCallback((id: string, data: Partial<AISession>) => {
        setSessions(prev => {
            const list = prev || [];
            return list.map(s => {
                if (s.id !== id) return s;
                if (s._needFetch) {
                    return { ...s, title: data.title || s.title, messages: data.messages || s.messages, _needFetch: false };
                }
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
            const citationsUnchanged = citations === undefined || lastMsg.citations === citations;
            const courseFlagUnchanged = isCourseRelevant === undefined || lastMsg.is_course_relevant === isCourseRelevant;
            const reasoningUnchanged = reasoning === undefined || lastMsg.reasoning === reasoning;
            if (
                lastMsg.content === snapshot &&
                citationsUnchanged &&
                courseFlagUnchanged &&
                reasoningUnchanged
            ) {
                return s;
            }
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

    useInitialSessionsLoad(setSessions as SessionSetter, setCurrentSessionId);
    useLazyFetchSessionMessages(currentSessionId, sessionsRef, applyFetchedSession, markSessionFetchDone);

    const syncToServer = useCallback(async (id: string, data: AISession) => {
        if (!id || !data) return;
        try {
            const normalizedMessages = (data.messages || []).map((msg) => ({
                ...msg,
                content: mergeMessageContent(msg),
            }));
            await aiSessionApi.update(id, { title: data.title, messages: normalizedMessages });
        } catch (err: unknown) {
            const status = (err as { response?: { status?: number } })?.response?.status;
            if (status === 422 || status === 413) {
                try {
                    const trimmed = (data.messages || []).slice(-150).map((msg) => ({
                        ...msg,
                        content: mergeMessageContent(msg),
                    }));
                    await aiSessionApi.update(id, { title: data.title, messages: trimmed });
                } catch {
                    // give up — local state is source of truth
                }
            }
        }
    }, []);

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

    const streamSSE = useCallback(async (apiMessages: ChatMessage[], targetId: string, provider: AIProvider, mode: AITutorMode, signal: AbortSignal, wsearch?: boolean, sengine?: AISearchEngine, think?: boolean) => {
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

        const uiElements: UIElement[] = [];
        const toolProgresses: ToolProgress[] = [];

        const onUIElement: UIElementHandler = (el) => { uiElements.push(el); };
        const onToolProgress: ToolProgressHandler = (tp) => {
            const existingIdx = toolProgresses.findIndex(p => p.name === tp.name && p.status === 'running');
            if (existingIdx >= 0) {
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
                } catch {
                    // skip malformed chunks
                }
            }
        }

        const finalResult = buffered.finalize();

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

        if (networkBus.isOffline) {
            setSessions(prev => (prev || []).map(s => s.id !== targetId ? s : {
                ...s,
                messages: [
                    ...s.messages,
                    { role: 'user' as const, content: combinedUserContent, attachedText, images: images.length ? images : undefined, files: filesMeta.length ? filesMeta : undefined },
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
            const hasUserMessages = s.messages.some(m => m.role === 'user');
            if (!s._needFetch && !hasUserMessages) {
                const display = combinedUserContent || filesMeta[0]?.file_name || attachmentNotes[0];
                title = display.length > 20 ? `${display.slice(0, 20)}...` : (display || 'Attachment only');
            }
            return {
                ...s,
                _needFetch: false,
                title,
                messages: [
                    ...s.messages,
                    { role: 'user' as const, content: combinedUserContent, attachedText, images: images.length ? images : undefined, files: filesMeta.length ? filesMeta : undefined },
                    { role: 'assistant' as const, content: '' },
                ],
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
                { role: 'user' as const, content: combinedUserContent, attachedText, images: images.length ? images : undefined, files: filesMeta.length ? filesMeta : undefined },
            ];
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
    }, [isTyping, currentSessionId, sessions, streamSSE, syncToServer, selectedProvider, tutorMode, webSearchRef, searchEngineRef, enableThinkingRef]);

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
    }, [currentSessionId, streamSSE, syncToServer, selectedProvider, tutorMode, enableThinkingRef]);

    const regenerate = useCallback(async (msgIndex: number) => {
        const { targetId, session } = resolveTargetSession(
            currentSessionId, sessionsRef.current,
        );
        if (!targetId || !session) return;
        const history = session.messages.slice(0, msgIndex);
        await replayExistingHistory(history);
    }, [currentSessionId, replayExistingHistory]);

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

    const stopStream = useCallback(() => {
        if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
        if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        setIsTyping(false);
    }, []);

    return {
        sessions,
        currentSessionId,
        isTyping,
        deletingId,
        modalConfig,
        setCurrentSessionId,
        setModalConfig,
        createNewSession,
        confirmDelete,
        sendMessage,
        regenerate,
        editUserMsg,
        stopStream,
    };
}
