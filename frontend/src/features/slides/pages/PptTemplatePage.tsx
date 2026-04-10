import React, { useMemo, useState } from 'react';
import styles from '../styles/pptTemplate.module.css';
import type { DeliveryArtifactType } from '../../../api/slidesDeliveryApi';

type ThemeItem = {
    name: string;
    description?: string;
    base_theme?: string;
    preview_theme?: string;
    source?: string;
    source_group?: string;
    layout_count?: number;
};

export default function PptTemplate({
    states, handlers
}) {
    const {
        themes,
        selectedTheme,
        pptSchema,
        currentSlideIndex,
        layouts,
        isGenerating,
        errorMsg,
        deliveryJobId,
        deliveryActiveTab,
        deliveryLoading,
        deliveryError,
        deliveryArtifacts,
    } = states;
    const {
        selectTheme,
        setCurrentSlideIndex,
        selectLayout,
        applyLayoutToAll,
        updateCurrentSlide,
        updateCurrentSlideBullet,
        addCurrentSlideBullet,
        removeCurrentSlideBullet,
        reorderCurrentSlideBullets,
        generatePpt,
        generateDeliveryPack,
        setDeliveryActiveTab,
    } = handlers;

    const [themeKeyword, setThemeKeyword] = useState('');
    const [dragBulletIndex, setDragBulletIndex] = useState<number | null>(null);
    const currentSlide = pptSchema?.slides[currentSlideIndex];
    const configuredCount = pptSchema?.slides.filter(s => s.layout?.name).length || 0;
    const totalSlides = pptSchema?.slides.length || 0;
    const normalizedThemes: ThemeItem[] = useMemo(() => {
        if (!Array.isArray(themes)) return [];
        return themes.map((theme: any) => ({
            name: theme?.name || 'Unnamed Theme',
            description: theme?.description || 'Professional theme',
            base_theme: theme?.base_theme || theme?.name,
            preview_theme: theme?.preview_theme || theme?.base_theme || theme?.name,
            source: theme?.source,
            source_group: theme?.source_group,
            layout_count: Number.isFinite(theme?.layout_count) ? theme.layout_count : undefined,
        }));
    }, [themes]);

    const visibleThemes = useMemo(() => {
        const q = themeKeyword.trim().toLowerCase();
        if (!q) return normalizedThemes;
        return normalizedThemes.filter((theme) => {
            const haystack = `${theme.name} ${theme.description || ''} ${theme.base_theme || ''}`.toLowerCase();
            return haystack.includes(q);
        });
    }, [normalizedThemes, themeKeyword]);

    const selectedThemeMeta = useMemo(
        () => normalizedThemes.find((t) => t.name === selectedTheme) || null,
        [normalizedThemes, selectedTheme]
    );

    const groupedThemes = useMemo(() => {
        const groups: Record<string, ThemeItem[]> = {};
        visibleThemes.forEach((theme) => {
            const key = theme.source_group || theme.base_theme || 'default';
            if (!groups[key]) groups[key] = [];
            groups[key].push(theme);
        });
        return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
    }, [visibleThemes]);

    const getThemeSeed = (value: string) => {
        let hash = 0;
        for (let i = 0; i < value.length; i += 1) {
            hash = (hash << 5) - hash + value.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    };

    const getThemeGradient = (theme: ThemeItem) => {
        const seed = getThemeSeed(theme.name || 'theme');
        const h1 = seed % 360;
        const h2 = (h1 + 36 + (seed % 73)) % 360;
        return `linear-gradient(135deg, hsl(${h1} 70% 55%), hsl(${h2} 72% 38%))`;
    };

    const getLayoutPreviewBlocks = (layout: any) => {
        const n = Array.isArray(layout?.placeholders) ? layout.placeholders.length : 0;
        return Math.max(3, Math.min(8, n || 4));
    };

    const deliveryTabs: Array<{ key: DeliveryArtifactType; label: string; icon: string }> = [
        { key: 'agenda', label: 'Agenda', icon: 'fa-list-ol' },
        { key: 'speaker_notes', label: 'Speaker Notes', icon: 'fa-microphone' },
        { key: 'in_class_questions', label: 'In-class Questions', icon: 'fa-comments' },
        { key: 'homework_suggestions', label: 'Homework', icon: 'fa-pencil-alt' },
    ];

    const activeArtifact = deliveryArtifacts?.[deliveryActiveTab];

    const formatDeliveryItem = (item, tab: DeliveryArtifactType): { lines: string[]; copyText: string } => {
        if (typeof item === 'string') {
            return { lines: [item], copyText: item };
        }

        if (!item || typeof item !== 'object') {
            const fallback = String(item ?? '');
            return { lines: [fallback], copyText: fallback };
        }

        if (tab === 'speaker_notes') {
            const lines = [
                `Slide ${item.slide ?? '-'}`,
                `Title: ${item.title ?? '-'}`,
                `Note: ${item.note ?? '-'}`,
            ];
            return { lines, copyText: lines.join('\n') };
        }

        if (tab === 'in_class_questions') {
            const lines = [
                `Slide ${item.slide ?? '-'}`,
                `Question: ${item.question ?? '-'}`,
                `Expected Depth: ${item.expected_depth ?? '-'}`,
            ];
            return { lines, copyText: lines.join('\n') };
        }

        if (tab === 'homework_suggestions') {
            const lines = [
                `Task ID: ${item.task_id ?? '-'}`,
                `Prompt: ${item.prompt ?? '-'}`,
                `Estimated Minutes: ${item.estimated_minutes ?? '-'}`,
            ];
            return { lines, copyText: lines.join('\n') };
        }

        const genericLines = Object.entries(item).map(([k, v]) => `${k}: ${String(v ?? '-')}`);
        return { lines: genericLines, copyText: genericLines.join('\n') };
    };

    const renderDeliveryItem = (item, idx) => {
        const { lines, copyText } = formatDeliveryItem(item, deliveryActiveTab);
        return (
            <div key={idx} className={styles.deliveryItem}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                    {lines.map((line, lineIdx) => (
                        <p key={`${idx}-${lineIdx}`} style={{ margin: 0 }}>{line}</p>
                    ))}
                </div>
                <button
                    type="button"
                    className={styles.copyBtn}
                    onClick={() => navigator.clipboard.writeText(copyText)}
                >
                    <i className="far fa-copy"></i> Copy
                </button>
            </div>
        );
    };

    return (
        <div className={styles.presentonShell}>
            <aside className={styles.presentonSidebar}>
                <button className={styles.sideIconBtn}><i className="fas fa-th-large"></i></button>
                <button className={styles.sideIconBtn}><i className="fas fa-list"></i></button>
                <div className={styles.sideDivider}></div>
                <div className={styles.sideMeta}>Slides: {totalSlides}</div>
                <div className={styles.sideMeta}>Theme: {selectedTheme || '-'}</div>
            </aside>

            <main className={styles.presentonMain}>
                <div className={styles.presentonTopNav}>
                    <button className={styles.stepBtn}>Outline &amp; Content</button>
                    <button className={`${styles.stepBtn} ${styles.stepBtnActive}`}>Select Template</button>
                </div>

            {errorMsg && (
                <div className="alert alert-warning" role="alert">
                    {errorMsg}
                </div>
            )}

            {/* Template Library */}
            <div className={`card ${styles.sectionCard} ${styles.cardStep1}`}>
                <div className={styles.cardHeader}>
                    <div className={styles.cardIcon}><i className="fas fa-paint-brush"></i></div>
                    <h2 className={styles.sectionTitle}>In Built Templates</h2>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                    <input
                        type="text"
                        className="form-control"
                        placeholder="Search themes (e.g., dark, academic, executive)"
                        value={themeKeyword}
                        onChange={(e) => setThemeKeyword(e.target.value)}
                    />
                </div>
                <div className={styles.themeGrid}>
                    {groupedThemes.map(([groupName, groupThemes]) => {
                        const sample = groupThemes[0];
                        const selected = selectedThemeMeta?.source_group === groupName || selectedTheme === sample?.name;
                        return (
                        <div
                            key={groupName}
                            className={`${styles.themeCard} ${selected ? styles.selected : ''}`}
                            onClick={() => selectTheme(sample.name)}
                        >
                            <div className={styles.previewBox}>
                                <div className={styles.themePreviewCard} style={{ background: getThemeGradient(sample) }}>
                                    <span className={styles.themePreviewBadge}>
                                        Layouts {sample.layout_count ?? (groupThemes.reduce((s, t) => s + (t.layout_count || 0), 0) || 12)}
                                    </span>
                                    <div className={styles.themePreviewRow}>
                                        <div className={styles.themePreviewTile}></div>
                                        <div className={styles.themePreviewTile}></div>
                                        <div className={styles.themePreviewTile}></div>
                                        <div className={styles.themePreviewTile}></div>
                                    </div>
                                    <div className={styles.themePreviewLabel}>{groupName.replace(/-/g, ' ')}</div>
                                </div>
                            </div>
                            <div className={styles.cardInfo}>
                                <h5 className={styles.themeName}>Neo {groupName.replace(/^neo\s*/i, '').replace(/(^|\s)\S/g, (m) => m.toUpperCase())}</h5>
                                <p className={styles.themeDesc}>{sample.description || 'Professional theme'}</p>
                                <p className={styles.themeDesc} style={{ marginTop: '0.35rem', opacity: 0.8 }}>
                                    Base: {sample.base_theme || sample.name}
                                </p>
                                {!!sample.source_group && (
                                    <p className={styles.themeDesc} style={{ marginTop: '0.25rem', opacity: 0.75 }}>
                                        Family: {sample.source_group}
                                    </p>
                                )}
                            </div>
                        </div>
                    );})}
                </div>
                {normalizedThemes.length === 0 && (
                    <div className={`alert alert-info ${styles.infoBlock}`} role="alert">
                        No PPT themes were found. Please place template files (.pptx) in backend/static/ppt_templates and refresh.
                    </div>
                )}
                {normalizedThemes.length > 0 && visibleThemes.length === 0 && (
                    <div className={`alert alert-info ${styles.infoBlock}`} role="alert">
                        No themes match your search keyword.
                    </div>
                )}
            </div>

            <div className={styles.stickySelectWrap}>
                <button
                    type="button"
                    className={styles.selectTemplateBtn}
                    onClick={() => {
                        const el = document.getElementById('layout-editor');
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    disabled={!selectedTheme}
                >
                    <i className="fas fa-magic"></i> Select a Template
                </button>
            </div>

            {/* Step 2: Layouts */}
            {selectedTheme && (
                <div id="layout-editor" className={`card ${styles.sectionCard} ${styles.cardStep2}`}>
                    <div className={styles.cardHeader}>
                        <div className={styles.cardIcon}><i className="fas fa-th-large"></i></div>
                        <h2 className={styles.sectionTitle}>2. Customize Slide Layouts</h2>
                    </div>

                    <div className={styles.progressWrapper}>
                        <span className={styles.progressText}>Progress: <strong>{configuredCount} / {totalSlides}</strong> Configured</span>
                        <div className={styles.customProgress}>
                            <div className={styles.customProgressBar} style={{ width: `${(configuredCount / totalSlides) * 100}%` }}></div>
                        </div>
                    </div>

                    <div className={styles.customTabContent}>
                        <div className={styles.editorShell}>
                            <aside className={styles.slideRail}>
                                <h5 className={styles.editorTitle}>Slides</h5>
                                <div className={styles.slideRailList}>
                                    {pptSchema.slides.map((slide, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            className={`${styles.slideThumbBtn} ${currentSlideIndex === idx ? styles.slideThumbBtnActive : ''}`}
                                            onClick={() => setCurrentSlideIndex(idx)}
                                        >
                                            <span className={styles.slideThumbIndex}>{idx + 1}</span>
                                            <span className={styles.slideThumbText}>{slide.title || `Slide ${idx + 1}`}</span>
                                            <i className={`fas ${slide.layout ? 'fa-check-circle' : 'fa-circle'}`}></i>
                                        </button>
                                    ))}
                                </div>
                            </aside>

                            <section className={styles.slideStage}>
                                <div className={styles.slideStageHeader}>
                                    <h5 className={styles.editorTitle}>Live Preview</h5>
                                    <span className={styles.metaTag}>Layout: {currentSlide?.layout?.name || 'None'}</span>
                                </div>
                                <div className={styles.slideMock}>
                                    <div className={styles.slideMockTitle}>{currentSlide?.title || 'Untitled Slide'}</div>
                                    <ul className={styles.slideMockBullets}>
                                        {(Array.isArray(currentSlide?.content) ? currentSlide.content : []).slice(0, 8).map((item, idx) => (
                                            <li key={`${idx}-${item}`}>{item}</li>
                                        ))}
                                    </ul>
                                </div>

                                <h6 className={styles.editorSubTitle}>Pick Layout</h6>
                                <div className={styles.layoutGrid}>
                                    {layouts.map((layout, idx) => (
                                        <div
                                            key={`${layout.name}-${idx}`}
                                            className={`${styles.layoutCard} ${currentSlide?.layout?.name === layout.name ? styles.selected : ''}`}
                                            onClick={() => selectLayout(layout)}
                                        >
                                            <div className={styles.previewBox}>
                                                <div className={styles.layoutSketch} style={{ background: getThemeGradient({ name: layout.name }) }}>
                                                    {Array.from({ length: getLayoutPreviewBlocks(layout) }).map((_, bIdx) => (
                                                        <span key={bIdx} className={styles.layoutSketchBlock}></span>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className={styles.cardInfo}><h6 className={styles.layoutName}>{layout.name}</h6></div>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <aside className={styles.editorPanel}>
                                <h5 className={styles.editorTitle}>Inspector</h5>
                                <div className={styles.inspectorBlock}>
                                    <p className={styles.inspectorLabel}>Theme Family</p>
                                    <p className={styles.inspectorValue}>{selectedThemeMeta?.source_group || 'local'} / {selectedThemeMeta?.base_theme || selectedTheme}</p>
                                </div>
                                <div className={styles.inspectorBlock}>
                                    <label className={styles.inspectorLabel}>Slide Title</label>
                                    <input
                                        className="form-control"
                                        value={currentSlide?.title || ''}
                                        onChange={(e) => updateCurrentSlide({ title: e.target.value })}
                                        placeholder="Edit slide title"
                                    />
                                </div>
                                <div className={styles.inspectorBlock}>
                                    <div className={styles.bulletHeaderRow}>
                                        <label className={styles.inspectorLabel}>Bullet Points</label>
                                        <button type="button" className={styles.smallActionBtn} onClick={addCurrentSlideBullet}>
                                            <i className="fas fa-plus"></i> Add
                                        </button>
                                    </div>
                                    <div className={styles.bulletList}>
                                        {(Array.isArray(currentSlide?.content) ? currentSlide.content : []).map((bullet, idx) => (
                                            <div
                                                key={`${idx}-${bullet}`}
                                                className={styles.bulletItem}
                                                draggable
                                                onDragStart={() => setDragBulletIndex(idx)}
                                                onDragOver={(e) => e.preventDefault()}
                                                onDrop={() => {
                                                    if (dragBulletIndex !== null && dragBulletIndex !== idx) {
                                                        reorderCurrentSlideBullets(dragBulletIndex, idx);
                                                    }
                                                    setDragBulletIndex(null);
                                                }}
                                                onDragEnd={() => setDragBulletIndex(null)}
                                            >
                                                <span className={styles.dragHandle}><i className="fas fa-grip-vertical"></i></span>
                                                <input
                                                    className={`form-control ${styles.bulletInput}`}
                                                    value={bullet}
                                                    onChange={(e) => updateCurrentSlideBullet(idx, e.target.value)}
                                                />
                                                <button
                                                    type="button"
                                                    className={styles.deleteBulletBtn}
                                                    onClick={() => removeCurrentSlideBullet(idx)}
                                                >
                                                    <i className="fas fa-trash"></i>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <button type="button" className={styles.btnApplyAll} onClick={applyLayoutToAll}>
                                    <i className="fas fa-clone"></i> Apply Layout To All
                                </button>
                            </aside>
                        </div>

                        {layouts.length === 0 && (
                            <div className={`alert alert-info ${styles.infoBlock}`} role="alert" style={{ marginTop: '1rem' }}>
                                No available layouts were found for this theme.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Step 3: Action */}
            <div className={`card ${styles.sectionCard} ${styles.cardStep3}`}>
                <div className={styles.actionGrid}>
                    <div className={styles.summaryBox}>
                        <h5 className={styles.summaryTitle}>Configuration Summary</h5>
                        <div className={styles.statItem}><span>Theme</span><strong>{selectedTheme || 'Not selected'}</strong></div>
                        <div className={styles.statItem}><span>Status</span><strong>{configuredCount === totalSlides ? 'Ready to Generate' : `${totalSlides - configuredCount} slides remaining`}</strong></div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <div className={styles.actionButtons}>
                            <button
                                type="button"
                                className={`btn btn-primary ${styles.generateBtn}`}
                                onClick={generatePpt}
                                disabled={configuredCount !== totalSlides}
                                title={configuredCount !== totalSlides ? `Configure all slides first (${totalSlides - configuredCount} remaining)` : 'Generate PowerPoint'}
                            >
                                <i className="fas fa-file-powerpoint"></i> Generate PPT
                            </button>
                            <button
                                type="button"
                                className={styles.deliveryBtn}
                                onClick={generateDeliveryPack}
                                disabled={configuredCount !== totalSlides || deliveryLoading}
                            >
                                {deliveryLoading
                                    ? <><i className="fas fa-spinner fa-spin"></i> Building...</>
                                    : <><i className="fas fa-box-open"></i> Generate Delivery Pack</>}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {(deliveryJobId || deliveryError) && (
                <div className={`card ${styles.sectionCard} ${styles.deliveryCard}`}>
                    <div className={styles.cardHeader}>
                        <div className={styles.cardIcon}><i className="fas fa-chalkboard-teacher"></i></div>
                        <h2 className={styles.sectionTitle}>Delivery Pack</h2>
                    </div>

                    <div className={styles.deliveryTabs}>
                        {deliveryTabs.map((tab) => (
                            <button
                                key={tab.key}
                                type="button"
                                className={`${styles.deliveryTabBtn} ${deliveryActiveTab === tab.key ? styles.deliveryTabBtnActive : ''}`}
                                onClick={() => setDeliveryActiveTab(tab.key)}
                            >
                                <i className={`fas ${tab.icon}`}></i> {tab.label}
                            </button>
                        ))}
                    </div>

                    {deliveryError && <div className={`alert alert-warning ${styles.deliveryAlert}`}>{deliveryError}</div>}

                    {deliveryLoading && (
                        <div className={styles.deliverySkeletonList}>
                            <div className={styles.deliverySkeleton}></div>
                            <div className={styles.deliverySkeleton}></div>
                            <div className={styles.deliverySkeleton}></div>
                        </div>
                    )}

                    {!deliveryLoading && !activeArtifact && !deliveryError && (
                        <div className={styles.deliveryEmpty}>No artifact loaded for this tab yet.</div>
                    )}

                    {!deliveryLoading && !!activeArtifact && (
                        <div className={styles.deliveryBody}>
                            {Array.isArray(activeArtifact)
                                ? activeArtifact.map((item, idx) => renderDeliveryItem(item, idx))
                                : renderDeliveryItem(activeArtifact, 0)}
                        </div>
                    )}
                </div>
            )}

            {isGenerating && (
                <div className={styles.glassLoadingOverlay}>
                    <div className={styles.loadingCard}>
                        <div className="spinner-border text-light"></div>
                        <h4 className={styles.loadingTitle}>Generating PowerPoint...</h4>
                        <p className={styles.loadingHint}>AI is composing your slides, please wait</p>
                    </div>
                </div>
            )}
            </main>
        </div>
    );
}