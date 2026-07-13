import { useCallback, useRef, useState, type MutableRefObject } from 'react';

import {
    aiSessionApi,
    type AIProvider,
    type AITutorMode,
    type AISearchEngine,
} from '../../api/aiApi';
import { networkBus } from '@/shared/hooks/useNetworkStatus';
import type { AISession, ChatMessage } from '@/types/api';

import { prepareAttachmentPayload, type AttachmentInput } from './utils/attachmentHelpers';
import { normalizeOfflineSessionError, normalizeSessionStreamError, normalizeThrownSessionError } from './utils/sessionErrors';
import type {
    AssistantTurnOptions,
    ModalConfig,
    NormalizedSessionError,
    SessionSetter,
    SessionState,
    SessionStreamResult,
} from './utils/sessionManagerTypes';
import {
    applyAssistantSnapshotToSessions,
    applyFetchedSessionData,
    appendOfflineAssistantReply,
    appendOptimisticAssistantTurn,
    buildUserChatMessage,
    finalizeAssistantMessageInSession,
    finalizeAssistantMessageInSessions,
    findSessionById,
    markSessionFetchCompleted,
    prependSession,
    removeSessionAndResolveSelection,
    replaceLastAssistantMessageInSession,
    replaceLastAssistantMessageInSessions,
    resetSessionHistoryWithPendingAssistant,
} from './utils/sessionMutations';
import { buildSession, toPayloadMessages } from './utils/sessionHelpers';
import {
    useInitialSessionsLoad,
    useLazyFetchSessionMessages,
} from './utils/sessionLifecycle';
import { resolveTargetSession } from './utils/replayActions';
import { runSessionStream } from './utils/sessionStream';
import { syncSessionToServer } from './utils/sessionSync';

interface UseAISessionManagerOptions {
    selectedProvider: AIProvider;
    tutorMode: AITutorMode;
    webSearchRef: MutableRefObject<boolean>;
    searchEngineRef: MutableRefObject<AISearchEngine>;
    enableThinkingRef: MutableRefObject<boolean>;
}

export function useAISessionManager({
    selectedProvider,
    tutorMode,
    webSearchRef,
    searchEngineRef,
    enableThinkingRef,
}: UseAISessionManagerOptions) {
    const [sessions, setSessions] = useState<SessionState[] | null>(null);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [isTyping, setIsTyping] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [modalConfig, setModalConfig] = useState<ModalConfig>({ show: false, sessionId: null });

    const sessionsRef = useRef<SessionState[] | null>(sessions);
    const abortRef = useRef<AbortController | null>(null);
    const rafRef = useRef<number | null>(null);
    const sendingRef = useRef(false);
    const isTypingRef = useRef(isTyping);

    sessionsRef.current = sessions;
    isTypingRef.current = isTyping;

    const applyFetchedSession = useCallback((id: string, data: Partial<AISession>) => {
        setSessions((prev) => applyFetchedSessionData(prev, id, data));
    }, []);

    const markSessionFetchDone = useCallback((id: string) => {
        setSessions((prev) => markSessionFetchCompleted(prev, id));
    }, []);

    const applyAssistantSnapshot = useCallback(
        (
            targetId: string,
            snapshot: string,
            citations?: AISession['messages'][number]['citations'],
            isCourseRelevant?: boolean,
            reasoning?: string,
        ) => {
            setSessions((prev) =>
                applyAssistantSnapshotToSessions(prev, targetId, snapshot, citations, isCourseRelevant, reasoning),
            );
        },
        [],
    );

    useInitialSessionsLoad(setSessions as SessionSetter, setCurrentSessionId);
    useLazyFetchSessionMessages(currentSessionId, sessionsRef, applyFetchedSession, markSessionFetchDone);

    const syncToServer = useCallback(async (id: string, data: AISession) => {
        await syncSessionToServer(id, data);
    }, []);

    const scheduleTypingReset = useCallback(() => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setIsTyping(false);
            });
        });
    }, []);

    const runAssistantTurn = useCallback(
        async ({
            targetId,
            apiMessages,
            optimisticUpdate,
            webSearch,
            searchEngine,
            enableThinking,
            awaitPersistence = false,
            sendingAlreadyLocked = false,
            provider,
            tutorMode: mode,
        }: AssistantTurnOptions) => {
            if (!sendingAlreadyLocked) {
                if (sendingRef.current || isTypingRef.current) {
                    return;
                }
                sendingRef.current = true;
            }

            if (abortRef.current) {
                abortRef.current.abort();
            }

            const controller = new AbortController();
            abortRef.current = controller;

            const optimisticSessions = optimisticUpdate(sessionsRef.current);
            const optimisticSession = findSessionById(optimisticSessions, targetId);

            setSessions(optimisticSessions);
            setIsTyping(true);

            let streamResult: SessionStreamResult | undefined;
            let normalizedError: NormalizedSessionError | undefined;

            try {
                streamResult = await runSessionStream({
                    apiMessages: toPayloadMessages(apiMessages),
                    targetId,
                    provider,
                    mode,
                    signal: controller.signal,
                    webSearch,
                    searchEngine,
                    enableThinking,
                    rafRef,
                    onAssistantSnapshot: (snapshot, citations, isCourseRelevant, reasoning) => {
                        applyAssistantSnapshot(targetId, snapshot, citations, isCourseRelevant, reasoning);
                    },
                });

                if (streamResult.kind !== 'success') {
                    normalizedError = normalizeSessionStreamError(streamResult);
                }
            } catch (err: unknown) {
                normalizedError = normalizeThrownSessionError(err);
            } finally {
                scheduleTypingReset();
                abortRef.current = null;
                sendingRef.current = false;

                const latestSession = findSessionById(sessionsRef.current, targetId) || optimisticSession;
                if (!latestSession) {
                    return;
                }

                let sessionToPersist: AISession = latestSession;
                const successfulStream = streamResult?.kind === 'success' ? streamResult : null;

                if (successfulStream) {
                    sessionToPersist = finalizeAssistantMessageInSession(latestSession, successfulStream);
                    setSessions((prev) => finalizeAssistantMessageInSessions(prev, targetId, successfulStream));
                } else if (normalizedError?.assistantMessage) {
                    sessionToPersist = replaceLastAssistantMessageInSession(latestSession, normalizedError.assistantMessage);
                    setSessions((prev) =>
                        replaceLastAssistantMessageInSessions(prev, targetId, normalizedError!.assistantMessage!),
                    );
                }

                const persistence = syncToServer(targetId, sessionToPersist);
                if (awaitPersistence) {
                    await persistence;
                } else {
                    void persistence;
                }
            }
        },
        [applyAssistantSnapshot, scheduleTypingReset, syncToServer],
    );

    const createNewSession = useCallback(async (switchImmediately = true) => {
        try {
            const newSession = await aiSessionApi.create();
            setSessions((prev) => prependSession(prev, buildSession(newSession)));
            if (switchImmediately) {
                setCurrentSessionId(newSession.id);
            }
        } catch {
            const localSession = { ...buildSession({}), id: `local_${Date.now()}` };
            setSessions((prev) => prependSession(prev, localSession));
            if (switchImmediately) {
                setCurrentSessionId(localSession.id);
            }
        }
    }, []);

    const confirmDelete = useCallback(async () => {
        const id = modalConfig.sessionId;
        setModalConfig({ show: false, sessionId: null });

        if (!id) {
            return;
        }

        setDeletingId(id);
        aiSessionApi.remove(id).catch(() => {});

        setTimeout(async () => {
            const deletion = removeSessionAndResolveSelection(sessionsRef.current, currentSessionId, id);
            setSessions(deletion.remaining);

            if (deletion.shouldCreateReplacement) {
                await createNewSession(true);
            } else if (deletion.nextCurrentSessionId !== currentSessionId) {
                setCurrentSessionId(deletion.nextCurrentSessionId);
            }

            setDeletingId(null);
        }, 300);
    }, [modalConfig.sessionId, currentSessionId, createNewSession]);

    const sendMessage = useCallback(
        async (text: string, attachedFiles: AttachmentInput[] = []) => {
            if (sendingRef.current || isTypingRef.current || (!text.trim() && attachedFiles.length === 0)) {
                return;
            }

            sendingRef.current = true;

            const { targetId, session } = resolveTargetSession(currentSessionId, sessionsRef.current);
            if (!targetId || !session) {
                sendingRef.current = false;
                return;
            }

            if (targetId !== currentSessionId) {
                setCurrentSessionId(targetId);
            }

            const trimmed = text.trim();
            let attachmentPayload;
            try {
                attachmentPayload = await prepareAttachmentPayload(attachedFiles);
            } catch (err) {
                sendingRef.current = false;
                throw err;
            }

            const { images, attachmentNotes, filesMeta } = attachmentPayload;
            const attachedText = attachmentNotes.length > 0 ? attachmentNotes.join('\n\n') : undefined;

            if (!trimmed && !attachedText && images.length === 0) {
                sendingRef.current = false;
                return;
            }

            const draft = {
                content: trimmed,
                attachedText,
                ...(images.length ? { images } : {}),
                ...(filesMeta.length ? { files: filesMeta } : {}),
            };

            if (networkBus.isOffline) {
                const offlineError = normalizeOfflineSessionError();
                setSessions((prev) =>
                    appendOfflineAssistantReply(prev, targetId, draft, offlineError.assistantMessage || ''),
                );
                sendingRef.current = false;
                return;
            }

            const apiMessages: ChatMessage[] = [...session.messages, buildUserChatMessage(draft)];

            await runAssistantTurn({
                targetId,
                apiMessages,
                optimisticUpdate: (list) => appendOptimisticAssistantTurn(list, targetId, draft, attachmentNotes),
                webSearch: webSearchRef.current,
                searchEngine: searchEngineRef.current,
                enableThinking: enableThinkingRef.current,
                awaitPersistence: false,
                sendingAlreadyLocked: true,
                provider: selectedProvider,
                tutorMode,
            });
        },
        [currentSessionId, enableThinkingRef, runAssistantTurn, searchEngineRef, selectedProvider, tutorMode, webSearchRef],
    );

    const replayExistingHistory = useCallback(
        async (history: ChatMessage[]) => {
            const targetId = currentSessionId || (sessionsRef.current || [])[0]?.id || null;
            if (!targetId) {
                return;
            }

            await runAssistantTurn({
                targetId,
                apiMessages: history,
                optimisticUpdate: (list) => resetSessionHistoryWithPendingAssistant(list, targetId, history),
                enableThinking: enableThinkingRef.current,
                awaitPersistence: true,
                provider: selectedProvider,
                tutorMode,
            });
        },
        [currentSessionId, enableThinkingRef, runAssistantTurn, selectedProvider, tutorMode],
    );

    const regenerate = useCallback(
        async (msgIndex: number) => {
            const { session } = resolveTargetSession(currentSessionId, sessionsRef.current);
            if (!session) {
                return;
            }

            const history = session.messages.slice(0, msgIndex);
            await replayExistingHistory(history);
        },
        [currentSessionId, replayExistingHistory],
    );

    const editUserMsg = useCallback(
        async (msgIndex: number, newValue: string) => {
            if (!newValue?.trim()) {
                return;
            }

            const { session } = resolveTargetSession(currentSessionId, sessionsRef.current);
            if (!session || session.messages[msgIndex]?.role !== 'user') {
                return;
            }

            const history = [
                ...session.messages.slice(0, msgIndex),
                { ...session.messages[msgIndex], content: newValue.trim() },
            ];

            await replayExistingHistory(history);
        },
        [currentSessionId, replayExistingHistory],
    );

    const stopStream = useCallback(() => {
        if (abortRef.current) {
            abortRef.current.abort();
            abortRef.current = null;
        }
        if (rafRef.current != null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
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
