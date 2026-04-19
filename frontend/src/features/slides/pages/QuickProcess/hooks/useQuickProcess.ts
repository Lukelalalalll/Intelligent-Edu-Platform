import { useState, useEffect } from 'react';
import { NavigateFunction } from 'react-router-dom';
import { marked } from 'marked';
import client from '@/shared/api/client';
import { slidesGenerationApi } from '../../../api/slidesApi';
import type { SlidesSection, SlidesTaskEvent, SlidesProvider } from '../../../types';

type QuickProcessFormState = {
    totalPages: number;
    numOfBullets: number;
    wordsEachBullet: number;
    generateTalkingScript: boolean;
    scriptStyle: string;
    presentationTitle: string;
    generateWordDocument: boolean;
};

export function useQuickProcess(navigate: NavigateFunction) {
    const [contentLoading, setContentLoading] = useState(true);
    const [loading, setLoading] = useState(false);
    const [sections, setSections] = useState<SlidesSection[]>([]);
    const [currentFilename, setCurrentFilename] = useState('');
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
    const [provider, setProvider] = useState<SlidesProvider>('local_ollama');
    const [providerHealth, setProviderHealth] = useState('');

    useEffect(() => {
        const fetchContent = async () => {
            const filename = localStorage.getItem('combinedFilename');
            if (!filename) { navigate('/slides/md-processor'); return; }
            setCurrentFilename(filename);

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
                    presentationTitle: filename.replace(/\.[^/.]+$/, '') + ' - Script',
                }));
            } catch {
                setErrorMsg('Failed to load content');
            } finally {
                setContentLoading(false);
            }
        };
        fetchContent();
    }, [navigate]);

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
            const res = await slidesGenerationApi.createTask({
                provider,
                chapterData: sections.map(s => ({ sectionTitle: s.title, text: s.content })),
                total_pages: Number(formState.totalPages),
                num_of_bullets: Number(formState.numOfBullets),
                words_each_bullet: Number(formState.wordsEachBullet),
                presentation_title: currentFilename.replace(/\.[^/.]+$/, ''),
                script_style: formState.scriptStyle,
                generate_talking_script: Boolean(formState.generateTalkingScript),
                generate_word_document: Boolean(formState.generateWordDocument),
            });
            setTaskId(res.task_id);

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
        navigate('/slides/ppt-template', { state: { pptSchema: generatedPptSchema } });
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
            providerHealth,
        },
        handlers: {
            setFormState,
            setProvider,
            checkProviderHealth,
            handleSubmit,
            handleProceed,
            handleDownloadScript,
        },
    };
}
