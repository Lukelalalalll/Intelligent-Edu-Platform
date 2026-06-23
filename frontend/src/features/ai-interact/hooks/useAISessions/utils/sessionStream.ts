import type React from 'react';

import {
    createChatStream,
    type AIProvider,
    type AITutorMode,
    type AISearchEngine,
} from '../../../api/aiApi';
import type { ChatMessage, RagCitation } from '@/types/api';

import { createRafBufferedUpdater, type UIElementHandler, type ToolProgressHandler } from './streamHelpers';
import type { SessionStreamResult } from './sessionManagerTypes';
import type { ToolProgress, UIElement } from './streamHelpers';

interface SessionStreamParams {
    apiMessages: ChatMessage[];
    targetId: string;
    provider: AIProvider;
    mode: AITutorMode;
    signal: AbortSignal;
    webSearch?: boolean;
    searchEngine?: AISearchEngine;
    enableThinking?: boolean;
    rafRef: React.MutableRefObject<number | null>;
    onAssistantSnapshot: (
        snapshot: string,
        citations?: RagCitation[],
        isCourseRelevant?: boolean,
        reasoning?: string,
    ) => void;
    createStream?: typeof createChatStream;
}

function isAbortError(err: unknown): boolean {
    return (err as { name?: string } | null)?.name === 'AbortError';
}

export async function runSessionStream({
    apiMessages,
    targetId,
    provider,
    mode,
    signal,
    webSearch,
    searchEngine,
    enableThinking,
    rafRef,
    onAssistantSnapshot,
    createStream = createChatStream,
}: SessionStreamParams): Promise<SessionStreamResult> {
    let response: Response;

    try {
        response = await createStream(
            apiMessages,
            provider,
            mode,
            targetId,
            signal,
            webSearch,
            searchEngine,
            enableThinking,
        );
    } catch (err: unknown) {
        if (isAbortError(err)) {
            return { kind: 'aborted' };
        }
        throw err;
    }

    if (!response.ok) {
        return { kind: 'api_error', statusCode: response.status };
    }

    if (!response.body) {
        return { kind: 'empty_body' };
    }

    const uiElements: UIElement[] = [];
    const toolProgresses: ToolProgress[] = [];

    const onUIElement: UIElementHandler = (element) => {
        uiElements.push(element);
    };

    const onToolProgress: ToolProgressHandler = (progress) => {
        const existingIndex = toolProgresses.findIndex(
            (item) => item.name === progress.name && item.status === 'running',
        );

        if (existingIndex >= 0) {
            toolProgresses[existingIndex] = progress;
            return;
        }

        toolProgresses.push(progress);
    };

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    const buffered = createRafBufferedUpdater(onAssistantSnapshot, rafRef, onUIElement, onToolProgress);

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data: ')) {
                    continue;
                }

                const raw = trimmed.slice(6);
                if (raw === '[DONE]') {
                    continue;
                }

                try {
                    buffered.consumeSseObject(JSON.parse(raw));
                } catch {
                    // Skip malformed chunks and continue streaming.
                }
            }
        }
    } catch (err: unknown) {
        if (isAbortError(err)) {
            return { kind: 'aborted' };
        }
        throw err;
    }

    const finalResult = buffered.finalize();

    return {
        kind: 'success',
        content: finalResult.snapshot,
        citations: finalResult.citations,
        isCourseRelevant: finalResult.isCourseRelevant,
        reasoning: finalResult.reasoning,
        uiElements,
        toolProgresses,
    };
}
