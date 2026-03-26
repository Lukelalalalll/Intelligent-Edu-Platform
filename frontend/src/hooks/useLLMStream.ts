import { useCallback, useEffect, useRef, useState } from 'react';

import type { StartStreamOptions, StreamDeltaFrame } from '../types/llm';

const viteEnv = (import.meta as unknown as { env?: Record<string, string> }).env || {};
const apiRoot = (viteEnv.VITE_API_ROOT || 'http://localhost:5009').replace(/\/$/, '');

interface StreamState {
    loading: boolean;
    error: string;
    lastLatencyMs: number | null;
    lastFailedQuestion: string;
}

export function useLLMStream() {
    const [state, setState] = useState<StreamState>({
        loading: false,
        error: '',
        lastLatencyMs: null,
        lastFailedQuestion: '',
    });

    const abortControllerRef = useRef<AbortController | null>(null);
    const textBufferRef = useRef('');
    const rafIdRef = useRef<number | null>(null);
    const onDeltaRef = useRef<((fullText: string) => void) | undefined>(undefined);

    const flushFrame = useCallback(() => {
        rafIdRef.current = null;
        onDeltaRef.current?.(textBufferRef.current);
    }, []);

    const scheduleFlush = useCallback(() => {
        if (rafIdRef.current != null) return;
        rafIdRef.current = requestAnimationFrame(flushFrame);
    }, [flushFrame]);

    const stopStream = useCallback(() => {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        if (rafIdRef.current != null) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
        }
        setState((prev) => ({ ...prev, loading: false }));
    }, []);

    useEffect(() => {
        return () => {
            stopStream();
        };
    }, [stopStream]);

    const clearError = useCallback(() => {
        setState((prev) => ({ ...prev, error: '' }));
    }, []);

    const startStream = useCallback(async ({ payload, question, onDelta, onDone }: StartStreamOptions) => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        const controller = new AbortController();
        abortControllerRef.current = controller;
        textBufferRef.current = '';
        onDeltaRef.current = onDelta;

        setState((prev) => ({
            ...prev,
            loading: true,
            error: '',
            lastFailedQuestion: '',
        }));

        const startedAt = performance.now();

        try {
            const response = await fetch(`${apiRoot}/api/ai/feedback/stream`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    ...payload,
                    useRag: payload.useRag ?? true,
                    ragTopK: payload.ragTopK ?? 4,
                }),
            });

            if (!response.ok || !response.body) {
                throw new Error(`stream failed: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data: ')) continue;

                    const dataStr = trimmed.slice(6);
                    if (dataStr === '[DONE]') continue;

                    try {
                        const frame = JSON.parse(dataStr) as StreamDeltaFrame;
                        if (frame.error) {
                            textBufferRef.current += `\n\n[Error]: ${frame.error}`;
                            scheduleFlush();
                            continue;
                        }

                        const delta = frame.choices?.[0]?.delta?.content;
                        if (delta) {
                            textBufferRef.current += delta;
                            scheduleFlush();
                        }
                    } catch {
                        // Ignore keepalive or non-JSON frames.
                    }
                }
            }

            if (rafIdRef.current != null) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
            }
            onDeltaRef.current?.(textBufferRef.current);
            onDone?.(textBufferRef.current);

            setState((prev) => ({
                ...prev,
                loading: false,
                lastLatencyMs: Math.round(performance.now() - startedAt),
                lastFailedQuestion: '',
            }));
        } catch (err) {
            if ((err as Error)?.name === 'AbortError') {
                setState((prev) => ({
                    ...prev,
                    loading: false,
                    error: 'Request stopped.',
                }));
                return;
            }

            const message = err instanceof Error ? err.message : 'unknown error';
            const hint = /timeout|timed out/i.test(message)
                ? ' Timeout occurred. You can retry now.'
                : ' Network or upstream issue. You can retry now.';

            setState((prev) => ({
                ...prev,
                loading: false,
                lastLatencyMs: Math.round(performance.now() - startedAt),
                lastFailedQuestion: question,
                error: `AI request failed: ${message}.${hint}`,
            }));
        } finally {
            abortControllerRef.current = null;
            onDeltaRef.current = undefined;
        }
    }, [scheduleFlush]);

    return {
        loading: state.loading,
        error: state.error,
        lastLatencyMs: state.lastLatencyMs,
        lastFailedQuestion: state.lastFailedQuestion,
        startStream,
        stopStream,
        clearError,
    };
}
