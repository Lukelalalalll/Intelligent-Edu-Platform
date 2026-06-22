import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import PptGeneratorShell from '../../components/PptGeneratorShell';
import { slidesGenerationApi, type PresentonOutlineSlide, type SlidesThemeItem } from '../../api/slidesApi';
import {
    clearPresentonWorkspaceDraft,
    loadPresentonOutlineDraft,
    savePresentonOutlineDraft,
    savePresentonWorkspaceDraft,
    type PresentonOutlineDraft,
} from './presentonState';
import { getPresentonStepIndex, getPresentonSteps } from './presentonConstants';
import {
    findPresentonTemplateFamilyByName,
    getDefaultPresentonTemplateFamily,
    PRESENTON_TEMPLATE_FAMILIES,
} from './presentonTemplates';
import styles from './presenton.module.css';

function normalizeSlideForSubmit(slide: PresentonOutlineSlide): Record<string, unknown> {
    return {
        title: slide.title || '',
        objective: slide.objective || '',
        key_points: slide.key_points || [],
        content: slide.content,
    };
}

export default function PresentonOutlinePage() {
    const navigate = useNavigate();
    const [draft, setDraft] = useState<PresentonOutlineDraft | null>(() => loadPresentonOutlineDraft());
    const [numOfBullets, setNumOfBullets] = useState(3);
    const [wordsEachBullet, setWordsEachBullet] = useState(15);
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (!draft) {
            navigate('/slides/presenton', { replace: true });
        }
    }, [draft, navigate]);

    useEffect(() => {
        if (!draft) return;
        savePresentonOutlineDraft(draft);
    }, [draft]);

    useEffect(() => {
        if (!draft) return;
        const matchedTemplate = findPresentonTemplateFamilyByName(
            draft.selectedThemeMeta?.source_group || draft.selectedTheme || '',
        ) || getDefaultPresentonTemplateFamily();

        const alreadySynced = (
            draft.selectedTheme === matchedTemplate.name
            && draft.selectedThemeMeta?.source_group === matchedTemplate.source_group
            && draft.selectedThemeMeta?.base_theme === matchedTemplate.base_theme
        );
        if (alreadySynced) return;

        setDraft((current) => current ? {
            ...current,
            selectedTheme: matchedTemplate.name,
            selectedThemeMeta: matchedTemplate,
        } : current);
    }, [draft]);

    const slides = draft?.slides || [];
    const slideCount = slides.length;
    const title = draft?.source.presentationTitle || 'Generated Presentation';
    const selectedTheme = draft?.selectedTheme || '';
    const selectedThemeMeta = draft?.selectedThemeMeta || null;

    const updateSlideField = (index: number, patch: Partial<PresentonOutlineSlide>) => {
        setDraft((current) => {
            if (!current) return current;
            const nextSlides = current.slides.map((slide, slideIndex) => (
                slideIndex === index ? { ...slide, ...patch } : slide
            ));
            return { ...current, slides: nextSlides };
        });
    };

    const addSlide = () => {
        setDraft((current) => {
            if (!current) return current;
            const nextIndex = current.slides.length + 1;
            return {
                ...current,
                totalPages: nextIndex,
                slides: [
                    ...current.slides,
                    {
                        id: `slide-${nextIndex}`,
                        index: nextIndex,
                        title: `Slide ${nextIndex}`,
                        objective: 'Explain the key idea',
                        key_points: ['Core concept', 'Supporting point', 'Takeaway'],
                        content: `# Slide ${nextIndex}\n\nObjective: Explain the key idea\n\n- Core concept\n- Supporting point\n- Takeaway`,
                    },
                ],
            };
        });
    };

    const removeSlide = (index: number) => {
        setDraft((current) => {
            if (!current || current.slides.length <= 1) return current;
            const nextSlides = current.slides
                .filter((_, slideIndex) => slideIndex !== index)
                .map((slide, slideIndex) => ({
                    ...slide,
                    index: slideIndex + 1,
                    id: `slide-${slideIndex + 1}`,
                }));
            return { ...current, totalPages: nextSlides.length, slides: nextSlides };
        });
    };

    const selectTheme = (theme: SlidesThemeItem) => {
        setDraft((current) => current ? {
            ...current,
            selectedTheme: theme.name,
            selectedThemeMeta: theme,
        } : current);
    };

    const generatePresentation = async () => {
        if (!draft) return;
        setSubmitting(true);
        setErrorMsg('');
        clearPresentonWorkspaceDraft();

        try {
            const response = await slidesGenerationApi.createTask({
                provider: draft.provider,
                content: draft.source.markdownContent,
                outlineSlides: slides.map(normalizeSlideForSubmit),
                total_pages: slideCount || draft.totalPages,
                num_of_bullets: numOfBullets,
                words_each_bullet: wordsEachBullet,
                presentation_title: title,
                theme: selectedThemeMeta?.source_group || selectedTheme || undefined,
                source_kind: draft.source.kind,
                source_filename: draft.source.sourceFilename,
                source_display_name: draft.source.sourceDisplayName,
                combined_markdown_filename: draft.source.combinedFilename,
            });

            savePresentonWorkspaceDraft({
                source: draft.source,
                provider: draft.provider,
                taskId: response.task_id,
                status: response.status,
                currentStep: 'queued',
                progress: 0,
                error: '',
                result: null,
                outlineSlides: slides,
                selectedTheme,
                selectedThemeMeta,
            });
            navigate('/slides/presenton/presentation');
        } catch (error: any) {
            setErrorMsg(error?.response?.data?.detail || error?.message || 'Failed to start presentation generation');
        } finally {
            setSubmitting(false);
        }
    };

    const visibleThemes = useMemo(() => PRESENTON_TEMPLATE_FAMILIES, []);

    if (!draft) {
        return null;
    }

    return (
        <PptGeneratorShell
            currentStep={getPresentonStepIndex('outline', draft.source.kind)}
            steps={getPresentonSteps(draft.source.kind)}
            onStepSelect={(index) => {
                if (index === 0) navigate('/slides/presenton');
                if (draft.source.kind === 'upload' && index === 1) navigate('/slides/presenton/documents-preview');
            }}
            className="container"
            contentClassName={styles.page}
            toolbar={(
                <div className={styles.toolbar}>
                    <div className={styles.toolbarTitle}>
                        <strong>Outline</strong>
                        <span>Edit the outline, choose a template, then move into presentation generation.</span>
                    </div>
                    <div className={styles.toolbarActions}>
                        <button
                            type="button"
                            className={styles.buttonGhost}
                            onClick={() => navigate(draft.source.kind === 'upload' ? '/slides/presenton/documents-preview' : '/slides/presenton')}
                        >
                            <i className="fas fa-arrow-left" aria-hidden="true" /> Back
                        </button>
                    </div>
                </div>
            )}
        >
            <div className={styles.entryGrid}>
                <section className={styles.panel}>
                    <div className={styles.cardHeader}>
                        <h2>{title}</h2>
                        <p>{slideCount} outline slides ready for final cleanup before generation.</p>
                    </div>

                    <div className={styles.outlineList}>
                        {slides.map((slide, index) => (
                            <article key={slide.id || `slide-${index + 1}`} className={styles.outlineCard}>
                                <div className={styles.outlineHead}>
                                    <span className={styles.outlineIndex}>Slide {index + 1}</span>
                                    <button
                                        type="button"
                                        className={styles.miniButton}
                                        onClick={() => removeSlide(index)}
                                        disabled={slides.length <= 1 || submitting}
                                    >
                                        <i className="fas fa-trash" aria-hidden="true" /> Remove
                                    </button>
                                </div>
                                <div className={styles.fieldInline}>
                                    <label>
                                        Title
                                        <input
                                            type="text"
                                            value={slide.title || ''}
                                            onChange={(event) => updateSlideField(index, { title: event.target.value })}
                                            disabled={submitting}
                                        />
                                    </label>
                                    <label>
                                        Objective
                                        <input
                                            type="text"
                                            value={slide.objective || ''}
                                            onChange={(event) => updateSlideField(index, { objective: event.target.value })}
                                            disabled={submitting}
                                        />
                                    </label>
                                </div>
                                <div className={styles.editorBox}>
                                    <textarea
                                        value={slide.content}
                                        onChange={(event) => updateSlideField(index, { content: event.target.value })}
                                        disabled={submitting}
                                    />
                                </div>
                            </article>
                        ))}
                    </div>

                    <div className={styles.outlineActions}>
                        <button type="button" className={styles.buttonSecondary} onClick={addSlide} disabled={submitting}>
                            <i className="fas fa-plus" aria-hidden="true" /> Add Slide
                        </button>
                    </div>
                </section>

                <aside className={styles.rightCard}>
                    <div className={styles.cardHeader}>
                        <h3>Template Selection</h3>
                        <p>Choose the Presenton template family for this deck before generation starts.</p>
                    </div>

                    <div className={styles.themeGrid}>
                        {visibleThemes.map((theme) => {
                            const active = selectedTheme === theme.name;
                            return (
                                <button
                                    key={theme.name}
                                    type="button"
                                    className={`${styles.themeCard} ${active ? styles.themeCardActive : ''}`}
                                    onClick={() => selectTheme(theme)}
                                >
                                    <div className={styles.themeCardHead}>
                                        <strong>{theme.name}</strong>
                                        {theme.layout_count ? (
                                            <span className={styles.themeBadge}>{theme.layout_count} layouts</span>
                                        ) : null}
                                    </div>
                                    <span>{theme.description || 'Template option'}</span>
                                    <em>{theme.base_theme || theme.preview_theme || theme.name}</em>
                                </button>
                            );
                        })}
                    </div>

                    <div className={styles.cardHeader} style={{ marginTop: 18 }}>
                        <h3>Generation Settings</h3>
                        <p>The presentation page will take over once generation starts.</p>
                    </div>
                    <div className={styles.fieldInline}>
                        <label>
                            Bullets per Slide
                            <input
                                type="number"
                                min={1}
                                max={6}
                                value={numOfBullets}
                                onChange={(event) => setNumOfBullets(Number(event.target.value) || 3)}
                            />
                        </label>
                        <label>
                            Words per Bullet
                            <input
                                type="number"
                                min={8}
                                max={80}
                                value={wordsEachBullet}
                                onChange={(event) => setWordsEachBullet(Number(event.target.value) || 15)}
                            />
                        </label>
                    </div>

                    {errorMsg && <div className={styles.error}>{errorMsg}</div>}

                    <div className={styles.summaryActions}>
                        <button type="button" className={styles.summaryAction} onClick={generatePresentation} disabled={submitting}>
                            <i className={`fas ${submitting ? 'fa-spinner fa-spin' : 'fa-play'}`} aria-hidden="true" /> Generate Presentation
                        </button>
                    </div>

                    <div className={styles.statusCard}>
                        <div className={styles.statusRow}>
                            <strong>Selected template</strong>
                            <span>{selectedTheme || 'Auto'}</span>
                        </div>
                        <div className={styles.statusRow}>
                            <strong>Base theme</strong>
                            <span>{selectedThemeMeta?.base_theme || '-'}</span>
                        </div>
                        <div className={styles.statusRow}>
                            <strong>Next step</strong>
                            <span>Presentation</span>
                        </div>
                    </div>
                </aside>
            </div>
        </PptGeneratorShell>
    );
}
