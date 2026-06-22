import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { resolveApiRoot } from '@/shared/api/root';
import PptGeneratorShell from '../../components/PptGeneratorShell';
import { slidesGenerationApi, type SlidesRuntimeProvider } from '../../api/slidesApi';
import {
    loadPresentonWorkspaceDraft,
    savePresentonWorkspaceDraft,
    type PresentonWorkspaceDraft,
} from './presentonState';
import { getPresentonStepIndex, getPresentonSteps } from './presentonConstants';
import styles from './presenton.module.css';

type ChatMessage = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
};

type TaskEvent = {
    type: string;
    step: string;
    message: string;
    ts: number;
};

function createMessageId() {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function PresentonWorkspacePage() {
    const navigate = useNavigate();
    const [draft, setDraft] = useState<PresentonWorkspaceDraft | null>(() => loadPresentonWorkspaceDraft());
    const [provider, setProvider] = useState<SlidesRuntimeProvider>('auto');
    const [selectedSlideIndex, setSelectedSlideIndex] = useState(1);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [prompt, setPrompt] = useState('');
    const [assistantLoading, setAssistantLoading] = useState(false);
    const [assistantError, setAssistantError] = useState('');
    const [taskEvents, setTaskEvents] = useState<TaskEvent[]>([]);
    const chatBodyRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!draft) {
            navigate('/slides/presenton', { replace: true });
            return;
        }
        setProvider(draft.provider || 'auto');
        if (draft.result?.slides?.[0]?.index) {
            setSelectedSlideIndex(draft.result.slides[0].index);
        }
    }, [draft, navigate]);

    useEffect(() => {
        if (!draft) return;
        savePresentonWorkspaceDraft(draft);
    }, [draft]);

    useEffect(() => {
        chatBodyRef.current?.scrollTo({ top: chatBodyRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages, assistantLoading]);

    useEffect(() => {
        if (!draft?.taskId) return undefined;
        if (draft.status === 'completed' || draft.status === 'failed') return undefined;

        let active = true;
        let timer: number | null = null;

        const poll = async () => {
            try {
                const status = await slidesGenerationApi.getTask(draft.taskId);
                if (!active) return;

                setTaskEvents((status.events || []) as TaskEvent[]);
                setDraft((current) => {
                    if (!current) return current;
                    const nextDraft: PresentonWorkspaceDraft = {
                        ...current,
                        status: status.status,
                        currentStep: status.current_step,
                        progress: status.progress || 0,
                        error: status.error || '',
                        result: status.result || current.result || null,
                    };
                    return nextDraft;
                });

                if (status.status === 'completed' && status.result) {
                    if (status.result.deck_id) {
                        localStorage.setItem('slides_last_deck_id', status.result.deck_id);
                    }
                    if (status.result.ppt_schema) {
                        localStorage.setItem('ppt_schema', JSON.stringify(status.result.ppt_schema));
                    }
                    return;
                }

                if (status.status !== 'failed') {
                    timer = window.setTimeout(poll, 1000);
                }
            } catch (error: any) {
                if (!active) return;
                setDraft((current) => current ? {
                    ...current,
                    status: 'failed',
                    error: error?.response?.data?.detail || error?.message || 'Failed to read generation status',
                } : current);
            }
        };

        void poll();

        return () => {
            active = false;
            if (timer) window.clearTimeout(timer);
        };
    }, [draft?.taskId, draft?.status]);

    const selectedSlide = useMemo(() => (
        draft?.result?.slides?.find((slide) => slide.index === selectedSlideIndex) || draft?.result?.slides?.[0]
    ), [draft, selectedSlideIndex]);

    const selectedOutline = useMemo(() => (
        draft?.outlineSlides.find((slide) => slide.index === selectedSlideIndex) || draft?.outlineSlides[0]
    ), [draft, selectedSlideIndex]);

    const sendAssistantMessage = async () => {
        if (!draft?.result || !prompt.trim() || assistantLoading) return;
        const userMessage: ChatMessage = { id: createMessageId(), role: 'user', content: prompt.trim() };
        const assistantMessageId = createMessageId();
        const nextMessages = [...messages, userMessage, { id: assistantMessageId, role: 'assistant', content: '' }];
        setMessages(nextMessages);
        setPrompt('');
        setAssistantLoading(true);
        setAssistantError('');

        try {
            const response = await fetch(`${resolveApiRoot()}/api/slides/presenton/assistant/stream`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider,
                    message: userMessage.content,
                    presentation_title: draft.source.presentationTitle,
                    current_slide_index: selectedSlideIndex - 1,
                    current_slide_title: selectedOutline?.title || selectedSlide?.title || '',
                    current_slide_content: selectedOutline?.key_points || [],
                    history: nextMessages.slice(-10).map((item) => ({ role: item.role, content: item.content })),
                    slides: draft.outlineSlides.map((slide) => ({
                        index: slide.index,
                        title: slide.title || '',
                        objective: slide.objective || '',
                        key_points: slide.key_points || [],
                    })),
                }),
            });
            if (!response.ok || !response.body) {
                throw new Error(`Assistant request failed: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            let assistantContent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('data: ')) continue;
                    const payload = trimmed.slice(6);
                    if (payload === '[DONE]') continue;
                    const parsed = JSON.parse(payload);
                    if (parsed.error) {
                        throw new Error(String(parsed.error));
                    }
                    const delta = parsed.choices?.[0]?.delta?.content;
                    if (!delta) continue;
                    assistantContent += String(delta);
                    setMessages((current) => current.map((message) => (
                        message.id === assistantMessageId
                            ? { ...message, content: assistantContent }
                            : message
                    )));
                }
            }
        } catch (error: any) {
            setAssistantError(error?.message || 'Assistant request failed');
            setMessages((current) => current.filter((message) => message.id !== assistantMessageId));
        } finally {
            setAssistantLoading(false);
        }
    };

    if (!draft) {
        return null;
    }

    const isGenerating = draft.status !== 'completed' && draft.status !== 'failed';
    const exportPptx = draft.result?.exports?.pptx;
    const generationError = draft.error || assistantError;

    return (
        <PptGeneratorShell
            currentStep={getPresentonStepIndex('presentation', draft.source.kind)}
            steps={getPresentonSteps(draft.source.kind)}
            onStepSelect={(index) => {
                if (index === 0) navigate('/slides/presenton');
                if (index === 1 && draft.source.kind === 'upload') navigate('/slides/presenton/documents-preview');
                if ((draft.source.kind === 'upload' && index === 2) || (draft.source.kind === 'text' && index === 1)) {
                    navigate('/slides/presenton/outline');
                }
            }}
            className="container"
            contentClassName={styles.page}
            toolbar={(
                <div className={styles.toolbar}>
                    <div className={styles.toolbarTitle}>
                        <strong>Presentation</strong>
                        <span>
                            {isGenerating
                                ? 'Generating slides and deck assets...'
                                : 'Review the generated deck, download the PPTX, and chat against the outline.'}
                        </span>
                    </div>
                    <div className={styles.toolbarActions}>
                        {exportPptx?.download_url && !isGenerating && (
                            <a className={styles.buttonPrimary} href={exportPptx.download_url}>
                                <i className="fas fa-download" aria-hidden="true" /> Download PPTX
                            </a>
                        )}
                    </div>
                </div>
            )}
        >
            <div className={styles.workspaceGrid}>
                <section className={styles.previewPanel}>
                    <div className={styles.previewHeader}>
                        <h2>{draft.result?.ppt_schema?.presentation_title || draft.source.presentationTitle}</h2>
                        <p>
                            Template: {draft.selectedTheme || 'Auto'}
                            {' '}| Provider: {draft.result?.provider_resolved || draft.result?.provider_requested || draft.provider}
                            {' '}| Task: {draft.taskId}
                        </p>
                    </div>

                    {isGenerating ? (
                        <div className={styles.generatingState}>
                            <div className={styles.progressTrack}>
                                <div className={styles.progressFill} style={{ width: `${draft.progress || 0}%` }} />
                            </div>
                            <div className={styles.statusRow}>
                                <strong>Current step</strong>
                                <span>{draft.currentStep || 'queued'}</span>
                            </div>
                            <ol className={styles.taskList}>
                                {(taskEvents.length ? taskEvents : [{ step: 'queued', message: 'Presentation generation started', type: 'step_start', ts: Date.now() }]).slice(-10).map((event, index) => (
                                    <li key={`${event.ts}-${index}`}>
                                        <strong>{event.step}</strong>: {event.message}
                                    </li>
                                ))}
                            </ol>
                        </div>
                    ) : selectedSlide ? (
                        <>
                            <div className={styles.slideStage}>
                                <img src={selectedSlide.svg_url} alt={selectedSlide.title} />
                            </div>
                            <div className={styles.thumbnailRail}>
                                {draft.result?.slides?.map((slide) => (
                                    <button
                                        type="button"
                                        key={slide.index}
                                        className={`${styles.thumbnail} ${selectedSlideIndex === slide.index ? styles.thumbnailActive : ''}`}
                                        onClick={() => setSelectedSlideIndex(slide.index)}
                                        title={slide.title}
                                    >
                                        <img src={slide.preview_url || slide.svg_url} alt="" />
                                        <strong>{slide.title}</strong>
                                        <span className={styles.slideMeta}>Slide {slide.index}</span>
                                    </button>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className={styles.emptyState}>
                            <div>
                                <strong>No slide preview available.</strong>
                                <p className={styles.emptyText}>The deck metadata was saved, but no SVG slide preview could be loaded.</p>
                            </div>
                        </div>
                    )}
                </section>

                <aside className={styles.assistantPanel}>
                    <div className={styles.assistantHeader}>
                        <h2>{isGenerating ? 'Generation Status' : 'AI Assistant'}</h2>
                        <p>
                            {isGenerating
                                ? 'Stay on this page while Presenton finishes generating the presentation.'
                                : 'Grounded in the current outline and selected slide.'}
                        </p>
                    </div>

                    {generationError && <div className={styles.error}>{generationError}</div>}

                    {isGenerating ? (
                        <div className={styles.statusCard}>
                            <div className={styles.statusRow}>
                                <strong>Progress</strong>
                                <span>{draft.progress || 0}%</span>
                            </div>
                            <div className={styles.statusRow}>
                                <strong>Current step</strong>
                                <span>{draft.currentStep || 'queued'}</span>
                            </div>
                            <div className={styles.statusRow}>
                                <strong>Template</strong>
                                <span>{draft.selectedTheme || '-'}</span>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div ref={chatBodyRef} className={styles.chatBody}>
                                {messages.length === 0 ? (
                                    <div className={styles.chatBubbleAssistant}>
                                        Ask for stronger framing, better ordering, tighter bullets, or speaking guidance for the selected slide.
                                    </div>
                                ) : messages.map((message) => (
                                    <div
                                        key={message.id}
                                        className={message.role === 'user' ? styles.chatBubbleUser : styles.chatBubbleAssistant}
                                    >
                                        {message.content || (assistantLoading && message.role === 'assistant' ? 'Thinking...' : '')}
                                    </div>
                                ))}
                            </div>

                            <div className={styles.chatComposer}>
                                <textarea
                                    value={prompt}
                                    onChange={(event) => setPrompt(event.target.value)}
                                    placeholder="Improve the selected slide's narrative, suggest missing sections, or rewrite it for a different tone."
                                />
                                <div className={styles.chatActionRow}>
                                    <span className={styles.assistantMeta}>
                                        Focused slide: {selectedSlideIndex} {selectedOutline?.title ? `- ${selectedOutline.title}` : ''}
                                    </span>
                                    <button
                                        type="button"
                                        className={styles.chatSend}
                                        onClick={sendAssistantMessage}
                                        disabled={!prompt.trim() || assistantLoading}
                                    >
                                        <i className={`fas ${assistantLoading ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`} aria-hidden="true" /> Send
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </aside>
            </div>
        </PptGeneratorShell>
    );
}
