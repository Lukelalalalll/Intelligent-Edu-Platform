import { describe, expect, it, vi } from 'vitest';

import type { AISession } from '@/types/api';

import { syncSessionToServer } from './sessionSync';

function buildSession(messageCount: number): AISession {
    return {
        id: 'session-1',
        title: 'Sync test',
        historyStart: 10,
        messages: Array.from({ length: messageCount }, (_, index) => ({
            role: index % 2 === 0 ? 'user' : 'assistant',
            content: `Message ${index}`,
            attachedText: index === 0 ? 'Attachment details' : undefined,
        })),
    };
}

describe('syncSessionToServer', () => {
    it('normalizes attached text into message content before persisting', async () => {
        const updateSession = vi.fn().mockResolvedValue(undefined);

        await syncSessionToServer('session-1', buildSession(2), { updateSession });

        expect(updateSession).toHaveBeenCalledTimes(1);
        expect(updateSession).toHaveBeenCalledWith('session-1', {
            title: 'Sync test',
            history_start: 10,
            messages: [
                {
                    role: 'user',
                    content: 'Message 0\n\nAttachment details',
                    attachedText: 'Attachment details',
                },
                {
                    role: 'assistant',
                    content: 'Message 1',
                    attachedText: undefined,
                },
            ],
        });
    });

    it('retries with the most recent 150 messages after a 422/413 response', async () => {
        const updateSession = vi
            .fn()
            .mockRejectedValueOnce({ response: { status: 422 } })
            .mockResolvedValueOnce(undefined);

        const session = buildSession(200);
        await syncSessionToServer('session-1', session, { updateSession });

        expect(updateSession).toHaveBeenCalledTimes(2);
        expect(updateSession.mock.calls[1][1].messages).toHaveLength(150);
        expect(updateSession.mock.calls[1][1].history_start).toBe(60);
    });

    it('swallows a failed trim retry and keeps local state authoritative', async () => {
        const updateSession = vi
            .fn()
            .mockRejectedValueOnce({ response: { status: 413 } })
            .mockRejectedValueOnce(new Error('still too large'));

        await expect(syncSessionToServer('session-1', buildSession(180), { updateSession })).resolves.toBeUndefined();
        expect(updateSession).toHaveBeenCalledTimes(2);
    });
});
