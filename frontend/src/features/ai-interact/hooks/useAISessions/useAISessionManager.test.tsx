import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { networkBus } from '@/shared/hooks/useNetworkStatus';

const { mockAiSessionApi, mockCreateChatStream, mockPrepareAttachmentPayload } = vi.hoisted(() => ({
    mockAiSessionApi: {
        list: vi.fn(),
        get: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
    },
    mockCreateChatStream: vi.fn(),
    mockPrepareAttachmentPayload: vi.fn(),
}));

vi.mock('../../api/aiApi', () => ({
    aiSessionApi: mockAiSessionApi,
    createChatStream: (...args: unknown[]) => mockCreateChatStream(...args),
}));

vi.mock('./utils/attachmentHelpers', () => ({
    prepareAttachmentPayload: (...args: unknown[]) => mockPrepareAttachmentPayload(...args),
}));

import { useAISessionManager } from './useAISessionManager';

const encoder = new TextEncoder();
const SYSTEM_MESSAGE = { role: 'system' as const, content: 'System' };

function buildSuccessResponse(chunks: string[]): Response {
    return new Response(
        new ReadableStream({
            start(controller) {
                chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
                controller.close();
            },
        }),
        { status: 200 },
    );
}

function buildAbortableResponse(signal: AbortSignal): Response {
    return {
        ok: true,
        body: {
            getReader: () => ({
                read: () =>
                    new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) => {
                        signal.addEventListener(
                            'abort',
                            () => {
                                reject(new DOMException('Aborted', 'AbortError'));
                            },
                            { once: true },
                        );
                    }),
            }),
        },
        } as unknown as Response;
}

describe('useAISessionManager', () => {
    beforeEach(() => {
        mockAiSessionApi.list.mockReset();
        mockAiSessionApi.get.mockReset();
        mockAiSessionApi.create.mockReset();
        mockAiSessionApi.update.mockReset();
        mockAiSessionApi.remove.mockReset();
        mockCreateChatStream.mockReset();
        mockPrepareAttachmentPayload.mockReset();

        mockPrepareAttachmentPayload.mockResolvedValue({
            images: [],
            attachmentNotes: [],
            filesMeta: [],
        });
        mockAiSessionApi.create.mockResolvedValue({ id: 'created-session', title: 'New Conversation', messages: [SYSTEM_MESSAGE] });
        mockAiSessionApi.update.mockResolvedValue(undefined);
        mockAiSessionApi.remove.mockResolvedValue(undefined);
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        });
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        networkBus.reportOnline();
    });

    afterEach(() => {
        networkBus.reportOnline();
        vi.unstubAllGlobals();
    });

    function renderManager() {
        return renderHook(() =>
            useAISessionManager({
                selectedProvider: 'coze',
                tutorMode: 'hint_only',
                webSearchRef: { current: false },
                searchEngineRef: { current: 'auto' },
                enableThinkingRef: { current: false },
            }),
        );
    }

    it('lazy loads a switched session without overwriting replayed local history', async () => {
        let resolveGet: ((value: unknown) => void) | null = null;

        mockAiSessionApi.list.mockResolvedValue({
            sessions: [
                { id: 'session-1', title: 'First', previewMessages: [SYSTEM_MESSAGE], messageCount: 1, hasMoreMessages: false },
                {
                    id: 'session-2',
                    title: 'Preview',
                    previewMessages: [
                        SYSTEM_MESSAGE,
                        { role: 'user', content: 'Original question' },
                        { role: 'assistant', content: 'Original answer' },
                    ],
                    messageCount: 20,
                    historyStart: 10,
                    hasMoreMessages: true,
                },
            ],
        });
        mockAiSessionApi.get.mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveGet = resolve;
                }),
        );
        mockCreateChatStream.mockResolvedValue(
            buildSuccessResponse([
                'data: {"choices":[{"delta":{"content":"Updated answer"}}]}\n',
                'data: [DONE]\n',
            ]),
        );

        const { result } = renderManager();

        await waitFor(() => {
            expect(result.current.currentSessionId).toBe('session-1');
        });

        act(() => {
            result.current.setCurrentSessionId('session-2');
        });

        await waitFor(() => {
            expect(mockAiSessionApi.get).toHaveBeenCalledWith('session-2', 80);
        });

        await act(async () => {
            await result.current.editUserMsg(1, 'Edited question');
        });

        await waitFor(() => {
            const session = result.current.sessions?.find((item) => item.id === 'session-2');
            expect(session?.messages.at(-2)).toEqual({ role: 'user', content: 'Edited question' });
            expect(session?.messages.at(-1)?.content).toBe('Updated answer');
        });

        resolveGet!({
            title: 'Server copy',
            messages: [
                SYSTEM_MESSAGE,
                { role: 'user', content: 'Original question' },
                { role: 'assistant', content: 'Original answer' },
            ],
            historyStart: 8,
            messageCount: 18,
            hasMoreMessages: true,
        });

        await waitFor(() => {
            const session = result.current.sessions?.find((item) => item.id === 'session-2');
            expect(session?.messages.at(-2)).toEqual({ role: 'user', content: 'Edited question' });
            expect(session?.messages.at(-1)?.content).toBe('Updated answer');
        });
    });

    it('adds an optimistic user + assistant pair, streams the final answer, and persists it', async () => {
        let resolveFirstRead: ((value: ReadableStreamReadResult<Uint8Array>) => void) | null = null;

        mockAiSessionApi.list.mockResolvedValue({
            sessions: [
                { id: 'session-1', title: 'New Conversation', previewMessages: [SYSTEM_MESSAGE], messageCount: 1, hasMoreMessages: false },
            ],
        });
        mockCreateChatStream.mockResolvedValue({
            ok: true,
            body: {
                getReader: () => ({
                    read: vi
                        .fn()
                        .mockImplementationOnce(
                            () =>
                                new Promise<ReadableStreamReadResult<Uint8Array>>((resolve) => {
                                    resolveFirstRead = resolve;
                                }),
                        )
                        .mockResolvedValueOnce({ done: true, value: undefined }),
                }),
            },
        } as unknown as Response);

        const { result } = renderManager();

        await waitFor(() => {
            expect(result.current.sessions?.[0].messages).toHaveLength(1);
        });

        let sendPromise: Promise<void>;
        act(() => {
            sendPromise = result.current.sendMessage('Hello');
        });

        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(result.current.sessions?.[0].messages.at(-2)).toEqual({ role: 'user', content: 'Hello' });
        expect(result.current.sessions?.[0].messages.at(-1)).toEqual({ role: 'assistant', content: '' });

        await act(async () => {
            resolveFirstRead!({
                done: false,
                value: encoder.encode('data: {"choices":[{"delta":{"content":"Hello world"}}]}\n'),
            });
            await sendPromise!;
        });

        await waitFor(() => {
            expect(result.current.sessions?.[0].messages.at(-1)?.content).toBe('Hello world');
        });
        await waitFor(() => {
            expect(mockAiSessionApi.update).toHaveBeenCalledTimes(1);
        });
    });

    it('short-circuits offline sends with the existing assistant error message', async () => {
        mockAiSessionApi.list.mockResolvedValue({
            sessions: [
                { id: 'session-1', title: 'New Conversation', previewMessages: [SYSTEM_MESSAGE], messageCount: 1, hasMoreMessages: false },
            ],
        });

        const { result } = renderManager();

        await waitFor(() => {
            expect(result.current.sessions?.[0].messages).toHaveLength(1);
        });

        networkBus.reportNetworkError();

        await act(async () => {
            await result.current.sendMessage('Hello while offline');
        });

        expect(mockCreateChatStream).not.toHaveBeenCalled();
        expect(result.current.sessions?.[0].messages.at(-1)?.content).toBe(
            'You appear to be offline. Please check your network connection and try again.',
        );
    });

    it('cleans up abort state on stop and allows another send afterwards', async () => {
        mockAiSessionApi.list.mockResolvedValue({
            sessions: [
                { id: 'session-1', title: 'New Conversation', previewMessages: [SYSTEM_MESSAGE], messageCount: 1, hasMoreMessages: false },
            ],
        });

        mockCreateChatStream
            .mockImplementationOnce((_, __, ___, ____, signal: AbortSignal) => Promise.resolve(buildAbortableResponse(signal)))
            .mockResolvedValueOnce(
                buildSuccessResponse([
                    'data: {"choices":[{"delta":{"content":"Recovered"}}]}\n',
                    'data: [DONE]\n',
                ]),
            );

        const { result } = renderManager();

        await waitFor(() => {
            expect(result.current.sessions?.[0].messages).toHaveLength(1);
        });

        let firstSend: Promise<void>;
        act(() => {
            firstSend = result.current.sendMessage('First try');
        });

        await waitFor(() => {
            expect(result.current.isTyping).toBe(true);
        });

        act(() => {
            result.current.stopStream();
        });

        await act(async () => {
            await firstSend!;
        });

        await waitFor(() => {
            expect(result.current.isTyping).toBe(false);
        });
        await waitFor(() => {
            expect(mockAiSessionApi.update).toHaveBeenCalledTimes(1);
        });

        await act(async () => {
            await result.current.sendMessage('Second try');
        });

        await waitFor(() => {
            expect(result.current.sessions?.[0].messages.at(-1)?.content).toBe('Recovered');
        });
    });

    it('reuses the replay executor for edit and regenerate flows', async () => {
        mockAiSessionApi.list.mockResolvedValue({
            sessions: [
                {
                    id: 'session-1',
                    title: 'Replay',
                    previewMessages: [
                        SYSTEM_MESSAGE,
                        { role: 'user', content: 'Original question' },
                        { role: 'assistant', content: 'Original answer' },
                    ],
                    messageCount: 3,
                    hasMoreMessages: false,
                },
            ],
        });

        mockCreateChatStream
            .mockResolvedValueOnce(
                buildSuccessResponse([
                    'data: {"choices":[{"delta":{"content":"Edited answer"}}]}\n',
                    'data: [DONE]\n',
                ]),
            )
            .mockResolvedValueOnce(
                buildSuccessResponse([
                    'data: {"choices":[{"delta":{"content":"Regenerated answer"}}]}\n',
                    'data: [DONE]\n',
                ]),
            );

        const { result } = renderManager();

        await waitFor(() => {
            expect(result.current.sessions?.[0].messages).toHaveLength(3);
        });

        await act(async () => {
            await result.current.editUserMsg(1, 'Edited question');
        });

        await waitFor(() => {
            expect(result.current.sessions?.[0].messages.at(-2)).toEqual({ role: 'user', content: 'Edited question' });
            expect(result.current.sessions?.[0].messages.at(-1)?.content).toBe('Edited answer');
        });

        await act(async () => {
            await result.current.regenerate(2);
        });

        await waitFor(() => {
            expect(result.current.sessions?.[0].messages.at(-1)?.content).toBe('Regenerated answer');
        });
        expect(mockCreateChatStream).toHaveBeenCalledTimes(2);
    });
});
