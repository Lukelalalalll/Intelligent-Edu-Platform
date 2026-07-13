import type React from 'react';

import type { AIProvider, AITutorMode, AISearchEngine } from '../../../api/aiApi';
import type { AISession, ChatMessage, RagCitation, UIElement, ToolProgress } from '@/types/api';

export interface ModalConfig {
    show: boolean;
    sessionId: string | null;
}

export type SessionState = AISession & { _needFetch?: boolean };
export type SessionListState = SessionState[] | null;
export type SessionSetter = React.Dispatch<React.SetStateAction<SessionListState>>;

export interface SessionDraftMessage {
    content: string;
    attachedText?: string;
    images?: string[];
    files?: Array<{ file_name: string; mime_type: string }>;
}

export interface SessionStreamSuccess {
    kind: 'success';
    content: string;
    citations?: RagCitation[];
    isCourseRelevant?: boolean;
    reasoning?: string;
    uiElements: UIElement[];
    toolProgresses: ToolProgress[];
}

export type SessionStreamResult =
    | SessionStreamSuccess
    | { kind: 'api_error'; statusCode: number }
    | { kind: 'empty_body' }
    | { kind: 'aborted' };

export interface NormalizedSessionError {
    kind: 'offline' | 'api_error' | 'empty_body' | 'network_error' | 'aborted';
    assistantMessage?: string;
}

export interface AssistantTurnOptions {
    targetId: string;
    apiMessages: ChatMessage[];
    optimisticUpdate: (sessions: SessionListState) => SessionListState;
    webSearch?: boolean;
    searchEngine?: AISearchEngine;
    enableThinking?: boolean;
    awaitPersistence?: boolean;
    sendingAlreadyLocked?: boolean;
    provider: AIProvider;
    tutorMode: AITutorMode;
}
