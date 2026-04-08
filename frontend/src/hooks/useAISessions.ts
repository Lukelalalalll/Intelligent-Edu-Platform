import { useState, useEffect, useRef, useCallback } from 'react';
import { aiSessionApi, aiMemoryApi, createChatStream } from '../api/aiApi';
import { networkBus } from './useNetworkStatus';
import type { AISession, ChatMessage, RagCitation } from '../types/api';

interface ModalConfig {
    show: boolean;
    sessionId: string | null;
}

const SYSTEM_MSG: ChatMessage = { role: 'system', content: 'You are a helpful academic AI assistant for HKU.' };

function buildSession(raw: Partial<AISession>): AISession {
    return {
        id: raw.id!,
        title: raw.title || 'New Conversation',
        messages: raw.messages || [SYSTEM_MSG],
    };
}

export function useAISessions() {
    const [sessions, setSessions] = useState<(AISession & { _needFetch?: boolean })[] | null>(null);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [isTyping, setIsTyping] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [modalConfig, setModalConfig] = useState<ModalConfig>({ show: false, sessionId: null });

    const abortRef = useRef<AbortController | null>(null);
    const rafRef = useRef<number | null>(null);
    const sessionsRef = useRef(sessions);
    sessionsRef.current = sessions;

    const applyFetchedSession = useCallback((id: string, data: Partial<AISession>) => {
        setSessions(prev => {
            const list = prev || [];
            return list.map(s => (s.id === id
                ? { ...s, title: data.title || s.title, messages: data.messages || s.messages, _needFetch: false }
                : s));
        });
    }, []);

    const markSessionFetchDone = useCallback((id: string) => {
        setSessions(prev => {
            const list = prev || [];
            return list.map(s => (s.id === id ? { ...s, _needFetch: false } : s));
        });
    }, []);

    const applyAssistantSnapshot = useCallback((targetId: string, snapshot: string, citations?: RagCitation[]) => {
        setSessions(prev => prev.map(s => {
            if (s.id !== targetId) return s;
            const msgs = [...s.messages];
            const lastMsg = msgs.at(-1);
            msgs[msgs.length - 1] = { ...lastMsg, content: snapshot, ...(citations ? { citations } : {}) };
            return { ...s, messages: msgs };
        }));
    }, []);

    // ── Load sessions on mount ──
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const data = await aiSessionApi.list();
                if (cancelled) return;
                const list = (data.sessions || []).map(s => ({
                    ...buildSession(s),
                    _needFetch: true,
                }));
                if (list.length === 0) {
                    const ns = await aiSessionApi.create();
                    if (cancelled) return;
                    setSessions([buildSession(ns)]);
                    setCurrentSessionId(ns.id);
                } else {
                    setSessions(list);
                    setCurrentSessionId(list[0].id);
                }
            } catch {
                if (cancelled) return;
                const fallback = { id: 'local_' + Date.now(), ...buildSession({}) };
                setSessions([fallback]);
                setCurrentSessionId(fallback.id);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // ── Lazy-fetch messages when switching sessions ──
    useEffect(() => {
        if (!currentSessionId || !sessions) return;
        const sess = sessions.find(s => s.id === currentSessionId);
        if (!sess?._needFetch) return;

        let cancelled = false;
        (async () => {
            try {
                const data = await aiSessionApi.get(currentSessionId);
                if (cancelled) return;
                applyFetchedSession(currentSessionId, data);
            } catch {
                markSessionFetchDone(currentSessionId);
            }
        })();
        return () => { cancelled = true; };
    }, [currentSessionId, sessions, applyFetchedSession, markSessionFetchDone]);

    // ── Sync helper ──
    const syncToServer = useCallback(async (id: string, data: AISession) => {
        if (!id || !data) return;
        try { await aiSessionApi.update(id, { title: data.title, messages: data.messages }); }
        catch { /* local state is source of truth */ }
    }, []);

    // ── Create / switch ──
    const createNewSession = useCallback(async (switchImmediately = true, forceId: string | null = null) => {
        if (forceId) { setCurrentSessionId(forceId); return; }
        try {
            const ns = await aiSessionApi.create();
            setSessions(prev => [buildSession(ns), ...(prev || [])]);
            if (switchImmediately) setCurrentSessionId(ns.id);
        } catch {
            const local = { id: 'local_' + Date.now(), ...buildSession({}) };
            setSessions(prev => [local, ...(prev || [])]);
            if (switchImmediately) setCurrentSessionId(local.id);
        }
    }, []);

    // ── Delete ──
    const promptDelete = useCallback((e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setModalConfig({ show: true, sessionId: id });
    }, []);

    const confirmDelete = useCallback(async () => {
        const id = modalConfig.sessionId;
        setModalConfig({ show: false, sessionId: null });
        setDeletingId(id);
        aiSessionApi.remove(id).catch(() => {});

        setTimeout(async () => {
            const remaining = (sessionsRef.current || []).filter(s => s.id !== id);
            setSessions(remaining);
            if (remaining.length === 0) {
                await createNewSession(true);
            } else if (currentSessionId === id) {
                setCurrentSessionId(remaining[0].id);
            }
            setDeletingId(null);
        }, 300);
    }, [modalConfig.sessionId, currentSessionId, createNewSession]);

    // ── SSE streaming with rAF batching ──
    const streamSSE = useCallback(async (apiMessages: ChatMessage[], targetId: string, signal: AbortSignal) => { // NOSONAR
        const response = await createChatStream(apiMessages, signal);

        if (!response.ok) {
            setSessions(prev => prev.map(s => s.id === targetId
                ? { ...s, messages: [...s.messages.slice(0, -1), { role: 'assistant', content: `API Error: ${response.status}` }] }
                : s));
            setIsTyping(false);
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let full = '';
        let buffer = '';
        let citations: RagCitation[] | undefined;

        const flush = () => {
            rafRef.current = null;
            const snapshot = full;
            applyAssistantSnapshot(targetId, snapshot, citations);
        };

        const schedule = () => { if (rafRef.current == null) rafRef.current = requestAnimationFrame(flush); };

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed?.startsWith('data: ')) continue;
                const raw = trimmed.slice(6);
                if (raw === '[DONE]') continue;
                try {
                    const obj = JSON.parse(raw);
                    // Handle metadata (RAG citations)
                    if (obj.meta?.citations) {
                        citations = obj.meta.citations;
                        schedule();
                        continue;
                    }
                    if (obj.error) full += `\n\n**[Error]**: ${obj.error}`;
                    else if (obj.choices?.[0]?.delta?.content !== undefined) full += obj.choices[0].delta.content;
                    schedule();
                } catch { /* skip */ }
            }
        }

        if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        flush();
    }, [applyAssistantSnapshot]);

    // ── Send message ──
    const sendMessage = useCallback(async (text: string) => {
        if (isTyping || !text.trim()) return;
        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();

        let targetId = currentSessionId || (sessions || [])[0]?.id;
        if (!targetId) return;
        if (targetId !== currentSessionId) setCurrentSessionId(targetId);

        const trimmed = text.trim();

        // Refuse to stream while offline — show an inline error message
        if (networkBus.isOffline) {
            setSessions(prev => prev.map(s => s.id !== targetId ? s : {
                ...s,
                messages: [
                    ...s.messages,
                    { role: 'user' as const, content: trimmed },
                    { role: 'assistant' as const, content: 'You appear to be offline. Please check your network connection and try again.' },
                ],
            }));
            return;
        }

        setIsTyping(true);

        setSessions(prev => prev.map(s => {
            if (s.id !== targetId) return s;
            let title = s.title;
            if (s.messages.length <= 1) {
                title = trimmed.length > 20 ? `${trimmed.slice(0, 20)}...` : trimmed;
            }
            return { ...s, title, messages: [...s.messages, { role: 'user', content: trimmed }, { role: 'assistant', content: '' }] };
        }));

        try {
            const sess = (sessions || []).find(s => s.id === targetId);
            const apiMsgs: ChatMessage[] = sess ? [...sess.messages, { role: 'user' as const, content: trimmed }] : [];
            await streamSSE(apiMsgs.filter(m => m.role !== 'system' || apiMsgs.length < 5), targetId, abortRef.current.signal);
        } catch (err) {
            if (err.name === 'AbortError') return;
            setSessions(prev => prev.map(s => s.id === targetId
                ? { ...s, messages: [...s.messages.slice(0, -1), { role: 'assistant', content: `Network Error: ${err.message}` }] } : s));
        } finally {
            setIsTyping(false);
            abortRef.current = null;
            const final = (sessionsRef.current || []).find(s => s.id === targetId);
            if (final) syncToServer(targetId, final);
        }
    }, [isTyping, currentSessionId, sessions, streamSSE, syncToServer]);

    // ── Regenerate ──
    const regenerate = useCallback(async (msgIndex: number) => {
        if (isTyping) return;
        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();

        const targetId = currentSessionId || (sessions || [])[0]?.id;
        if (!targetId) return;
        const sess = (sessions || []).find(s => s.id === targetId);
        if (!sess) return;

        const history = sess.messages.slice(0, msgIndex);
        setIsTyping(true);
        setSessions(prev => prev.map(s => s.id === targetId ? { ...s, messages: [...history, { role: 'assistant', content: '' }] } : s));

        try {
            await streamSSE(history.filter(m => m.role !== 'system' || history.length < 5), targetId, abortRef.current.signal);
        } catch (err) {
            if (err.name === 'AbortError') return;
            setSessions(prev => prev.map(s => s.id === targetId
                ? { ...s, messages: [...history, { role: 'assistant', content: `Network Error: ${err.message}` }] } : s));
        } finally {
            setIsTyping(false);
            abortRef.current = null;
            const final = (sessionsRef.current || []).find(s => s.id === targetId);
            if (final) syncToServer(targetId, final);
        }
    }, [isTyping, currentSessionId, sessions, streamSSE, syncToServer]);

    // ── Edit user message ──
    const editUserMsg = useCallback(async (msgIndex: number, newVal: string) => {
        if (isTyping || !newVal?.trim()) return;
        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();

        const targetId = currentSessionId || (sessions || [])[0]?.id;
        if (!targetId) return;
        const sess = (sessions || []).find(s => s.id === targetId);
        if (!sess || sess.messages[msgIndex]?.role !== 'user') return;

        const history = [...sess.messages.slice(0, msgIndex), { ...sess.messages[msgIndex], content: newVal.trim() }];
        setIsTyping(true);
        setSessions(prev => prev.map(s => s.id === targetId ? { ...s, messages: [...history, { role: 'assistant', content: '' }] } : s));

        try {
            await streamSSE(history.filter(m => m.role !== 'system' || history.length < 5), targetId, abortRef.current.signal);
        } catch (err) {
            if (err.name === 'AbortError') return;
            setSessions(prev => prev.map(s => s.id === targetId
                ? { ...s, messages: [...history, { role: 'assistant', content: `Network Error: ${err.message}` }] } : s));
        } finally {
            setIsTyping(false);
            abortRef.current = null;
            const final = (sessionsRef.current || []).find(s => s.id === targetId);
            if (final) syncToServer(targetId, final);
        }
    }, [isTyping, currentSessionId, sessions, streamSSE, syncToServer]);

    // ── Stop streaming ──
    const stopStream = useCallback(() => {
        if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
        if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        setIsTyping(false);
    }, []);

    return {
        sessions, currentSessionId, isTyping, deletingId, modalConfig,
        setCurrentSessionId, setModalConfig,
        createNewSession, promptDelete, confirmDelete,
        sendMessage, regenerate, editUserMsg, stopStream,
    };
}

export function useAIMemory() {
    const [memory, setMemory] = useState({});
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        aiMemoryApi.get().then(d => setMemory(d.memory || {})).catch(() => {});
    }, []);

    const save = useCallback(async (form) => {
        setSaving(true);
        try {
            const res = await aiMemoryApi.update(form);
            setMemory(res.memory || form);
            setOpen(false);
        } catch { /* keep modal open for retry */ }
        finally { setSaving(false); }
    }, []);

    return { memory, open, setOpen, saving, save };
}
