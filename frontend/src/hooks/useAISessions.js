import { useState, useEffect, useRef, useCallback } from 'react';
import { aiSessionApi, aiMemoryApi, createChatStream } from '../services/aiApi';

const SYSTEM_MSG = { role: 'system', content: 'You are a helpful academic AI assistant for HKU.' };

function buildSession(raw) {
    return {
        id: raw.id,
        title: raw.title || 'New Conversation',
        messages: raw.messages || [SYSTEM_MSG],
    };
}

export function useAISessions() {
    const [sessions, setSessions] = useState(null);
    const [currentSessionId, setCurrentSessionId] = useState(null);
    const [isTyping, setIsTyping] = useState(false);
    const [deletingId, setDeletingId] = useState(null);
    const [modalConfig, setModalConfig] = useState({ show: false, sessionId: null });

    const abortRef = useRef(null);
    const rafRef = useRef(null);
    const sessionsRef = useRef(sessions);
    sessionsRef.current = sessions;

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
        if (!sess || !sess._needFetch) return;

        let cancelled = false;
        (async () => {
            try {
                const data = await aiSessionApi.get(currentSessionId);
                if (cancelled) return;
                setSessions(prev => (prev || []).map(s =>
                    s.id !== currentSessionId ? s : { ...s, title: data.title || s.title, messages: data.messages || s.messages, _needFetch: false }
                ));
            } catch {
                setSessions(prev => (prev || []).map(s =>
                    s.id === currentSessionId ? { ...s, _needFetch: false } : s
                ));
            }
        })();
        return () => { cancelled = true; };
    }, [currentSessionId, sessions]);

    // ── Sync helper ──
    const syncToServer = useCallback(async (id, data) => {
        if (!id || !data) return;
        try { await aiSessionApi.update(id, { title: data.title, messages: data.messages }); }
        catch { /* local state is source of truth */ }
    }, []);

    // ── Create / switch ──
    const createNewSession = useCallback(async (switchImmediately = true, forceId = null) => {
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
    const promptDelete = useCallback((e, id) => {
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
    const streamSSE = useCallback(async (apiMessages, targetId, signal) => {
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

        const flush = () => {
            rafRef.current = null;
            const snapshot = full;
            setSessions(prev => prev.map(s => {
                if (s.id !== targetId) return s;
                const msgs = [...s.messages];
                msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: snapshot };
                return { ...s, messages: msgs };
            }));
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
                if (!trimmed || !trimmed.startsWith('data: ')) continue;
                const raw = trimmed.slice(6);
                if (raw === '[DONE]') continue;
                try {
                    const obj = JSON.parse(raw);
                    if (obj.error) full += `\n\n**[Error]**: ${obj.error}`;
                    else if (obj.choices?.[0]?.delta?.content !== undefined) full += obj.choices[0].delta.content;
                    schedule();
                } catch { /* skip */ }
            }
        }

        if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        flush();
    }, []);

    // ── Send message ──
    const sendMessage = useCallback(async (text) => {
        if (isTyping || !text.trim()) return;
        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();

        let targetId = currentSessionId || (sessions || [])[0]?.id;
        if (!targetId) return;
        if (targetId !== currentSessionId) setCurrentSessionId(targetId);

        const trimmed = text.trim();
        setIsTyping(true);

        setSessions(prev => prev.map(s => {
            if (s.id !== targetId) return s;
            const title = s.messages.length <= 1 ? (trimmed.length > 20 ? trimmed.slice(0, 20) + '...' : trimmed) : s.title;
            return { ...s, title, messages: [...s.messages, { role: 'user', content: trimmed }, { role: 'assistant', content: '' }] };
        }));

        try {
            const sess = (sessions || []).find(s => s.id === targetId);
            const apiMsgs = sess ? [...sess.messages, { role: 'user', content: trimmed }] : [];
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
    const regenerate = useCallback(async (msgIndex) => {
        if (isTyping) return;
        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();

        const targetId = currentSessionId || (sessions || [])[0]?.id;
        if (!targetId) return;
        const sess = (sessions || []).find(s => s.id === targetId);
        if (!sess) return;

        const history = sess.messages.slice(0, msgIndex);
        setIsTyping(true);
        setSessions(prev => prev.map(s => s.id !== targetId ? s : { ...s, messages: [...history, { role: 'assistant', content: '' }] }));

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
    const editUserMsg = useCallback(async (msgIndex, newVal) => {
        if (isTyping || !newVal?.trim()) return;
        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();

        const targetId = currentSessionId || (sessions || [])[0]?.id;
        if (!targetId) return;
        const sess = (sessions || []).find(s => s.id === targetId);
        if (!sess || sess.messages[msgIndex]?.role !== 'user') return;

        const history = [...sess.messages.slice(0, msgIndex), { ...sess.messages[msgIndex], content: newVal.trim() }];
        setIsTyping(true);
        setSessions(prev => prev.map(s => s.id !== targetId ? s : { ...s, messages: [...history, { role: 'assistant', content: '' }] }));

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
