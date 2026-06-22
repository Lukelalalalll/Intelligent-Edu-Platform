import { useState, useEffect } from 'react';
import { NavigateFunction } from 'react-router-dom';
import { marked } from 'marked';
import client from '@/shared/api/client';
import { slidesGenerationApi, type SlidesProviderStatus } from '../../../api/slidesApi';
import type { SlidesSection, SlidesTaskEvent, SlidesProvider } from '../../../types';
import { getStoredSlidesProvider, setStoredSlidesProvider } from '../../../utils/providerStorage';

type QuickProcessFormState = {
    totalPages: number;
    numOfBullets: number;
    wordsEachBullet: number;
    generateTalkingScript: boolean;
    scriptStyle: string;
    presentationTitle: string;
    generateWordDocument: boolean;
};

type QuickProcessOptions = {
    missingContentRedirect?: string;
};

function resolvePreferredProvider(options: SlidesProviderStatus[], stored: SlidesProvider): SlidesProvider {
    const storedHealthy = options.find((item) => item.id === stored && item.available && item.configured);
    if (stored !== 'auto' && storedHealthy) {
        return stored;
    }
    const firstHealthyConfigured = options.find((item) => item.id !== 'auto' && item.available && item.configured);
    return firstHealthyConfigured?.id || 'auto';
}

export function useQuickProcess(navigate: NavigateFunction, options: QuickProcessOptions = {}) {
    const [contentLoading, setContentLoading] = useState(true);
    const [loading, setLoading] = useState(false);
    const [sections, setSections] = useState<SlidesSection[]>([]);
    const [currentFilename, setCurrentFilename] = useState('');
    const [currentDisplayFilename, setCurrentDisplayFilename] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    const [formState, setFormState] = useState<QuickProcessFormState>({
        totalPages: 0,
        numOfBullets: 3,
        wordsEachBullet: 15,
        generateTalkingScript: false,
        scriptStyle: 'academic',
        presentationTitle: '',
        generateWordDocument: true,
    });

    const [results, setResults] = useState<any>(null);
    const [generatedPptSchema, setGeneratedPptSchema] = useState<any>(null);
    const [talkingScriptResult, setTalkingScriptResult] = useState<any>(null);
    const [taskId, setTaskId] = useState('');
    const [taskProgress, setTaskProgress] = useState(0);
    const [taskStep, setTaskStep] = useState('');
    const [taskEvents, setTaskEvents] = useState<SlidesTaskEvent[]>([]);
    const [provider, setProvider] = useState<SlidesProvider>(() => getStoredSlidesProvider());
    const [providerOptions, setProviderOptions] = useState<SlidesProviderStatus[]>([]);
    const [providerHealth, setProviderHealth] = useState('');

    useEffect(() => {
        const fetchContent = async () => {
            const filename = localStorage.getItem('combinedFilename');
            if (!filename) {
                navigate(options.missingContentRedirect || '/slides/ai-theme-config');
                return;
            }
            setCurrentFilename(filename);
            const displayFilename = localStorage.getItem('slidesSourceDisplayName')
                || localStorage.getItem('currentDisplayFilename')
                || filename;
            setCurrentDisplayFilename(displayFilename);

            try {
                const res = await client.get(`/slides/download/${filename}`, { responseType: 'text' });
                const html = marked.parse(res.data) as string;
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = html;
                const headings = tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');

                const parsed: SlidesSection[] = Array.from(headings).map((h) => {
                    let content = '';
                    let curr = h.nextElementSibling;
                    while (curr && !['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(curr.tagName)) {
                        content += curr.outerHTML;
                        curr = curr.nextElementSibling;
                    }
                    return { title: h.textContent ?? '', content };
                });

                setSections(parsed);
                setFormState(prev => ({
                    ...prev,
                    totalPages: parsed.length,
                    presentationTitle: displayFilename.replace(/\.[^/.]+$/, '') + ' - Script',
                }));
            } catch {
                setErrorMsg('Failed to load content');
            } finally {
                setContentLoading(false);
            }
        };
        fetchContent();
    }, [navigate, options.missingContentRedirect]);

    useEffect(() => {
        let cancelled = false;

        const fetchProviders = async () => {
            try {
                const data = await slidesGenerationApi.listProviders();
                if (cancelled) return;
                const nextOptions = data.providers || [];
                setProviderOptions(nextOptions);

                const stored = getStoredSlidesProvider();
                const nextProvider = resolvePreferredProvider(nextOptions, stored);
                setProvider(nextProvider);
                setStoredSlidesProvider(nextProvider);
            } catch (error: any) {
                if (!cancelled) {
                    setProviderHealth(error?.response?.data?.detail || error?.message || 'Failed to load providers');
                }
            }
        };

        fetchProviders();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        const selected = providerOptions.find((item) => item.id === provider);
        if (selected) {
            setProviderHealth(selected.message || '');
        }
    }, [provider, providerOptions]);

    const checkProviderHealth = async (targetProvider?: SlidesProvider) => {
        try {
            const currentProvider = targetProvider || provider;
            const health = await slidesGenerationApi.checkProviderHealth(currentProvider);
            if (health?.success) {
                setProviderHealth(`${currentProvider}: ${health.message || 'ok'}`);
            } else {
                setProviderHealth(`${currentProvider}: ${health?.message || 'unhealthy'}`);
            }
        } catch (error: any) {
            setProviderHealth(`${targetProvider || provider}: ${error?.message || 'health check failed'}`);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (formState.totalPages < sections.length || formState.totalPages > sections.length * 3) {
            setErrorMsg(`Invalid page count. Must be between ${sections.length} and ${sections.length * 3}.`);
            return;
        }

        setLoading(true);
        setErrorMsg('');
        setTaskId('');
        setTaskProgress(0);
        setTaskStep('queued');
        setTaskEvents([]);
        try {
            const selected = providerOptions.find((item) => item.id === provider);
            if (selected && provider !== 'auto' && (!selected.configured || !selected.available)) {
                throw new Error(selected.message || `${selected.label} is not available`);
            }
            const sourceKind = (localStorage.getItem('slidesSourceKind') || '').trim();
            const sourceFilename = localStorage.getItem('slidesSourceFilename') || '';
            const sourceDisplayName = localStorage.getItem('slidesSourceDisplayName')
                || currentDisplayFilename
                || currentFilename;
            const combinedFilename = localStorage.getItem('combinedFilename') || currentFilename;
            const res = await slidesGenerationApi.createTask({
                provider,
                chapterData: sections.map(s => ({ sectionTitle: s.title, text: s.content })),
                total_pages: Number(formState.totalPages),
                num_of_bullets: Number(formState.numOfBullets),
                words_each_bullet: Number(formState.wordsEachBullet),
                presentation_title: (currentDisplayFilename || currentFilename).replace(/\.[^/.]+$/, ''),
                script_style: formState.scriptStyle,
                generate_talking_script: Boolean(formState.generateTalkingScript),
                generate_word_document: Boolean(formState.generateWordDocument),
                source_kind: sourceKind === 'upload' ? 'upload' : 'text',
                source_filename: sourceFilename,
                source_display_name: sourceDisplayName,
                combined_markdown_filename: combinedFilename,
            });
            setTaskId(res.task_id);
            localStorage.setItem('slides_last_task_id', res.task_id);
            setStoredSlidesProvider(provider);

            let pollCount = 0;
            while (pollCount < 240) {
                const status = await slidesGenerationApi.getTask(res.task_id);
                setTaskProgress(status.progress || 0);
                setTaskStep(status.current_step || status.status);
                if (Array.isArray(status.events)) {
                    setTaskEvents(status.events);
                }

                if (status.status === 'completed' && status.result) {
                    const slideResults = status.result.results || [];
                    setResults(slideResults);
                    setTalkingScriptResult(status.result);
                    if (status.result.ppt_schema) {
                        setGeneratedPptSchema(status.result.ppt_schema);
                        localStorage.setItem('ppt_schema', JSON.stringify(status.result.ppt_schema));
                    }
                    if (status.result.deck_id) {
                        localStorage.setItem('slides_last_deck_id', status.result.deck_id);
                    }
                    break;
                }

                if (status.status === 'failed') {
                    throw new Error(status.error || 'Generation failed');
                }

                pollCount += 1;
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }

            if (pollCount >= 240) {
                throw new Error('Generation timeout, please retry.');
            }
        } catch (error: any) {
            setErrorMsg(error?.message || 'Generation failed');
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadScript = async (e: React.MouseEvent, url: string, name: string) => {
        e.preventDefault();
        const res = await client.get(url, { responseType: 'blob' });
        const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
        const link = document.createElement('a');
        link.href = blobUrl;
        link.setAttribute('download', name);
        document.body.appendChild(link);
        link.click();
        link.remove();
    };

    const handleProceed = () => {
        navigate('/slides/generate-workbench', {
            state: {
                taskId,
                deckId: talkingScriptResult?.deck_id,
                result: talkingScriptResult,
                pptSchema: generatedPptSchema,
            },
        });
    };

    return {
        states: {
            loading,
            contentLoading,
            sections,
            formState,
            maxAllowedPages: sections.length * 3,
            totalChapters: sections.length,
            errorMsg,
            results,
            talkingScriptResult,
            taskId,
            taskProgress,
            taskStep,
            taskEvents,
            provider,
            providerOptions,
            providerHealth,
        },
        handlers: {
            setFormState,
            setProvider: (next: SlidesProvider) => {
                setProvider(next);
                setStoredSlidesProvider(next);
            },
            checkProviderHealth,
            handleSubmit,
            handleProceed,
            handleDownloadScript,
        },
    };
}
