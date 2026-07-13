import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runSessionStream } from './sessionStream';

const encoder = new TextEncoder();

function encodeDataFrame(payload: unknown): Uint8Array {
    return encoder.encode(`data: ${JSON.stringify(payload)}\n`);
}

function encodeRawFrame(raw: string): Uint8Array {
    return encoder.encode(raw);
}

describe('runSessionStream', () => {
    const rafQueue: Array<FrameRequestCallback | null> = [];

    const flushAnimationFrame = () => {
        const callbacks = rafQueue.splice(0, rafQueue.length);
        callbacks.forEach((callback, index) => callback?.(index * 16));
    };

    beforeEach(() => {
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            rafQueue.push(callback);
            return rafQueue.length;
        });
        vi.stubGlobal('cancelAnimationFrame', (id: number) => {
            const index = id - 1;
            if (index >= 0 && index < rafQueue.length) {
                rafQueue[index] = null;
            }
        });
    });

    afterEach(() => {
        rafQueue.length = 0;
        vi.unstubAllGlobals();
    });

    it('increments snapshots across frames and collects structured stream metadata', async () => {
        const snapshots: string[] = [];
        let resolveSecondRead: ((value: ReadableStreamReadResult<Uint8Array>) => void) | null = null;

        const reader = {
            read: vi
                .fn()
                .mockResolvedValueOnce({
                    done: false,
                    value: encodeDataFrame({ choices: [{ delta: { content: 'Hel' } }] }),
                })
                .mockImplementationOnce(
                    () =>
                        new Promise<ReadableStreamReadResult<Uint8Array>>((resolve) => {
                            resolveSecondRead = resolve;
                        }),
                )
                .mockResolvedValueOnce({ done: true, value: undefined }),
        };

        const promise = runSessionStream({
            apiMessages: [{ role: 'user', content: 'Hi' }],
            targetId: 'session-1',
            provider: 'coze',
            mode: 'hint_only',
            signal: new AbortController().signal,
            rafRef: { current: null },
            onAssistantSnapshot: (snapshot) => {
                snapshots.push(snapshot);
            },
            createStream: vi.fn().mockResolvedValue({
                ok: true,
                body: { getReader: () => reader },
            } as unknown as Response),
        });

        await Promise.resolve();
        await Promise.resolve();
        flushAnimationFrame();
        expect(snapshots.at(-1)).toBe('Hel');

        resolveSecondRead!({
            done: false,
            value: encoder.encode(
                [
                    `data: ${JSON.stringify({ type: 'answer', content: 'lo' })}`,
                    `data: ${JSON.stringify({ type: 'think', content: 'Reasoning' })}`,
                    `data: ${JSON.stringify({ meta: { citations: [{ index: 1, doc_name: 'Doc', score: 0.9, text: 'Snippet' }], is_course_relevant: true } })}`,
                    `data: ${JSON.stringify({ ui_element: { type: 'file', file_name: 'notes.txt' } })}`,
                    `data: ${JSON.stringify({ tool_progress: { name: 'RAG', status: 'running', message: 'loading' } })}`,
                    `data: ${JSON.stringify({ tool_progress: { name: 'RAG', status: 'done', message: 'done' } })}`,
                    'data: {not-json}',
                    'data: [DONE]',
                ].join('\n'),
            ),
        });

        const result = await promise;

        expect(result).toEqual({
            kind: 'success',
            content: 'Hello\n\n[File: notes.txt]\n\n',
            citations: [{ index: 1, doc_name: 'Doc', score: 0.9, text: 'Snippet' }],
            isCourseRelevant: true,
            reasoning: 'Reasoning',
            uiElements: [{ type: 'file', file_name: 'notes.txt' }],
            toolProgresses: [{ name: 'RAG', status: 'done', message: 'done' }],
        });
    });

    it('returns an api_error result for non-2xx responses', async () => {
        const result = await runSessionStream({
            apiMessages: [{ role: 'user', content: 'Hi' }],
            targetId: 'session-1',
            provider: 'coze',
            mode: 'hint_only',
            signal: new AbortController().signal,
            rafRef: { current: null },
            onAssistantSnapshot: () => {},
            createStream: vi.fn().mockResolvedValue({ ok: false, status: 503 } as unknown as Response),
        });

        expect(result).toEqual({ kind: 'api_error', statusCode: 503 });
    });

    it('returns empty_body when the server response has no readable stream', async () => {
        const result = await runSessionStream({
            apiMessages: [{ role: 'user', content: 'Hi' }],
            targetId: 'session-1',
            provider: 'coze',
            mode: 'hint_only',
            signal: new AbortController().signal,
            rafRef: { current: null },
            onAssistantSnapshot: () => {},
            createStream: vi.fn().mockResolvedValue({ ok: true, body: null } as unknown as Response),
        });

        expect(result).toEqual({ kind: 'empty_body' });
    });

    it('returns aborted when the stream reader is interrupted', async () => {
        const abortError = new DOMException('Aborted', 'AbortError');
        const reader = {
            read: vi.fn().mockRejectedValue(abortError),
        };

        const result = await runSessionStream({
            apiMessages: [{ role: 'user', content: 'Hi' }],
            targetId: 'session-1',
            provider: 'coze',
            mode: 'hint_only',
            signal: new AbortController().signal,
            rafRef: { current: null },
            onAssistantSnapshot: () => {},
            createStream: vi.fn().mockResolvedValue({
                ok: true,
                body: { getReader: () => reader },
            } as unknown as Response),
        });

        expect(result).toEqual({ kind: 'aborted' });
    });
});
