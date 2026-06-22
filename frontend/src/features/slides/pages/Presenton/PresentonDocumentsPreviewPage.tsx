import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import PptGeneratorShell from '../../components/PptGeneratorShell';
import { slidesGenerationApi, type PresentonOutlineSlide } from '../../api/slidesApi';
import {
    loadPresentonSourceDraft,
    savePresentonOutlineDraft,
    savePresentonSourceDraft,
    type PresentonSourceDraft,
} from './presentonState';
import { getPresentonStepIndex, getPresentonSteps } from './presentonConstants';
import styles from './presenton.module.css';

export default function PresentonDocumentsPreviewPage() {
    const navigate = useNavigate();
    const [draft, setDraft] = useState<PresentonSourceDraft | null>(() => loadPresentonSourceDraft());
    const [markdownContent, setMarkdownContent] = useState('');
    const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
    const [loadingContent, setLoadingContent] = useState(true);
    const [loadingOutline, setLoadingOutline] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [totalPages, setTotalPages] = useState(8);

    useEffect(() => {
        if (!draft) {
            navigate('/slides/presenton', { replace: true });
        }
    }, [draft, navigate]);

    useEffect(() => {
        if (!draft) return;
        const headerCount = draft.source.headerCount || draft.headers?.length || 0;
        setTotalPages((prev) => (prev > 0 ? prev : Math.max(headerCount, 8)));
        setSelectedIndices(draft.selectedIndices?.length ? draft.selectedIndices : (draft.headers || []).map((item) => item.index));
    }, [draft]);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            if (!draft?.source?.sourceFilename) {
                setLoadingContent(false);
                return;
            }

            try {
                let nextMarkdown = draft.source.markdownContent;
                let combinedFilename = draft.source.combinedFilename;

                if (!combinedFilename) {
                    combinedFilename = draft.source.sourceFilename.toLowerCase().endsWith('.pdf')
                        ? draft.source.sourceFilename.replace(/\.pdf$/i, '.md')
                        : draft.source.sourceFilename;
                }

                if (!nextMarkdown && combinedFilename) {
                    try {
                        nextMarkdown = await slidesGenerationApi.downloadMarkdown(combinedFilename);
                    } catch (error) {
                        if (draft.source.sourceFilename.toLowerCase().endsWith('.md')) {
                            nextMarkdown = await slidesGenerationApi.downloadSourceText(draft.source.sourceFilename);
                            combinedFilename = draft.source.sourceFilename;
                        } else {
                            throw error;
                        }
                    }
                }

                if (!cancelled) {
                    setMarkdownContent(nextMarkdown);
                    setDraft((current) => {
                        if (!current) return current;
                        return {
                            ...current,
                            source: {
                                ...current.source,
                                combinedFilename,
                                markdownContent: nextMarkdown,
                            },
                        };
                    });
                }
            } catch (error: any) {
                if (!cancelled) {
                    setErrorMsg(error?.response?.data?.detail || error?.message || 'Failed to load parsed document preview');
                }
            } finally {
                if (!cancelled) {
                    setLoadingContent(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [draft?.source?.combinedFilename, draft?.source?.markdownContent, draft?.source?.sourceFilename]);

    useEffect(() => {
        if (!draft) return;
        savePresentonSourceDraft({
            ...draft,
            selectedIndices,
            source: {
                ...draft.source,
                markdownContent,
            },
        });
    }, [draft, markdownContent, selectedIndices]);

    const sectionCount = draft?.headers?.length || 0;

    const visibleSections = useMemo(() => {
        if (!draft?.headers?.length) return [];
        return draft.headers.map((header) => ({
            ...header,
            selected: selectedIndices.includes(header.index),
        }));
    }, [draft?.headers, selectedIndices]);

    const toggleIndex = (index: number) => {
        setSelectedIndices((current) => (
            current.includes(index)
                ? current.filter((item) => item !== index)
                : [...current, index].sort((a, b) => a - b)
        ));
    };

    const generateOutline = async () => {
        if (!draft) return;
        setLoadingOutline(true);
        setErrorMsg('');

        try {
            let activeMarkdown = markdownContent;
            let combinedFilename = draft.source.combinedFilename;

            if (sectionCount > 0 && selectedIndices.length > 0 && selectedIndices.length !== sectionCount) {
                const client = (await import('@/shared/api/client')).default;
                const response = await client.post('/slides/combine', {
                    filename: draft.source.sourceFilename,
                    selected_indices: selectedIndices,
                    use_llm: draft.useLLM || false,
                    header_llm_provider: draft.headerLlmProvider || 'local_ollama',
                });
                combinedFilename = response.data.filename || combinedFilename;
                activeMarkdown = await slidesGenerationApi.downloadMarkdown(combinedFilename);
            } else if (!activeMarkdown && combinedFilename) {
                try {
                    activeMarkdown = await slidesGenerationApi.downloadMarkdown(combinedFilename);
                } catch (error) {
                    if (draft.source.sourceFilename.toLowerCase().endsWith('.md')) {
                        activeMarkdown = await slidesGenerationApi.downloadSourceText(draft.source.sourceFilename);
                        combinedFilename = draft.source.sourceFilename;
                    } else {
                        throw error;
                    }
                }
            }

            const outline = await slidesGenerationApi.generatePresentonOutline({
                provider: draft.provider,
                content: activeMarkdown,
                total_pages: Math.max(1, totalPages || 8),
                presentation_title: draft.source.presentationTitle,
                source_kind: draft.source.kind,
                source_filename: draft.source.sourceFilename,
                source_display_name: draft.source.sourceDisplayName,
                combined_markdown_filename: combinedFilename,
            });

            const slides: PresentonOutlineSlide[] = outline.slides || [];
            savePresentonOutlineDraft({
                source: {
                    ...draft.source,
                    combinedFilename,
                    markdownContent: activeMarkdown,
                },
                provider: draft.provider,
                providerResolved: outline.provider_resolved,
                providerSource: outline.provider_source,
                providerModel: outline.provider_model,
                totalPages: Math.max(1, totalPages || 8),
                slides,
                selectedTheme: undefined,
                selectedThemeMeta: null,
            });
            navigate('/slides/presenton/outline');
        } catch (error: any) {
            setErrorMsg(error?.response?.data?.detail || error?.message || 'Failed to generate outline');
        } finally {
            setLoadingOutline(false);
        }
    };

    if (!draft) {
        return null;
    }

    return (
        <PptGeneratorShell
            currentStep={getPresentonStepIndex('documents-preview', draft.source.kind)}
            steps={getPresentonSteps(draft.source.kind)}
            onStepSelect={(index) => {
                if (index === 0) navigate('/slides/presenton');
            }}
            className="container"
            contentClassName={styles.page}
            toolbar={(
                <div className={styles.toolbar}>
                    <div className={styles.toolbarTitle}>
                        <strong>Documents Preview</strong>
                        <span>Review the parsed source before Presenton generates the outline.</span>
                    </div>
                    <div className={styles.toolbarActions}>
                        <button type="button" className={styles.buttonGhost} onClick={() => navigate('/slides/presenton')}>
                            <i className="fas fa-arrow-left" aria-hidden="true" /> Back to Upload
                        </button>
                    </div>
                </div>
            )}
        >
            <div className={styles.entryGrid}>
                <section className={styles.panel}>
                    <div className={styles.cardHeader}>
                        <h2>{draft.source.sourceDisplayName || draft.source.presentationTitle}</h2>
                        <p>Parsed markdown preview from the uploaded source document.</p>
                    </div>

                    <div className={styles.fieldInline}>
                        <label>
                            Outline Slides
                            <input
                                type="number"
                                min={1}
                                max={40}
                                value={totalPages}
                                onChange={(event) => setTotalPages(Number(event.target.value) || 1)}
                            />
                        </label>
                        <label>
                            Selected Sections
                            <input type="text" readOnly value={sectionCount ? `${selectedIndices.length} / ${sectionCount}` : 'Full source'} />
                        </label>
                    </div>

                    {sectionCount > 0 && (
                        <div className={styles.sectionChecklist}>
                            {visibleSections.map((section) => (
                                <label key={section.index} className={styles.sectionCheckItem}>
                                    <input
                                        type="checkbox"
                                        checked={section.selected}
                                        onChange={() => toggleIndex(section.index)}
                                    />
                                    <span>
                                        <strong>Section {section.index}</strong>
                                        <em>{section.text}</em>
                                    </span>
                                </label>
                            ))}
                        </div>
                    )}

                    <div className={styles.editorBox}>
                        <textarea
                            value={loadingContent ? 'Loading parsed document...' : markdownContent}
                            onChange={(event) => setMarkdownContent(event.target.value)}
                            disabled={loadingContent}
                        />
                    </div>
                </section>

                <aside className={styles.summaryCard}>
                    <div className={styles.summaryHeader}>
                        <h3>Ready for Outline</h3>
                        <p>Presenton will use the edited markdown below to generate the outline in the next step.</p>
                    </div>
                    <div className={styles.summaryGrid}>
                        <strong>
                            AI Runtime
                            <span>{draft.aiSummary || 'Using project AI config'}</span>
                        </strong>
                        <strong>
                            Source Mode
                            <span>{draft.source.kind === 'upload' ? 'Uploaded document' : 'Prompt only'}</span>
                        </strong>
                    </div>
                    <div className={styles.note}>
                        {sectionCount > 0
                            ? 'You can narrow the source to specific sections before outline generation.'
                            : 'No section split was detected, so the full parsed source will be sent to outline generation.'}
                    </div>
                    {errorMsg && <div className={styles.error}>{errorMsg}</div>}
                    <div className={styles.summaryActions}>
                        <button
                            type="button"
                            className={styles.summaryAction}
                            onClick={() => {
                                void generateOutline();
                            }}
                            disabled={loadingOutline || loadingContent || !markdownContent.trim() || (sectionCount > 0 && selectedIndices.length === 0)}
                        >
                            <i className={`fas ${loadingOutline ? 'fa-spinner fa-spin' : 'fa-sitemap'}`} aria-hidden="true" /> Generate Outline
                        </button>
                    </div>
                    <div className={styles.statusCard}>
                        <div className={styles.statusRow}>
                            <strong>Parsed sections</strong>
                            <span>{sectionCount || 'N/A'}</span>
                        </div>
                        <div className={styles.statusRow}>
                            <strong>Markdown source</strong>
                            <span>{markdownContent.trim() ? 'Ready' : 'Empty'}</span>
                        </div>
                        <div className={styles.statusRow}>
                            <strong>Flow</strong>
                            <span>Documents Preview &gt; Outline</span>
                        </div>
                    </div>
                </aside>
            </div>
        </PptGeneratorShell>
    );
}
