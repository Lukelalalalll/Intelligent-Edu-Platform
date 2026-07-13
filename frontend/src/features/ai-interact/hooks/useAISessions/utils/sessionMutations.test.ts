import { describe, expect, it } from 'vitest';

import type { SessionState } from './sessionManagerTypes';
import {
    applyFetchedSessionData,
    appendOptimisticAssistantTurn,
    removeSessionAndResolveSelection,
} from './sessionMutations';

const SYSTEM_MESSAGE = { role: 'system' as const, content: 'System' };

describe('sessionMutations', () => {
    it('replaces a lazy session window when _needFetch is still set', () => {
        const sessions: SessionState[] = [
            {
                id: 'session-1',
                title: 'Draft',
                messages: [SYSTEM_MESSAGE],
                historyStart: 10,
                messageCount: 12,
                hasMoreMessages: true,
                _needFetch: true,
            },
        ];

        const updated = applyFetchedSessionData(sessions, 'session-1', {
            title: 'Loaded session',
            messages: [
                SYSTEM_MESSAGE,
                { role: 'user', content: 'Question' },
                { role: 'assistant', content: 'Answer' },
            ],
            historyStart: 0,
            messageCount: 3,
            hasMoreMessages: false,
        });

        expect(updated).toEqual([
            {
                id: 'session-1',
                title: 'Loaded session',
                messages: [
                    SYSTEM_MESSAGE,
                    { role: 'user', content: 'Question' },
                    { role: 'assistant', content: 'Answer' },
                ],
                historyStart: 0,
                messageCount: 3,
                hasMoreMessages: false,
                _needFetch: false,
            },
        ]);
    });

    it('prepends only missing fetched history when local replay state is already authoritative', () => {
        const sessions: SessionState[] = [
            {
                id: 'session-1',
                title: 'Local replay',
                messages: [
                    SYSTEM_MESSAGE,
                    { role: 'user', content: 'Edited question' },
                    { role: 'assistant', content: 'Updated answer' },
                ],
                historyStart: 8,
                messageCount: 20,
                hasMoreMessages: true,
                _needFetch: false,
            },
        ];

        const updated = applyFetchedSessionData(sessions, 'session-1', {
            messages: [
                SYSTEM_MESSAGE,
                { role: 'user', content: 'Original question' },
                { role: 'assistant', content: 'Original answer' },
                { role: 'user', content: 'Edited question' },
                { role: 'assistant', content: 'Updated answer' },
            ],
            historyStart: 6,
            messageCount: 22,
            hasMoreMessages: true,
        });

        expect(updated?.[0].messages).toEqual([
            { role: 'user', content: 'Original question' },
            { role: 'assistant', content: 'Original answer' },
            SYSTEM_MESSAGE,
            { role: 'user', content: 'Edited question' },
            { role: 'assistant', content: 'Updated answer' },
        ]);
        expect(updated?.[0]._needFetch).toBe(false);
    });

    it('builds a first-turn title and optimistic assistant placeholder without changing the public shape', () => {
        const sessions: SessionState[] = [
            {
                id: 'session-1',
                title: 'New Conversation',
                messages: [SYSTEM_MESSAGE],
                historyStart: 0,
                messageCount: 1,
                hasMoreMessages: false,
            },
        ];

        const updated = appendOptimisticAssistantTurn(
            sessions,
            'session-1',
            {
                content: 'This is a much longer first question than twenty characters',
            },
        );

        expect(updated?.[0].title).toBe('This is a much longe...');
        expect(updated?.[0].messageCount).toBe(3);
        expect(updated?.[0].messages.at(-2)).toEqual({
            role: 'user',
            content: 'This is a much longer first question than twenty characters',
        });
        expect(updated?.[0].messages.at(-1)).toEqual({
            role: 'assistant',
            content: '',
        });
    });

    it('resolves deletion selection for both remaining and empty session lists', () => {
        const sessions: SessionState[] = [
            { id: 'session-1', title: 'One', messages: [SYSTEM_MESSAGE] },
            { id: 'session-2', title: 'Two', messages: [SYSTEM_MESSAGE] },
        ];

        expect(removeSessionAndResolveSelection(sessions, 'session-1', 'session-1')).toEqual({
            remaining: [{ id: 'session-2', title: 'Two', messages: [SYSTEM_MESSAGE] }],
            nextCurrentSessionId: 'session-2',
            shouldCreateReplacement: false,
        });

        expect(removeSessionAndResolveSelection([{ id: 'only', title: 'Only', messages: [SYSTEM_MESSAGE] }], 'only', 'only')).toEqual({
            remaining: [],
            nextCurrentSessionId: null,
            shouldCreateReplacement: true,
        });
    });
});
