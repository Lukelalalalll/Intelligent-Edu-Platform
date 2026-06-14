import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRafBufferedUpdater } from './streamHelpers';
import type { ToolProgress } from './streamHelpers';

describe('createRafBufferedUpdater', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('records running tool progress without injecting it into message content', () => {
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        });
        vi.stubGlobal('cancelAnimationFrame', vi.fn());

        const snapshots: string[] = [];
        const toolProgresses: ToolProgress[] = [];
        const updater = createRafBufferedUpdater(
            (snapshot) => snapshots.push(snapshot),
            { current: null },
            undefined,
            (progress) => toolProgresses.push(progress),
        );

        updater.consumeSseObject({
            tool_progress: {
                name: 'RAG',
                status: 'running',
                message: 'Retrieving course context...',
            },
        });
        updater.consumeSseObject({ choices: [{ delta: { content: 'Hello there.' } }] });
        const final = updater.finalize();

        expect(toolProgresses).toEqual([
            {
                name: 'RAG',
                status: 'running',
                message: 'Retrieving course context...',
            },
        ]);
        expect(final.snapshot).toBe('Hello there.');
        expect(final.snapshot).not.toContain('正在调用工具');
        expect(final.snapshot).not.toContain('RAG');
        expect(snapshots.at(-1)).toBe('Hello there.');
    });

    it('still injects tool errors into message content', () => {
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        });
        vi.stubGlobal('cancelAnimationFrame', vi.fn());

        const updater = createRafBufferedUpdater(
            () => {},
            { current: null },
        );

        updater.consumeSseObject({
            tool_progress: {
                name: 'RAG',
                status: 'error',
                message: 'retrieval failed',
            },
        });
        const final = updater.finalize();

        expect(final.snapshot).toContain('[工具错误] RAG');
        expect(final.snapshot).toContain('retrieval failed');
    });
});
