import { useState, useRef, useCallback, useEffect } from 'react';
import { usePretextMeasure } from '@/shared/hooks/usePretextMeasure';
import type { ChatMsg, StreamMessage } from './types';
import { WELCOME_MESSAGE } from './types';
import { replaceMessageText, toApiMessages } from './messageUtils';
import { streamChatCompletion } from './chatStream';

function getApiRoot(): string {
    return import.meta.env.VITE_API_ROOT || 'http://localhost:5009';
}

export function useAIChatBox(messagesContainerRef: React.RefObject<HTMLDivElement>) {
    const [messages, setMessages] = useState<ChatMsg[]>([WELCOME_MESSAGE]);
    const [input, setInput] = useState('');
    const [provider, setProvider] = useState<'coze' | 'local_ollama' | 'deepseek'>('local_ollama');
    const [isLoading, setIsLoading] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingVal, setEditingVal] = useState('');

    const inputAreaRef = useRef<HTMLTextAreaElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const streamRafRef = useRef<number | null>(null);

    const { scrollToBottom } = usePretextMeasure(messagesContainerRef, {
        font: '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        lineHeight: 25.6,
        debounceMs: 60,
    });

    useEffect(() => {
        scrollToBottom(!isLoading);
    }, [messages, isLoading, scrollToBottom]);

    const flushRafUpdate = useCallback((targetId: string, text: string, uiElements?: any[]) => {
        streamRafRef.current = null;
        setMessages((prev) => prev.map((m) => {
            if (m.id !== targetId) return m;
            return { ...m, text, uiElements: uiElements ? [...(m.uiElements || []), ...uiElements] : m.uiElements };
        }));
    }, []);

    const scheduleRafUpdate = useCallback((targetId: string, text: string, uiElements?: any[]) => {
        if (streamRafRef.current != null) return;
        streamRafRef.current = requestAnimationFrame(() => flushRafUpdate(targetId, text, uiElements));
    }, [flushRafUpdate]);

    const cancelStreaming = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        if (streamRafRef.current != null) {
            cancelAnimationFrame(streamRafRef.current);
            streamRafRef.current = null;
        }
        setIsLoading(false);
    }, []);

    const copyToClipboard = useCallback(async (text: string, buttonEl: HTMLElement | null = null) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
            console.error('Clipboard write failed', err);
            return;
        }
        if (buttonEl instanceof HTMLElement) {
            const original = buttonEl.innerHTML;
            buttonEl.innerHTML = '<i class="fas fa-check" style="color:#27c93f;"></i> Copied!';
            setTimeout(() => {
                buttonEl.innerHTML = original;
            }, 1800);
        }
    }, []);

    const handleChatAreaClick = useCallback((e: MouseEvent) => {
        const copyBtn = (e.target as Element).closest('.js-code-copy-btn');
        if (!copyBtn) return;
        const encoded = (copyBtn as HTMLElement).dataset.code || '';
        copyToClipboard(decodeURIComponent(encoded), copyBtn as HTMLElement);
    }, [copyToClipboard]);

    useEffect(() => {
        const el = messagesContainerRef.current;
        if (!el) return;
        el.addEventListener('click', handleChatAreaClick as EventListener);
        return () => el.removeEventListener('click', handleChatAreaClick as EventListener);
    }, [handleChatAreaClick, messagesContainerRef]);

    const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const target = e.target;
        setInput(target.value);
        target.style.height = 'auto';
        target.style.height = `${target.scrollHeight}px`;
        if (target.value === '') target.style.height = 'auto';
    }, []);

    const streamAssistantReply = useCallback(async (historyForApi: StreamMessage[], targetAssistantId: string, parseErrorLabel: string) => {
        let fullText = '';
        let uiElementsAccumulator: any[] = [];

        await streamChatCompletion({
            apiRoot: getApiRoot(),
            messages: historyForApi,
            provider,
            signal: abortControllerRef.current?.signal as AbortSignal,
            onTextDelta: (delta) => {
                fullText += delta;
                scheduleRafUpdate(targetAssistantId, fullText, uiElementsAccumulator);
            },
            onUiElement: (elem) => {
                uiElementsAccumulator.push(elem);
                scheduleRafUpdate(targetAssistantId, fullText, uiElementsAccumulator);
            },
            onErrorText: (errorText) => {
                fullText += `\n\n**[Error]**: ${errorText}`;
                scheduleRafUpdate(targetAssistantId, fullText, uiElementsAccumulator);
            },
            parseErrorLogLabel: parseErrorLabel,
        });

        if (streamRafRef.current != null) {
            cancelAnimationFrame(streamRafRef.current);
            streamRafRef.current = null;
        }
        flushRafUpdate(targetAssistantId, fullText, uiElementsAccumulator);
    }, [flushRafUpdate, scheduleRafUpdate, provider]);

    const streamFromHistory = useCallback(async (history: ChatMsg[]) => {
        if (!history.length) return;

        cancelStreaming();
        abortControllerRef.current = new AbortController();

        const targetAssistantId = crypto.randomUUID();
        setMessages(() => [...history, { id: targetAssistantId, sender: 'ai', role: 'assistant', text: '', modelProvider: provider }]);
        setIsLoading(true);

        try {
            await streamAssistantReply(toApiMessages(history), targetAssistantId, 'Skipping partial history chunk');
        } catch (error) {
            if ((error as Error).name === 'AbortError') return;
            setMessages((prev) => replaceMessageText(prev, targetAssistantId, `Network Error: ${(error as Error).message}`));
        } finally {
            setIsLoading(false);
            abortControllerRef.current = null;
        }
    }, [cancelStreaming, streamAssistantReply]);

    const handleSend = useCallback(async () => {
        if (!input.trim() || isLoading) return;

        cancelStreaming();
        abortControllerRef.current = new AbortController();

        const userText = input.trim();
        setInput('');
        if (inputAreaRef.current) inputAreaRef.current.style.height = 'auto';

        const userMsg: ChatMsg = { id: crypto.randomUUID(), sender: 'user', role: 'user', text: userText };
        const aiPlaceholderId = crypto.randomUUID();
        const aiMsg: ChatMsg = { id: aiPlaceholderId, sender: 'ai', role: 'assistant', text: '', modelProvider: provider };

        setMessages((prev) => [...prev, userMsg, aiMsg]);
        setIsLoading(true);

        try {
            const historyForAPI = toApiMessages(messages.filter((m) => m.id !== 'welcome').concat(userMsg));
            await streamAssistantReply(historyForAPI, aiPlaceholderId, 'Skipping partial stream chunk');
        } catch (error) {
            if ((error as Error).name === 'AbortError') return;
            setMessages((prev) => replaceMessageText(prev, aiPlaceholderId, 'Sorry, I encountered an error connecting to the AI server.'));
        } finally {
            setIsLoading(false);
            abortControllerRef.current = null;
        }
    }, [cancelStreaming, input, isLoading, messages, streamAssistantReply]);

    const handleRegenerate = useCallback((idx: number) => {
        if (isLoading) return;
        const msg = messages[idx];
        if (msg?.sender !== 'ai') return;
        streamFromHistory(messages.slice(0, idx));
    }, [isLoading, messages, streamFromHistory]);

    const handleEditUserMsg = useCallback((idx: number, newVal: string) => {
        if (isLoading) return;
        const msg = messages[idx];
        if (msg?.sender !== 'user') return;
        const trimmed = newVal.trim();
        if (!trimmed) return;

        const updatedUser = { ...msg, text: trimmed };
        streamFromHistory([...messages.slice(0, idx), updatedUser]);
        setEditingId(null);
        setEditingVal('');
    }, [isLoading, messages, streamFromHistory]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }, [handleSend]);

    return {
        messages,
        input,
        provider,
        isLoading,
        editingId,
        editingVal,
        inputAreaRef,
        setProvider,
        setInput,
        setEditingId,
        setEditingVal,
        handleInput,
        handleSend,
        handleRegenerate,
        handleStop: cancelStreaming,
        handleEditUserMsg,
        handleKeyDown,
    };
}
