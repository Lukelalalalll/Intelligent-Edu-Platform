import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import client from '@/shared/api/client';
import styles from '../styles/StudyRoom.module.css';
import { getStoredAIProvider, setStoredAIProvider, type AIProvider } from '../../../shared/aiProvider';

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}

interface StudyCoachProps {
    pendingHighlight?: string | { text?: string; mode?: string };
    onDismissHighlight?: () => void;
    onSaveNote?: (content: string) => void;
    pdfText?: string;
    storageKey?: string;
}

const MAX_HISTORY_STORED = 50;

export default function StudyCoach({ pendingHighlight, onDismissHighlight, onSaveNote, pdfText, storageKey }: StudyCoachProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [streaming, setStreaming] = useState(false);
    const [savedMsgIds, setSavedMsgIds] = useState(new Set());
    const [provider, setProvider] = useState<AIProvider>(() => getStoredAIProvider());
    const [citationsMap, setCitationsMap] = useState<Record<string, any[]>>({});
    const [expandedCitations, setExpandedCitations] = useState<Record<string, boolean>>({});
    const messagesRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    // Derive localStorage key from storageKey (doc identity)
    const historyStorageKey = storageKey ? `coach_history_${storageKey}` : null;

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        const el = messagesRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }, [messages]);

    // Abort streaming on unmount
    useEffect(() => {
        return () => { abortRef.current?.abort(); };
    }, []);

    useEffect(() => {
        setStoredAIProvider(provider);
    }, [provider]);

    // ── History persistence ────────────────────────────────────────────────────

    // Restore history when storageKey changes (new document opened)
    useEffect(() => {
        if (!historyStorageKey) {
            setMessages([]);
            return;
        }
        try {
            const raw = localStorage.getItem(historyStorageKey);
            if (raw) {
                const stored = JSON.parse(raw);
                if (Array.isArray(stored)) {
                    setMessages(stored.slice(-MAX_HISTORY_STORED));
                    return;
                }
            }
        } catch { /* ignore corrupt data */ }
        setMessages([]);
    }, [historyStorageKey]);

    // Save history to localStorage whenever messages change (skip empty)
    useEffect(() => {
        if (!historyStorageKey || messages.length === 0) return;
        try {
            const toStore = messages.slice(-MAX_HISTORY_STORED);
            localStorage.setItem(historyStorageKey, JSON.stringify(toStore));
        } catch { /* ignore quota errors */ }
    }, [messages, historyStorageKey]);

    // ── Helpers ────────────────────────────────────────────────────────────────

    const updateMessage = useCallback((msgId: string, content: string) => {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content } : m));
    }, []);

    // ── SSE streaming ask ──────────────────────────────────────────────────────

    const askStudyStream = useCallback(async (content: string, mode: string, history: any[]) => {
        setStreaming(true);
        const msgId = 'msg-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        setMessages(prev => [...prev, { role: 'assistant' as const, content: '', id: msgId }]);

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        const payload: Record<string, unknown> = {
            content,
            mode,
            messages: history,
            provider,
        };
        if (pdfText) {
            payload.context = pdfText.slice(0, 8000);
        }

        try {
            // Use the base URL from the axios client (removes /api prefix for fetch)
            const baseURL = (client.defaults.baseURL || '').replace(/\/$/, '');
            const res = await fetch(`${baseURL}/ai/study-stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal,
                credentials: 'include',
            });

            if (!res.ok) {
                const errText = await res.text().catch(() => res.statusText);
                throw new Error(errText);
            }

            const reader = res.body?.getReader();
            if (!reader) throw new Error('No response body');

            const decoder = new TextDecoder();
            let buffer = '';
            let accumulated = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n\n');
                buffer = lines.pop() ?? '';
                for (const block of lines) {
                    for (const line of block.split('\n')) {
                        if (!line.startsWith('data: ')) continue;
                        const raw = line.slice(6).trim();
                        if (raw === '[DONE]') break;
                        try {
                            const evt = JSON.parse(raw);
                            if (evt.type === 'citations' && Array.isArray(evt.data) && evt.data.length > 0) {
                                setCitationsMap(prev => ({ ...prev, [msgId]: evt.data }));
                            } else if (evt.type === 'text' && typeof evt.data === 'string') {
                                accumulated += evt.data;
                                updateMessage(msgId, accumulated);
                            } else if (evt.type === 'done') {
                                break;
                            } else if (evt.type === 'error') {
                                accumulated += `\n\n_Error: ${evt.data}_`;
                                updateMessage(msgId, accumulated);
                            }
                        } catch { /* skip malformed SSE lines */ }
                    }
                }
            }
        } catch (err: any) {
            if (err?.name === 'AbortError') return;
            updateMessage(msgId, '_Error: ' + (err?.message || 'Unknown error') + '_');
        } finally {
            setStreaming(false);
        }
    }, [pdfText, provider, updateMessage]);

    const handleAction = useCallback((mode: string) => {
        const hlText = typeof pendingHighlight === 'object' ? pendingHighlight?.text : pendingHighlight;
        if (!hlText || streaming) return;
        const modeLabel = mode.charAt(0).toUpperCase() + mode.slice(1);
        const userMsg: ChatMessage = {
            role: 'user',
            content: `[${modeLabel}] ${hlText}`,
            id: 'msg-' + Date.now(),
        };
        setMessages(prev => [...prev, userMsg]);
        onDismissHighlight?.();

        const history = [...messages.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: userMsg.content }];
        askStudyStream(hlText, mode, history);
    }, [pendingHighlight, streaming, messages, onDismissHighlight, askStudyStream]);

    // Auto-trigger when popover sends mode directly (pendingHighlight is { text, mode })
    const prevHighlightRef = useRef<string | null>(null);
    useEffect(() => {
        if (!pendingHighlight || typeof pendingHighlight !== 'object') return;
        if (!pendingHighlight.text || !pendingHighlight.mode) return;
        const key = pendingHighlight.text + pendingHighlight.mode;
        if (prevHighlightRef.current === key) return;
        prevHighlightRef.current = key;
        handleAction(pendingHighlight.mode);
    }, [pendingHighlight, handleAction]);

    const handleSend = useCallback(() => {
        const trimmed = input.trim();
        if (!trimmed || streaming) return;
        const userMsg: ChatMessage = { role: 'user', content: trimmed, id: 'msg-' + Date.now() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');

        const history = [...messages.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: trimmed }];
        askStudyStream(trimmed, 'chat', history);
    }, [input, streaming, messages, askStudyStream]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleSaveAsNote = (msg: ChatMessage) => {
        if (!onSaveNote || savedMsgIds.has(msg.id)) return;
        onSaveNote(msg.content);
        setSavedMsgIds(prev => new Set(prev).add(msg.id));
    };

    return (
        <div className={styles.coachCard}>
            {/* Header */}
            <div className={styles.coachHeader}>
                <div className={styles.coachAvatar}>
                    <i className="fas fa-graduation-cap"></i>
                </div>
                <div>
                    <div className={styles.coachTitle}>AI Study Coach</div>
                    <div className={styles.coachSubtitle}>Highlight text to get explanations & hints</div>
                    <div style={{ marginTop: 8 }}>
                        <select
                            value={provider}
                            onChange={(e) => setProvider(e.target.value as AIProvider)}
                            disabled={streaming}
                        >
                            <option value="coze">Coze</option>
                            <option value="local_ollama">llama3.2</option>
                        <option value="deepseek">DeepSeek</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Messages */}
            <div className={styles.coachMessages} ref={messagesRef}>
                {messages.length === 0 && !pendingHighlight ? (
                    <div className={styles.emptyCoach}>
                        <i className="fas fa-book-reader"></i>
                        <p>Upload a document and highlight any text to get started. I'll help you understand concepts and give hints for problems.</p>
                    </div>
                ) : (
                    messages.map((msg) => (
                        <div key={msg.id}>
                            <div className={`${styles.msgBubble} ${msg.role === 'user' ? styles.msgUser : styles.msgAssistant}`}>
                                {msg.role === 'assistant'
                                    ? <ReactMarkdown>{msg.content}</ReactMarkdown>
                                    : msg.content}
                                {streaming && msg === messages.at(-1) && msg.role === 'assistant' && (
                                    <span className={styles.streamingDot}></span>
                                )}
                            </div>
                            {msg.role === 'assistant' && msg.content && !streaming && (
                                <>
                                    {citationsMap[msg.id] && citationsMap[msg.id].length > 0 && (
                                        <div className={styles.citationsWrap}>
                                            <button
                                                className={styles.citationsToggle}
                                                onClick={() => setExpandedCitations(prev => ({ ...prev, [msg.id]: !prev[msg.id] }))}
                                            >
                                                <i className="fas fa-book-open" /> {citationsMap[msg.id].length} source{citationsMap[msg.id].length > 1 ? 's' : ''}
                                                <i className={`fas fa-chevron-${expandedCitations[msg.id] ? 'up' : 'down'}`} style={{ marginLeft: 4, fontSize: '0.7rem' }} />
                                            </button>
                                            {expandedCitations[msg.id] && (
                                                <div className={styles.citationsList}>
                                                    {citationsMap[msg.id].map((c: any, i: number) => (
                                                        <div key={i} className={styles.citationCard}>
                                                            <div className={styles.citationDoc}>
                                                                <i className="fas fa-file-alt" /> {c.doc_name || 'Unknown'}
                                                                <span className={styles.citationScore}>{(c.score * 100).toFixed(0)}%</span>
                                                            </div>
                                                            <div className={styles.citationText}>{(c.text || '').slice(0, 150)}{(c.text || '').length > 150 ? '...' : ''}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {savedMsgIds.has(msg.id) ? (
                                        <div className={styles.savedTag}><i className="fas fa-check"></i> Saved to notes</div>
                                    ) : (
                                        <button className={styles.saveNoteBtn} onClick={() => handleSaveAsNote(msg)}>
                                            <i className="fas fa-sticky-note"></i> Save as Note
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Input Bar */}
            <div className={styles.coachInputBar}>
                <input
                    className={styles.coachInput}
                    placeholder="Ask a question about the material..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={streaming}
                />
                <button
                    className={styles.coachSendBtn}
                    onClick={handleSend}
                    disabled={streaming || !input.trim()}
                >
                    <i className="fas fa-paper-plane"></i>
                </button>
            </div>
        </div>
    );
}

