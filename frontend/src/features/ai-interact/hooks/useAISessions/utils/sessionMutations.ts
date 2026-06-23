import type { AISession, ChatMessage, RagCitation } from '@/types/api';

import type {
    SessionDraftMessage,
    SessionListState,
    SessionState,
    SessionStreamSuccess,
} from './sessionManagerTypes';

function buildMessageKey(message: ChatMessage): string {
    return `${message.role}:${(message.content || '').slice(0, 120)}`;
}

export function buildUserChatMessage(draft: SessionDraftMessage): ChatMessage {
    return {
        role: 'user',
        content: draft.content,
        ...(draft.attachedText ? { attachedText: draft.attachedText } : {}),
        ...(draft.images?.length ? { images: draft.images } : {}),
        ...(draft.files?.length ? { files: draft.files } : {}),
    };
}

export function buildAssistantChatMessage(content: string = ''): ChatMessage {
    return { role: 'assistant', content };
}

function updateTargetSession(
    sessions: SessionListState,
    targetId: string,
    updater: (session: SessionState) => SessionState,
): SessionListState {
    return (sessions || []).map((session) => (session.id === targetId ? updater(session) : session));
}

export function findSessionById(sessions: SessionListState, targetId: string): SessionState | null {
    return (sessions || []).find((session) => session.id === targetId) || null;
}

export function prependSession(sessions: SessionListState, session: SessionState): SessionState[] {
    return [session, ...(sessions || [])];
}

export function applyFetchedSessionData(
    sessions: SessionListState,
    id: string,
    data: Partial<AISession>,
): SessionListState {
    return updateTargetSession(sessions, id, (session) => {
        if (session._needFetch) {
            return {
                ...session,
                title: data.title || session.title,
                messages: data.messages || session.messages,
                historyStart: data.historyStart ?? session.historyStart ?? 0,
                messageCount: data.messageCount ?? session.messageCount ?? data.messages?.length ?? session.messages.length,
                hasMoreMessages: data.hasMoreMessages ?? session.hasMoreMessages ?? false,
                _needFetch: false,
            };
        }

        const fetchedMessages = data.messages || [];
        if (fetchedMessages.length === 0) {
            return session;
        }

        const localKeys = new Set(session.messages.map(buildMessageKey));
        const missingMessages = fetchedMessages.filter((message) => !localKeys.has(buildMessageKey(message)));

        if (missingMessages.length === 0) {
            return session;
        }

        return {
            ...session,
            title: data.title || session.title,
            messages: [...missingMessages, ...session.messages],
            historyStart: data.historyStart ?? Math.max(0, (session.historyStart ?? 0) - missingMessages.length),
            messageCount: data.messageCount ?? session.messageCount,
            hasMoreMessages: data.hasMoreMessages ?? session.hasMoreMessages,
        };
    });
}

export function markSessionFetchCompleted(sessions: SessionListState, id: string): SessionListState {
    return updateTargetSession(sessions, id, (session) => ({ ...session, _needFetch: false }));
}

export function applyAssistantSnapshotToSessions(
    sessions: SessionListState,
    targetId: string,
    snapshot: string,
    citations?: RagCitation[],
    isCourseRelevant?: boolean,
    reasoning?: string,
): SessionListState {
    return updateTargetSession(sessions, targetId, (session) => {
        const messages = [...session.messages];
        const lastMessage = messages.at(-1);

        if (!lastMessage || lastMessage.role !== 'assistant') {
            return session;
        }

        const citationsUnchanged = citations === undefined || lastMessage.citations === citations;
        const courseFlagUnchanged =
            isCourseRelevant === undefined || lastMessage.is_course_relevant === isCourseRelevant;
        const reasoningUnchanged = reasoning === undefined || lastMessage.reasoning === reasoning;

        if (
            lastMessage.content === snapshot &&
            citationsUnchanged &&
            courseFlagUnchanged &&
            reasoningUnchanged
        ) {
            return session;
        }

        messages[messages.length - 1] = {
            ...lastMessage,
            content: snapshot,
            ...(citations ? { citations } : {}),
            ...(isCourseRelevant !== undefined ? { is_course_relevant: isCourseRelevant } : {}),
            ...(reasoning ? { reasoning } : {}),
        };

        return { ...session, messages };
    });
}

export function deriveNewSessionTitle(
    session: SessionState,
    draft: SessionDraftMessage,
    attachmentNotes: string[] = [],
): string {
    const hasUserMessages = session.messages.some((message) => message.role === 'user');
    if (session._needFetch || hasUserMessages) {
        return session.title;
    }

    const display = draft.content || draft.files?.[0]?.file_name || attachmentNotes[0];
    if (!display) {
        return 'Attachment only';
    }

    return display.length > 20 ? `${display.slice(0, 20)}...` : display;
}

export function appendOptimisticAssistantTurn(
    sessions: SessionListState,
    targetId: string,
    draft: SessionDraftMessage,
    attachmentNotes: string[] = [],
): SessionListState {
    const userMessage = buildUserChatMessage(draft);

    return updateTargetSession(sessions, targetId, (session) => ({
        ...session,
        _needFetch: false,
        historyStart: session.historyStart ?? 0,
        messageCount: (session.messageCount ?? session.messages.length) + 2,
        hasMoreMessages: session.hasMoreMessages ?? false,
        title: deriveNewSessionTitle(session, draft, attachmentNotes),
        messages: [...session.messages, userMessage, buildAssistantChatMessage()],
    }));
}

export function appendOfflineAssistantReply(
    sessions: SessionListState,
    targetId: string,
    draft: SessionDraftMessage,
    assistantMessage: string,
): SessionListState {
    const userMessage = buildUserChatMessage(draft);

    return updateTargetSession(sessions, targetId, (session) => ({
        ...session,
        messages: [...session.messages, userMessage, buildAssistantChatMessage(assistantMessage)],
    }));
}

export function resetSessionHistoryWithPendingAssistant(
    sessions: SessionListState,
    targetId: string,
    history: ChatMessage[],
): SessionListState {
    return updateTargetSession(sessions, targetId, (session) => ({
        ...session,
        _needFetch: false,
        messages: [...history, buildAssistantChatMessage()],
    }));
}

export function replaceLastAssistantMessageInSession(session: SessionState, content: string): SessionState {
    if (session.messages.length === 0) {
        return session;
    }

    return {
        ...session,
        messages: [...session.messages.slice(0, -1), buildAssistantChatMessage(content)],
    };
}

export function replaceLastAssistantMessageInSessions(
    sessions: SessionListState,
    targetId: string,
    content: string,
): SessionListState {
    return updateTargetSession(sessions, targetId, (session) => replaceLastAssistantMessageInSession(session, content));
}

export function finalizeAssistantMessageInSession(
    session: SessionState,
    result: SessionStreamSuccess,
): SessionState {
    const messages = [...session.messages];
    const lastMessage = messages.at(-1);

    if (!lastMessage || lastMessage.role !== 'assistant') {
        return session;
    }

    messages[messages.length - 1] = {
        ...lastMessage,
        content: result.content,
        ...(result.citations ? { citations: result.citations } : {}),
        ...(result.isCourseRelevant !== undefined ? { is_course_relevant: result.isCourseRelevant } : {}),
        ...(result.reasoning ? { reasoning: result.reasoning } : {}),
        ...(result.uiElements.length ? { ui_elements: [...result.uiElements] } : {}),
        ...(result.toolProgresses.length ? { tool_progresses: [...result.toolProgresses] } : {}),
    };

    return {
        ...session,
        messageCount: session.messageCount ?? session.messages.length,
        messages,
    };
}

export function finalizeAssistantMessageInSessions(
    sessions: SessionListState,
    targetId: string,
    result: SessionStreamSuccess,
): SessionListState {
    return updateTargetSession(sessions, targetId, (session) => finalizeAssistantMessageInSession(session, result));
}

export function removeSessionAndResolveSelection(
    sessions: SessionListState,
    currentSessionId: string | null,
    deletedId: string,
): {
    remaining: SessionState[];
    nextCurrentSessionId: string | null;
    shouldCreateReplacement: boolean;
} {
    const remaining = (sessions || []).filter((session) => session.id !== deletedId);

    if (remaining.length === 0) {
        return {
            remaining,
            nextCurrentSessionId: null,
            shouldCreateReplacement: true,
        };
    }

    return {
        remaining,
        nextCurrentSessionId: currentSessionId === deletedId ? remaining[0].id : currentSessionId,
        shouldCreateReplacement: false,
    };
}
