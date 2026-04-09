import { useState, useEffect, useRef, useCallback } from 'react';
import {
    aiSessionApi,
    aiMemoryApi,
    createChatStream,
    getProviderHealth,
    extractPdfText as extractPdfTextFromServer,
    type AIProvider,
    type AITutorMode,
} from '../api/aiApi';
import { networkBus } from './useNetworkStatus';
import type { AISession, ChatMessage, RagCitation } from '../types/api';

interface ModalConfig {
    show: boolean;
    sessionId: string | null;
}

interface PdfTextItem {
    str?: string;
}

interface PdfPage {
    getTextContent(): Promise<{ items?: PdfTextItem[] }>;
}

interface PdfDocumentProxy {
    numPages: number;
    getPage(pageNumber: number): Promise<PdfPage>;
    destroy(): Promise<void> | void;
}

interface PdfJsModule {
    getDocument(options: { data: ArrayBuffer; disableWorker: boolean }): { promise: Promise<PdfDocumentProxy> };
}

interface PendingAttachment {
    file?: File;
}

type AttachmentInput = PendingAttachment | File;

function getErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err || 'unknown error');
}

const SYSTEM_MSG: ChatMessage = { role: 'system', content: 'You are a helpful academic AI assistant for HKU.' };
const PROVIDER_STORAGE_KEY = 'ai_provider';
const TUTOR_MODE_STORAGE_KEY = 'ai_tutor_mode';
const MAX_PDF_EXTRACT_CHARS = 12000;

async function fileToBase64Payload(file: File): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result || '');
            const payload = result.includes(',') ? result.split(',')[1] : result;
            resolve(payload || '');
        };
        reader.onerror = () => reject(new Error('Failed to read file as base64'));
        reader.readAsDataURL(file);
    });
}

async function extractPdfTextFromBrowser(file: File, maxChars: number = MAX_PDF_EXTRACT_CHARS): Promise<string> {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs') as unknown as PdfJsModule;
    const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer(), disableWorker: true });
    const doc = await loadingTask.promise;
    const chunks: string[] = [];
    let totalChars = 0;

    try {
        for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
            const page = await doc.getPage(pageNo);
            const content = await page.getTextContent();
            const pageText = (content.items || [])
                .map((it: PdfTextItem) => String(it?.str || '').trim())
                .filter(Boolean)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();

            if (!pageText) continue;
            const remaining = maxChars - totalChars;
            if (remaining <= 0) break;
            const sliced = pageText.slice(0, remaining);
            chunks.push(`[Page ${pageNo}] ${sliced}`);
            totalChars += sliced.length;
            if (totalChars >= maxChars) break;
        }
    } finally {
        try {
            await doc.destroy();
        } catch {
            // no-op
        }
    }

    return chunks.join('\n\n');
}

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
    const [selectedProvider, setSelectedProvider] = useState<AIProvider>(() => {
        const stored = localStorage.getItem(PROVIDER_STORAGE_KEY);
        return stored === 'coze' ? 'coze' : 'local_ollama';
    });
    const [tutorMode, setTutorMode] = useState<AITutorMode>(() => {
        const stored = localStorage.getItem(TUTOR_MODE_STORAGE_KEY);
        return stored === 'hint_only' ? 'hint_only' : 'tutor';
    });
    const [providerHealth, setProviderHealth] = useState<{ ok: boolean; detail: string }>({ ok: true, detail: 'ok' });

    const abortRef = useRef<AbortController | null>(null);
    const rafRef = useRef<number | null>(null);
    const sendingRef = useRef(false);
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

    useEffect(() => {
        localStorage.setItem(PROVIDER_STORAGE_KEY, selectedProvider);
    }, [selectedProvider]);

    useEffect(() => {
        localStorage.setItem(TUTOR_MODE_STORAGE_KEY, tutorMode);
    }, [tutorMode]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const health = await getProviderHealth(selectedProvider);
                if (!cancelled) {
                    setProviderHealth({ ok: !!health.ok, detail: String(health.detail || '') });
                }
            } catch (err) {
                if (!cancelled) {
                    setProviderHealth({ ok: false, detail: getErrorMessage(err) || 'health check failed' });
                }
            }
        })();
        return () => { cancelled = true; };
    }, [selectedProvider]);

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
    const streamSSE = useCallback(async (apiMessages: ChatMessage[], targetId: string, provider: AIProvider, mode: AITutorMode, signal: AbortSignal) => { // NOSONAR
        const response = await createChatStream(apiMessages, provider, mode, signal);

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
        let providerNotice = '';

        const flush = () => {
            rafRef.current = null;
            const snapshot = providerNotice ? `${providerNotice}\n\n${full}` : full;
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
                    }
                    if (obj.meta?.fallback_from && obj.meta?.fallback_to) {
                        providerNotice = `Provider switched: ${obj.meta.fallback_from} -> ${obj.meta.fallback_to}`;
                        schedule();
                        continue;
                    }
                    if (obj.meta?.warning && !providerNotice) {
                        providerNotice = `Provider notice: ${obj.meta.warning}`;
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
    const sendMessage = useCallback(async (text: string, attachedFiles: AttachmentInput[] = []) => {
        if (sendingRef.current || isTyping || (!text.trim() && attachedFiles.length === 0)) return;
        sendingRef.current = true;
        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();

        let targetId = currentSessionId || (sessions || [])[0]?.id;
        if (!targetId) {
            sendingRef.current = false;
            return;
        }
        if (targetId !== currentSessionId) setCurrentSessionId(targetId);

        const trimmed = text.trim();

        // Process attachments: images -> base64, pdf -> extracted text summary
        const images: string[] = [];
        const attachmentNotes: string[] = [];
        const filesMeta: { file_name: string, mime_type: string }[] = [];
        for (const f of attachedFiles) {
            const file = (typeof f === 'object' && f && 'file' in f && f.file instanceof File ? f.file : f) as File | undefined;
            if (!file) continue;

            if ((file.type || '').startsWith('image/')) {
                const base64 = await fileToBase64Payload(file);
                if (base64) images.push(base64);
                continue;
            }

            filesMeta.push({ file_name: file.name, mime_type: file.type || 'application/octet-stream' });
            if ((file.type || '') === 'application/pdf' || (file.name || '').toLowerCase().endsWith('.pdf')) {
                try {
                    let extracted = await extractPdfTextFromBrowser(file);
                    if (!extracted) {
                        const serverResult = await extractPdfTextFromServer(file);
                        extracted = String(serverResult?.text || '');
                    }
                    if (extracted) {
                        attachmentNotes.push(`Attached PDF: ${file.name}\n${extracted}`);
                    } else {
                        attachmentNotes.push(`Attached PDF: ${file.name} (No extractable text found)`);
                    }
                } catch {
                    attachmentNotes.push(`Attached PDF: ${file.name} (Text extraction failed; please summarize manually)`);
                }
                continue;
            }

            attachmentNotes.push(`Attached file: ${file.name} (${file.type || 'unknown type'})`);
        }

        const combinedUserContent = trimmed;
        const attachedText = attachmentNotes.length > 0 ? attachmentNotes.join('\n\n') : undefined;

        if (!combinedUserContent && !attachedText && images.length === 0) {
            sendingRef.current = false;
            return;
        }

        // Refuse to stream while offline — show an inline error message
        if (networkBus.isOffline) {
            setSessions(prev => prev.map(s => s.id !== targetId ? s : {
                ...s,
                messages: [
                    ...s.messages,
                    { role: 'user' as const, content: combinedUserContent, attachedText: attachedText, images: images.length ? images : undefined, files: filesMeta.length ? filesMeta : undefined },
                    { role: 'assistant' as const, content: 'You appear to be offline. Please check your network connection and try again.' },
                ],
            }));
            sendingRef.current = false;
            return;
        }

        setIsTyping(true);

        setSessions(prev => prev.map(s => {
            if (s.id !== targetId) return s;
            let title = s.title;
            if (s.messages.length <= 1) {
                let display = combinedUserContent || filesMeta[0]?.file_name || attachmentNotes[0];
                title = display.length > 20 ? `${display.slice(0, 20)}...` : (display || "Attachment only");
            }
            return {
                ...s,
                title,
                messages: [
                    ...s.messages,
                    { role: 'user' as const, content: combinedUserContent, attachedText: attachedText, images: images.length ? images : undefined, files: filesMeta.length ? filesMeta : undefined },
                    { role: 'assistant' as const, content: '' }
                ]
            };
        }));

        try {
            const sess = (sessions || []).find(s => s.id === targetId);
            const apiMsgs: ChatMessage[] = sess
                ? [...sess.messages, { role: 'user' as const, content: combinedUserContent, attachedText: attachedText, images: images.length ? images : undefined, files: filesMeta.length ? filesMeta : undefined }]
                : [];
            
            // Map the messages before sending to API so the backend receives the combined text
            const payloadMsgs = apiMsgs.map(m => ({
                role: m.role,
                content: [m.content, m.attachedText].filter(Boolean).join('\n\n'),
                images: m.images
            })).filter(m => m.role !== 'system' || apiMsgs.length < 5);

            await streamSSE(
                payloadMsgs,
                targetId,
                selectedProvider,
                tutorMode,
                abortRef.current.signal,
            );
        } catch (err: unknown) {
            if (err instanceof Error && err.name === 'AbortError') return;
            setSessions(prev => prev.map(s => s.id === targetId
                ? { ...s, messages: [...s.messages.slice(0, -1), { role: 'assistant', content: `Network Error: ${getErrorMessage(err)}` }] } : s));
        } finally {
            setIsTyping(false);
            abortRef.current = null;
            sendingRef.current = false;
            const final = (sessionsRef.current || []).find(s => s.id === targetId);
            if (final) syncToServer(targetId, final);
        }
    }, [isTyping, currentSessionId, sessions, streamSSE, syncToServer, selectedProvider, tutorMode]);

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
            const payloadMsgs = history.map(m => ({
                role: m.role,
                content: [m.content, m.attachedText].filter(Boolean).join('\n\n'),
                images: m.images
            })).filter(m => m.role !== 'system' || history.length < 5);

            await streamSSE(
                payloadMsgs,
                targetId,
                selectedProvider,
                tutorMode,
                abortRef.current.signal,
            );
        } catch (err: unknown) {
            if (err instanceof Error && err.name === 'AbortError') return;
            setSessions(prev => prev.map(s => s.id === targetId
                ? { ...s, messages: [...history, { role: 'assistant', content: `Network Error: ${getErrorMessage(err)}` }] } : s));
        } finally {
            setIsTyping(false);
            abortRef.current = null;
            const final = (sessionsRef.current || []).find(s => s.id === targetId);
            if (final) syncToServer(targetId, final);
        }
    }, [isTyping, currentSessionId, sessions, streamSSE, syncToServer, selectedProvider, tutorMode]);

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
            const payloadMsgs = history.map(m => ({
                role: m.role,
                content: [m.content, m.attachedText].filter(Boolean).join('\n\n'),
                images: m.images
            })).filter(m => m.role !== 'system' || history.length < 5);

            await streamSSE(
                payloadMsgs,
                targetId,
                selectedProvider,
                tutorMode,
                abortRef.current.signal,
            );
        } catch (err: unknown) {
            if (err instanceof Error && err.name === 'AbortError') return;
            setSessions(prev => prev.map(s => s.id === targetId
                ? { ...s, messages: [...history, { role: 'assistant', content: `Network Error: ${getErrorMessage(err)}` }] } : s));
        } finally {
            setIsTyping(false);
            abortRef.current = null;
            const final = (sessionsRef.current || []).find(s => s.id === targetId);
            if (final) syncToServer(targetId, final);
        }
    }, [isTyping, currentSessionId, sessions, streamSSE, syncToServer, selectedProvider, tutorMode]);

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
        selectedProvider, setSelectedProvider, providerHealth,
        tutorMode, setTutorMode,
    };
}

export function useAIMemory() {
    const [memory, setMemory] = useState<Record<string, unknown>>({});
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        aiMemoryApi.get().then(d => setMemory(d.memory || {})).catch(() => {});
    }, []);

    const save = useCallback(async (form: Record<string, unknown>) => {
        setSaving(true);
        try {
            const res = await aiMemoryApi.update(form);
            setMemory((res.memory || form) as Record<string, unknown>);
            setOpen(false);
        } catch { /* keep modal open for retry */ }
        finally { setSaving(false); }
    }, []);

    return { memory, open, setOpen, saving, save };
}
