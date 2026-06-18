import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { aiConfigApi, type AIConfigResponse } from '@/features/ai-config/api/aiConfigApi';
import {
    slidesGenerationApi,
    type SlidesGenerateV2TaskStatusResponse,
    type SlidesProviderStatus,
    type SlidesRuntimeProvider,
    type SvgDeckManifest,
    type SvgDeckSlide,
} from '../../api/slidesApi';
import { getStoredSlidesProvider, setStoredSlidesProvider } from '../../utils/providerStorage';
import styles from './styles/generateWorkbench.module.css';

type GenerateResult = NonNullable<SlidesGenerateV2TaskStatusResponse['result']>;

type WorkbenchLocationState = {
    taskId?: string;
    deckId?: string;
    result?: GenerateResult;
    pptSchema?: Record<string, unknown>;
};

const DEFAULT_PROVIDERS: SlidesProviderStatus[] = [
    { id: 'auto', label: 'Auto', available: true, configured: true, source: 'auto', model: 'auto', message: 'Use best available provider', is_recommended: true },
    { id: 'openai', label: 'OpenAI', available: false, configured: false, source: 'user_ai_config', model: '', message: 'Not checked', is_recommended: false },
    { id: 'deepseek', label: 'DeepSeek', available: false, configured: false, source: 'user_ai_config', model: '', message: 'Not checked', is_recommended: false },
    { id: 'local_ollama', label: 'Local Ollama', available: false, configured: true, source: 'global_service', model: '', message: 'Not checked', is_recommended: false },
    { id: 'coze', label: 'Coze', available: false, configured: false, source: 'global_service', model: '', message: 'Not checked', is_recommended: false },
];

function readJsonFromStorage<T>(key: string): T | null {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

function readTextFromStorage(key: string): string {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(key) || '';
}

function formatDate(value?: string | null): string {
    if (!value) return 'Never';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
}

function statusTone(status?: boolean): string {
    if (status) return styles.good;
    return styles.warn;
}

function providerLabel(id?: string): string {
    if (!id) return '';
    return DEFAULT_PROVIDERS.find((item) => item.id === id)?.label || id;
}

export default function GenerateWorkbenchPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const locationState = (location.state || {}) as WorkbenchLocationState;
    const hasExplicitDeck = Boolean(locationState.deckId || locationState.result?.deck_id);

    const [providers, setProviders] = useState<SlidesProviderStatus[]>([]);
    const [provider, setProvider] = useState<SlidesRuntimeProvider>(() => getStoredSlidesProvider());
    const [providerError, setProviderError] = useState('');
    const [aiConfig, setAiConfig] = useState<AIConfigResponse | null>(null);

    const [taskId] = useState(() => locationState.taskId || readTextFromStorage('slides_last_task_id'));
    const [taskEvents, setTaskEvents] = useState<SlidesGenerateV2TaskStatusResponse['events']>([]);
    const [taskProgress, setTaskProgress] = useState(0);
    const [taskStatus, setTaskStatus] = useState('');
    const [result, setResult] = useState<GenerateResult | null>(() => locationState.result || null);
    const [deckId, setDeckId] = useState(() => (
        locationState.deckId
        || locationState.result?.deck_id
        || readTextFromStorage('slides_last_deck_id')
        || ''
    ));
    const [deck, setDeck] = useState<SvgDeckManifest | null>(null);
    const [designSpec, setDesignSpec] = useState('');
    const [deckError, setDeckError] = useState('');
    const [selectedSlideIndex, setSelectedSlideIndex] = useState(1);
    const [activePanel, setActivePanel] = useState<'design' | 'spec' | 'quality' | 'events'>('design');
    const [pptSchema, setPptSchema] = useState<Record<string, unknown> | null>(() => (
        locationState.pptSchema
        || locationState.result?.ppt_schema
        || readJsonFromStorage<Record<string, unknown>>('ppt_schema')
    ));

    const providerRows = providers.length ? providers : DEFAULT_PROVIDERS;
    const providerStatus = providerRows.find((item) => item.id === provider);
    const specLock = (result?.spec_lock || deck?.spec_lock || {}) as Record<string, unknown>;
    const llmSpec = (specLock.llm || {}) as Record<string, unknown>;
    const resolvedProvider = result?.provider_resolved || result?.provider || String(llmSpec.llm_provider || '');
    const resolvedModel = result?.provider_model || String(llmSpec.llm_model || '');
    const providerSource = result?.provider_source || String(llmSpec.provider_source || '');
    const qualityReport = result?.quality_report || deck?.quality_report;
    const pptxExport = result?.exports?.pptx || deck?.exports?.pptx;
    const slides: SvgDeckSlide[] = useMemo(() => {
        if (deck?.slides?.length) return deck.slides;
        return result?.slides || [];
    }, [deck, result]);
    const selectedSlide = slides.find((slide) => slide.index === selectedSlideIndex) || slides[0];

    useEffect(() => {
        let cancelled = false;

        async function loadProviderMatrix() {
            try {
                setProviderError('');
                const [matrix, profileConfig] = await Promise.all([
                    slidesGenerationApi.listProviders(),
                    aiConfigApi.get(),
                ]);
                if (cancelled) return;
                setProviders(matrix.providers || []);
                setAiConfig(profileConfig);
            } catch (error: any) {
                if (!cancelled) {
                    setProviderError(error?.response?.data?.detail || error?.message || 'Failed to load provider status');
                }
            }
        }

        loadProviderMatrix();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!providers.length) return;
        const stored = getStoredSlidesProvider();
        const storedStatus = providers.find((item) => item.id === stored);
        if (stored === 'auto' || (storedStatus?.available && storedStatus?.configured)) {
            setProvider(stored);
            return;
        }
        setProvider('auto');
        setStoredSlidesProvider('auto');
    }, [providers]);

    useEffect(() => {
        if (!taskId) return;
        let cancelled = false;
        let timer: number | undefined;

        async function pollTask() {
            try {
                const status = await slidesGenerationApi.getTask(taskId);
                if (cancelled) return;
                setTaskStatus(status.status);
                setTaskProgress(status.progress || 0);
                setTaskEvents(status.events || []);
                if (status.result) {
                    setResult(status.result);
                    setPptSchema(status.result.ppt_schema);
                    if (status.result.ppt_schema) {
                        window.localStorage.setItem('ppt_schema', JSON.stringify(status.result.ppt_schema));
                    }
                    if (status.result.deck_id) {
                        setDeckId(status.result.deck_id);
                        window.localStorage.setItem('slides_last_deck_id', status.result.deck_id);
                    }
                }
                if (status.status === 'queued' || status.status === 'running') {
                    timer = window.setTimeout(pollTask, 1500);
                }
            } catch (error: any) {
                if (!cancelled) {
                    setDeckError(error?.response?.data?.detail || error?.message || 'Failed to refresh task');
                }
            }
        }

        pollTask();
        return () => {
            cancelled = true;
            if (timer) window.clearTimeout(timer);
        };
    }, [taskId]);

    useEffect(() => {
        if (!deckId) return;
        let cancelled = false;

        async function loadDeck() {
            try {
                setDeckError('');
                const [deckManifest, specText] = await Promise.all([
                    slidesGenerationApi.getDeck(deckId),
                    slidesGenerationApi.getDesignSpec(deckId),
                ]);
                if (cancelled) return;
                setDeck(deckManifest);
                setDesignSpec(specText);
                if (deckManifest.slides?.[0]) {
                    setSelectedSlideIndex(deckManifest.slides[0].index);
                }
            } catch (error: any) {
                if (!cancelled) {
                    if (error?.response?.status === 404 && !hasExplicitDeck) {
                        window.localStorage.removeItem('slides_last_deck_id');
                        setDeckId('');
                        setDeckError('');
                        return;
                    }
                    setDeckError(error?.response?.data?.detail || error?.message || 'Failed to load SVG deck');
                }
            }
        }

        loadDeck();
        return () => {
            cancelled = true;
        };
    }, [deckId, hasExplicitDeck]);

    const handleProviderChange = (next: SlidesRuntimeProvider) => {
        setProvider(next);
        setStoredSlidesProvider(next);
    };

    const openLegacyEditor = () => {
        navigate('/slides/ppt-template', { state: { pptSchema } });
    };

    return (
        <main className={styles.page}>
            <header className={styles.header}>
                <div>
                    <p className={styles.eyebrow}>Slides Generate</p>
                    <h1>Generate Workbench</h1>
                </div>
                <div className={styles.headerActions}>
                    <button type="button" className={styles.secondaryButton} onClick={() => navigate('/ai-config')}>
                        <i className="fas fa-sliders-h" aria-hidden="true" /> AI Config
                    </button>
                    <button type="button" className={styles.secondaryButton} onClick={() => navigate('/slides/quick-process')}>
                        <i className="fas fa-file-import" aria-hidden="true" /> Source
                    </button>
                    {pptxExport?.download_url && (
                        <a className={styles.primaryButton} href={pptxExport.download_url}>
                            <i className="fas fa-download" aria-hidden="true" /> Download PPTX
                        </a>
                    )}
                    <button type="button" className={styles.primaryButton} onClick={openLegacyEditor} disabled={!pptSchema}>
                        <i className="fas fa-table-columns" aria-hidden="true" /> Legacy Editor
                    </button>
                </div>
            </header>

            <section className={styles.runtimeBar}>
                <label className={styles.providerSelectWrap}>
                    <span>Provider</span>
                    <select value={provider} onChange={(event) => handleProviderChange(event.target.value as SlidesRuntimeProvider)}>
                        {providerRows.map((item) => {
                            const disabled = item.id !== 'auto' && (!item.configured || !item.available);
                            const suffix = item.id === 'auto' ? item.message : `${item.model || 'model unset'} / ${item.source}`;
                            return (
                                <option key={item.id} value={item.id} disabled={disabled}>
                                    {item.label} - {disabled ? item.message : suffix}
                                </option>
                            );
                        })}
                    </select>
                </label>
                <div className={styles.runtimeStat}>
                    <span>Requested</span>
                    <strong>{providerLabel(result?.provider_requested || provider)}</strong>
                </div>
                <div className={styles.runtimeStat}>
                    <span>Resolved</span>
                    <strong>{providerLabel(resolvedProvider) || 'Pending'}</strong>
                </div>
                <div className={styles.runtimeStat}>
                    <span>Model</span>
                    <strong>{resolvedModel || providerStatus?.model || 'Pending'}</strong>
                </div>
                <div className={styles.runtimeStat}>
                    <span>Source</span>
                    <strong>{providerSource || providerStatus?.source || 'Pending'}</strong>
                </div>
                {!!taskId && (
                    <div className={styles.progressBox}>
                        <span>{taskStatus || 'task'} {taskProgress}%</span>
                        <div className={styles.progressTrack}>
                            <div className={styles.progressFill} style={{ width: `${taskProgress}%` }} />
                        </div>
                    </div>
                )}
            </section>

            {(providerError || deckError) && (
                <div className={styles.alert}>{providerError || deckError}</div>
            )}

            <div className={styles.grid}>
                <section className={styles.previewPanel}>
                    <div className={styles.panelHeader}>
                        <div>
                            <p className={styles.panelKicker}>SVG Deck</p>
                            <h2>{deck?.title || result?.ppt_schema?.presentation_title || 'No deck loaded'}</h2>
                        </div>
                        {qualityReport && (
                            <span className={`${styles.statusPill} ${qualityReport.status === 'passed' ? styles.good : styles.bad}`}>
                                {qualityReport.status}
                            </span>
                        )}
                    </div>

                    {selectedSlide ? (
                        <>
                            <div className={styles.slideStage}>
                                <img src={selectedSlide.svg_url} alt={selectedSlide.title} />
                            </div>
                            <div className={styles.thumbnailRail}>
                                {slides.map((slide) => (
                                    <button
                                        type="button"
                                        key={slide.index}
                                        className={`${styles.thumbnail} ${selectedSlideIndex === slide.index ? styles.thumbnailActive : ''}`}
                                        onClick={() => setSelectedSlideIndex(slide.index)}
                                        title={slide.title}
                                    >
                                        <img src={slide.preview_url || slide.svg_url} alt="" />
                                        <span>{slide.index}</span>
                                    </button>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className={styles.emptyState}>
                            <i className="fas fa-layer-group" aria-hidden="true" />
                            <strong>No SVG deck available</strong>
                            <button type="button" className={styles.primaryButton} onClick={() => navigate('/slides/quick-process')}>
                                Start Generation
                            </button>
                        </div>
                    )}
                </section>

                <aside className={styles.sidePanel}>
                    <div className={styles.panelHeader}>
                        <div>
                            <p className={styles.panelKicker}>AI Runtime</p>
                            <h2>Provider Matrix</h2>
                        </div>
                    </div>
                    <div className={styles.providerList}>
                        {providerRows.filter((item) => item.id !== 'auto').map((item) => (
                            <div key={item.id} className={styles.providerRow}>
                                <div>
                                    <strong>{item.label}</strong>
                                    <span>{item.source} / {item.model || 'model unset'}</span>
                                </div>
                                <span className={`${styles.statusPill} ${statusTone(item.available)}`}>
                                    {item.available ? 'ready' : item.configured ? 'offline' : 'not set'}
                                </span>
                            </div>
                        ))}
                    </div>

                    <div className={styles.configGrid}>
                        <div>
                            <span>OpenAI</span>
                            <strong>{aiConfig?.openai.api_key_set ? 'Configured' : 'Not set'}</strong>
                            <small>{aiConfig?.openai.model || 'model unset'} / {formatDate(aiConfig?.openai.updated_at)}</small>
                        </div>
                        <div>
                            <span>DeepSeek</span>
                            <strong>{aiConfig?.deepseek.api_key_set ? 'Configured' : 'Not set'}</strong>
                            <small>{aiConfig?.deepseek.model || 'model unset'} / {formatDate(aiConfig?.deepseek.updated_at)}</small>
                        </div>
                    </div>
                </aside>
            </div>

            <section className={styles.detailsPanel}>
                <div className={styles.tabs}>
                    {[
                        ['design', 'Design Spec'],
                        ['spec', 'Spec Lock'],
                        ['quality', 'Quality'],
                        ['events', 'Events'],
                    ].map(([key, label]) => (
                        <button
                            type="button"
                            key={key}
                            className={activePanel === key ? styles.tabActive : ''}
                            onClick={() => setActivePanel(key as typeof activePanel)}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {activePanel === 'design' && (
                    <pre className={styles.codeBlock}>{designSpec || 'Design spec will appear after a deck is generated.'}</pre>
                )}
                {activePanel === 'spec' && (
                    <pre className={styles.codeBlock}>{JSON.stringify(specLock || {}, null, 2)}</pre>
                )}
                {activePanel === 'quality' && (
                    <div className={styles.qualityList}>
                        <div className={styles.qualitySummary}>
                            <strong>{qualityReport?.status || 'pending'}</strong>
                            <span>{qualityReport?.total_slides || 0} slides</span>
                        </div>
                        {(qualityReport?.issues || []).length === 0 ? (
                            <p className={styles.muted}>No quality issues reported.</p>
                        ) : (
                            qualityReport?.issues.map((issue, index) => (
                                <div key={`${issue.slide_index}-${index}`} className={styles.issueRow}>
                                    <span>{issue.severity}</span>
                                    <strong>P{issue.slide_index}</strong>
                                    <p>{issue.message}</p>
                                </div>
                            ))
                        )}
                    </div>
                )}
                {activePanel === 'events' && (
                    <div className={styles.eventList}>
                        {(taskEvents || []).length === 0 ? (
                            <p className={styles.muted}>No task events loaded.</p>
                        ) : (
                            taskEvents?.map((event, index) => (
                                <div key={`${event.ts}-${index}`} className={styles.eventRow}>
                                    <span>{event.step}</span>
                                    <p>{event.message}</p>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </section>
        </main>
    );
}
