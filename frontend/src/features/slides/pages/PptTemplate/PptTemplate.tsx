import React from 'react';
import styles from '../../styles/pptTemplate.module.css';
import WelcomeBanner from '../../../../shared/components/WelcomeBanner';
import type { PptTemplateProps } from './types';

export default function PptTemplate({ states, handlers }: PptTemplateProps) {
    const {
        themes,
        selectedTheme,
        pptSchema,
        currentSlideIndex,
        layouts,
        isGenerating,
        errorMsg,
    } = states;

    const {
        selectTheme,
        setCurrentSlideIndex,
        selectLayout,
        applyLayoutToAll,
        generatePpt,
    } = handlers;

    const currentSlide = pptSchema?.slides?.[currentSlideIndex];
    const configuredCount = pptSchema?.slides?.filter((s: any) => s.layout?.name).length || 0;
    const totalSlides = pptSchema?.slides?.length || 0;
    const progress = totalSlides > 0 ? (configuredCount / totalSlides) * 100 : 0;
    const backendStaticBase = `${import.meta.env.VITE_API_ROOT || 'http://localhost:5009'}/static`;

    const normalizeThemeName = (value: string) => value.trim().toLowerCase();
    const preferredThemeOrder = ['Business', 'Classic', 'Dark', 'Light'];
    const themeByNormalizedName = new Map(
        (themes || []).map((theme: any) => [normalizeThemeName(theme.name || ''), theme])
    );
    const preferredThemes = preferredThemeOrder
        .map((name) => themeByNormalizedName.get(normalizeThemeName(name)))
        .filter(Boolean);
    const remainingThemes = (themes || []).filter(
        (theme: any) => !preferredThemeOrder.some((name) => normalizeThemeName(name) === normalizeThemeName(theme.name || ''))
    );
    const visibleThemes = [...preferredThemes, ...remainingThemes].slice(0, 4);

    const getThemePreviewSrc = (themeName: string) => (
        `${backendStaticBase}/img/${encodeURIComponent(themeName.toLowerCase())}-theme.png`
    );

    const getLayoutPreviewSrc = (themeName: string, layoutName: string) => (
        `${backendStaticBase}/img/${encodeURIComponent(themeName)}/${encodeURIComponent(layoutName)}.png`
    );

    const handleThemePreviewError = (e: React.SyntheticEvent<HTMLImageElement>, themeName: string) => {
        const img = e.currentTarget;
        const step = Number(img.dataset.fallbackStep || '0');
        if (step === 0) {
            img.dataset.fallbackStep = '1';
            img.src = `${backendStaticBase}/img/themes/${encodeURIComponent(themeName)}.png`;
            return;
        }
        if (step === 1) {
            img.dataset.fallbackStep = '2';
            img.src = `${backendStaticBase}/img/themes/${encodeURIComponent(themeName.toLowerCase())}.png`;
            return;
        }
        img.dataset.fallbackStep = '3';
    };

    const handleLayoutPreviewError = (e: React.SyntheticEvent<HTMLImageElement>, themeName: string, layoutName: string) => {
        const img = e.currentTarget;
        const step = Number(img.dataset.fallbackStep || '0');
        if (step === 0) {
            img.dataset.fallbackStep = '1';
            img.src = `${backendStaticBase}/img/${encodeURIComponent(themeName)}/${layoutName}.png`;
            return;
        }
        if (step === 1) {
            img.dataset.fallbackStep = '2';
            img.src = `${backendStaticBase}/img/${encodeURIComponent(themeName)}/${encodeURIComponent(layoutName.toLowerCase())}.png`;
            return;
        }
        img.dataset.fallbackStep = '3';
    };

    return (
        <div className={`container ${styles.pageShell}`}>
            <WelcomeBanner
                title={<><i className="fas fa-palette"></i> PowerPoint Template Selection</>}
                subtitle="Design your presentation by selecting a theme and layouts"
            />

            <div className={styles.workflowHint}>
                <i className="fas fa-info-circle"></i>
                <span><strong>Workflow:</strong> 1. Select a theme &rarr; 2. Navigate through slides &rarr; 3. Choose layout</span>
            </div>

            {errorMsg && (
                <div className="alert alert-warning" role="alert">
                    {errorMsg}
                </div>
            )}

            <div className={`card ${styles.sectionCard} ${styles.cardStep1}`}>
                <div className={styles.cardHeader}>
                    <div className={styles.cardIcon}><i className="fas fa-paint-brush"></i></div>
                    <h2 className={styles.sectionTitle}>1. Choose Presentation Theme</h2>
                </div>
                <div className={styles.themeGrid}>
                    {visibleThemes.map((theme: any) => (
                        <div
                            key={theme.name}
                            className={`${styles.themeCard} ${selectedTheme === theme.name ? styles.selected : ''}`}
                            onClick={() => selectTheme(theme.name)}
                        >
                            <div className={styles.previewBox}>
                                <img
                                    src={getThemePreviewSrc(theme.name)}
                                    alt={theme.name}
                                    onError={(e) => handleThemePreviewError(e, theme.name)}
                                />
                            </div>
                            <div className={styles.cardInfo}>
                                <h5 className={styles.themeName}>{theme.name}</h5>
                                <p className={styles.themeDesc}>{theme.description || 'Professional theme'}</p>
                            </div>
                        </div>
                    ))}
                </div>
                {(!themes || themes.length === 0) && (
                    <div className={`alert alert-info ${styles.infoBlock}`} role="alert">
                        No PPT themes were found. Please place template files (.pptx) in backend/static/ppt_templates and refresh.
                    </div>
                )}
            </div>

            {selectedTheme && (
                <div className={`card ${styles.sectionCard} ${styles.cardStep2}`}>
                    <div className={styles.cardHeader}>
                        <div className={styles.cardIcon}><i className="fas fa-th-large"></i></div>
                        <h2 className={styles.sectionTitle}>2. Customize Slide Layouts</h2>
                    </div>

                    <div className={styles.progressWrapper}>
                        <span className={styles.progressText}>Progress: <strong>{configuredCount} / {totalSlides}</strong> Configured</span>
                        <div className={styles.customProgress}>
                            <div className={styles.customProgressBar} style={{ width: `${progress}%` }}></div>
                        </div>
                    </div>

                    <ul className={styles.customTabs}>
                        {(pptSchema?.slides || []).map((slide: any, idx: number) => (
                            <li key={idx}>
                                <button
                                    type="button"
                                    className={`${styles.navLink} ${currentSlideIndex === idx ? styles.navLinkActive : ''}`}
                                    onClick={() => setCurrentSlideIndex(idx)}
                                >
                                    <i className={`fas ${slide.layout ? 'fa-check-circle' : 'fa-circle'} me-2`}></i>
                                    Page {idx + 1}
                                </button>
                            </li>
                        ))}
                    </ul>

                    <div className={styles.customTabContent}>
                        <div className={styles.slideMetaPanel}>
                            <h4>{currentSlide?.title}</h4>
                            <div className={styles.slideMetaTags}>
                                <span className={styles.metaTag}><i className="fas fa-list-ul"></i> {currentSlide?.content?.length || 0} Points</span>
                                <span className={styles.metaTag}><i className="fas fa-th-large"></i> Layout: {currentSlide?.layout?.name || 'None'}</span>
                            </div>
                        </div>

                        <div className={styles.layoutGrid}>
                            {(layouts || []).map((layout: any) => (
                                <div
                                    key={layout.name}
                                    className={`${styles.layoutCard} ${currentSlide?.layout?.name === layout.name ? styles.selected : ''}`}
                                    onClick={() => selectLayout(layout)}
                                >
                                    <div className={styles.previewBox}>
                                        <img
                                            src={getLayoutPreviewSrc(selectedTheme, layout.name)}
                                            alt={layout.name}
                                            onError={(e) => handleLayoutPreviewError(e, selectedTheme, layout.name)}
                                        />
                                    </div>
                                    <div className={styles.cardInfo}><h6 className={styles.layoutName}>{layout.name}</h6></div>
                                </div>
                            ))}
                        </div>
                        {(!layouts || layouts.length === 0) && (
                            <div className={`alert alert-info ${styles.infoBlock}`} role="alert" style={{ marginTop: '1rem' }}>
                                No available layouts were found for this theme.
                            </div>
                        )}

                        <div style={{ textAlign: 'right', marginTop: '2rem' }}>
                            <button type="button" className={styles.btnApplyAll} onClick={applyLayoutToAll}>
                                <i className="fas fa-clone"></i> Apply This Layout to All Slides
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className={`card ${styles.sectionCard} ${styles.cardStep3}`}>
                <div className={styles.actionGrid}>
                    <div className={styles.summaryBox}>
                        <h5 className={styles.summaryTitle}>Configuration Summary</h5>
                        <div className={styles.statItem}><span>Theme</span><strong>{selectedTheme || 'Not selected'}</strong></div>
                        <div className={styles.statItem}><span>Status</span><strong>{configuredCount === totalSlides ? 'Ready to Generate' : `${totalSlides - configuredCount} slides remaining`}</strong></div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <button
                            type="button"
                            className={`btn btn-primary ${styles.generateBtn}`}
                            onClick={generatePpt}
                            disabled={configuredCount !== totalSlides}
                            title={configuredCount !== totalSlides ? `Configure all slides first (${totalSlides - configuredCount} remaining)` : 'Generate PowerPoint'}
                        >
                            <i className="fas fa-file-powerpoint"></i> Generate PPT
                        </button>
                    </div>
                </div>
            </div>

            {isGenerating && (
                <div className={styles.glassLoadingOverlay}>
                    <div className={styles.loadingCard}>
                        <div className="spinner-border text-light"></div>
                        <h4 className={styles.loadingTitle}>Generating PowerPoint...</h4>
                        <p className={styles.loadingHint}>AI is composing your slides, please wait</p>
                    </div>
                </div>
            )}
        </div>
    );
}
