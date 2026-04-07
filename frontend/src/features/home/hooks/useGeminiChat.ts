import { useState, useRef, useCallback, useEffect } from 'react';
import { usePretextMeasure } from '../../../hooks/usePretextMeasure';

export interface ChatMsg {
    id: string;
    sender: 'user' | 'ai';
    role: 'user' | 'assistant';
    text: string;
}

function replaceMessageText(list: ChatMsg[], id: string, text: string): ChatMsg[] {
    return list.map(m => (m.id === id ? { ...m, text } : m));
}

export function useGeminiChat(messagesContainerRef: React.RefObject<HTMLDivElement>) {
    const [messages, setMessages] = useState<ChatMsg[]>([
        { id: 'welcome', sender: 'ai', role: 'assistant', text: "Hi there! I'm your HKU AI Assistant. How can I help you with your studies today?" },
    ]);
    const [input, setInput] = useState('');
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
            setTimeout(() => { buttonEl.innerHTML = original; }, 1800);
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
        target.style.height = target.scrollHeight + 'px';
        if (target.value === '') target.style.height = 'auto';
    }, []);

    const streamFromHistory = useCallback(async (history: ChatMsg[]) => { // NOSONAR
        if (!history.length) return;
        if (abortControllerRef.current) abortControllerRef.current.abort();
        abortControllerRef.current = new AbortController();

        const targetAssistantId = crypto.randomUUID();
        setMessages(() => [...history, { id: targetAssistantId, sender: 'ai', role: 'assistant', text: '' }]);
        setIsLoading(true);

        try {
            const apiMessages = history.map(m => ({ role: m.role, content: m.text }));
            const apiRoot = import.meta.env.VITE_API_ROOT || 'http://localhost:5009';
            const response = await fetch(`${apiRoot}/api/ai/chat`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: apiMessages }),
                signal: abortControllerRef.current.signal,
            });

            if (!response.ok) throw new Error(`API Error: ${response.status}`);

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let fullText = '';
            let buffer = '';

            const flushToState = () => {
                streamRafRef.current = null;
                const snapshot = fullText;
                setMessages(prev => replaceMessageText(prev, targetAssistantId, snapshot));
            };
            const scheduleFlush = () => {
                if (streamRafRef.current != null) return;
                streamRafRef.current = requestAnimationFrame(flushToState);
            };

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed?.startsWith('data: ')) continue;
                    const dataStr = trimmed.replace('data: ', '');
                    if (dataStr === '[DONE]') continue;
                    try {
                        const obj = JSON.parse(dataStr);
                        if (obj.choices?.[0]?.delta?.content !== undefined) {
                            fullText += obj.choices[0].delta.content;
                            scheduleFlush();
                        }
                    } catch (err) {
                        if (import.meta.env.DEV) console.debug('Skipping partial history chunk', err);
                    }
                }
            }

            if (streamRafRef.current != null) { cancelAnimationFrame(streamRafRef.current); streamRafRef.current = null; }
            flushToState();
        } catch (error) {
            if ((error as Error).name === 'AbortError') return;
            setMessages(prev => prev.map(m => m.id === targetAssistantId ? { ...m, text: `Network Error: ${(error as Error).message}` } : m));
        } finally {
            setIsLoading(false);
            abortControllerRef.current = null;
        }
    }, []);

    const handleSend = useCallback(async () => { // NOSONAR
        if (!input.trim() || isLoading) return;
        if (abortControllerRef.current) abortControllerRef.current.abort();
        abortControllerRef.current = new AbortController();

        const userText = input.trim();
        setInput('');
        if (inputAreaRef.current) inputAreaRef.current.style.height = 'auto';

        const userMsg: ChatMsg = { id: crypto.randomUUID(), sender: 'user', role: 'user', text: userText };
        const aiPlaceholderId = crypto.randomUUID();
        const aiMsg: ChatMsg = { id: aiPlaceholderId, sender: 'ai', role: 'assistant', text: '' };

        setMessages(prev => [...prev, userMsg, aiMsg]);
        setIsLoading(true);

        try {
            const historyForAPI = messages
                .filter(m => m.id !== 'welcome')
                .concat(userMsg)
                .map(m => ({ role: m.role, content: m.text }));

            const apiRoot = import.meta.env.VITE_API_ROOT || 'http://localhost:5009';
            const response = await fetch(`${apiRoot}/api/ai/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: historyForAPI }),
                credentials: 'include',
                signal: abortControllerRef.current.signal,
            });

            if (!response.ok) throw new Error('Network response was not ok');

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let accumulatedText = '';
            let buffer = '';

            const flushToState = () => {
                streamRafRef.current = null;
                const snapshot = accumulatedText;
                setMessages(prev => replaceMessageText(prev, aiPlaceholderId, snapshot));
            };
            const scheduleFlush = () => {
                if (streamRafRef.current != null) return;
                streamRafRef.current = requestAnimationFrame(flushToState);
            };

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed?.startsWith('data: ')) continue;
                    const dataStr = trimmed.replace('data: ', '');
                    if (dataStr === '[DONE]') continue;
                    try {
                        const dataObj = JSON.parse(dataStr);
                        if (dataObj.error) accumulatedText += `\n\n**[Error]**: ${dataObj.error}`;
                        else if (dataObj.choices?.[0]?.delta?.content !== undefined) {
                            accumulatedText += dataObj.choices[0].delta.content;
                        }
                        scheduleFlush();
                    } catch (e) {
                        if (import.meta.env.DEV) console.debug('Skipping partial stream chunk', e);
                    }
                }
            }

            if (streamRafRef.current != null) { cancelAnimationFrame(streamRafRef.current); streamRafRef.current = null; }
            flushToState();
        } catch (error) {
            if ((error as Error).name === 'AbortError') return;
            setMessages(prev => replaceMessageText(prev, aiPlaceholderId, 'Sorry, I encountered an error connecting to the AI server.'));
        } finally {
            setIsLoading(false);
            abortControllerRef.current = null;
        }
    }, [input, isLoading, messages]);

    const handleStop = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        if (streamRafRef.current != null) { cancelAnimationFrame(streamRafRef.current); streamRafRef.current = null; }
        setIsLoading(false);
    }, []);

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
        messages, input, isLoading, editingId, editingVal,
        inputAreaRef,
        setEditingId, setEditingVal,
        handleInput, handleSend, handleStop,
        handleRegenerate, handleEditUserMsg, handleKeyDown,
    };
}
