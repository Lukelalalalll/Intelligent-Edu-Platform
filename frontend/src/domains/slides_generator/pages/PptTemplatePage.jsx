import React from 'react';
import styles from '../../../styles/sub1/pptTemplate.module.css';

export default function PptTemplate({
    states, handlers
}) {
    const { themes, selectedTheme, pptSchema, currentSlideIndex, layouts, isGenerating, errorMsg } = states;
    const { selectTheme, setCurrentSlideIndex, selectLayout, applyLayoutToAll, generatePpt } = handlers;

    const currentSlide = pptSchema?.slides[currentSlideIndex];
    const configuredCount = pptSchema?.slides.filter(s => s.layout?.name).length || 0;
    const totalSlides = pptSchema?.slides.length || 0;
    const backendStaticBase = (import.meta.env.VITE_API_ROOT || 'http://localhost:5009') + '/static';

    const getThemePreviewSrc = (themeName) => (
        `${backendStaticBase}/img/${encodeURIComponent(themeName.toLowerCase())}-theme.png`
    );

    const getLayoutPreviewSrc = (themeName, layoutName) => (
        `${backendStaticBase}/img/${encodeURIComponent(themeName)}/${encodeURIComponent(layoutName)}.png`
    );

    return (
        <div className={`container ${styles.pageShell}`}>
            <header className={`page-header ${styles.pageHeader}`}>
                <h1 className={styles.pageTitle}><i className="fas fa-palette"></i> PowerPoint Template Selection</h1>
                <p className={`subtitle ${styles.pageSubtitle}`}>Design your presentation by selecting a theme and layouts</p>
            </header>

            <div className={styles.workflowHint}>
                <i className="fas fa-info-circle"></i>
                <span><strong>Workflow:</strong> 1. Select a theme &rarr; 2. Navigate through slides &rarr; 3. Choose layout</span>
            </div>

            {errorMsg && (
                <div className="alert alert-warning" role="alert">
                    {errorMsg}
                </div>
            )}

            {/* Step 1: Theme */}
            <div className={`card ${styles.sectionCard} ${styles.cardStep1}`}>
                <div className={styles.cardHeader}>
                    <div className={styles.cardIcon}><i className="fas fa-paint-brush"></i></div>
                    <h2 className={styles.sectionTitle}>1. Choose Presentation Theme</h2>
                </div>
                <div className={styles.themeGrid}>
                    {themes.map(theme => (
                        <div
                            key={theme.name}
                            className={`${styles.themeCard} ${selectedTheme === theme.name ? styles.selected : ''}`}
                            onClick={() => selectTheme(theme.name)}
                        >
                            <div className={styles.previewBox}>
                                <img src={getThemePreviewSrc(theme.name)} alt={theme.name} />
                            </div>
                            <div className={styles.cardInfo}>
                                <h5 className={styles.themeName}>{theme.name}</h5>
                                <p className={styles.themeDesc}>{theme.description || 'Professional theme'}</p>
                            </div>
                        </div>
                    ))}
                </div>
                {themes.length === 0 && (
                    <div className={`alert alert-info ${styles.infoBlock}`} role="alert">
                        No PPT themes were found. Please place template files (.pptx) in backend/static/ppt_templates and refresh.
                    </div>
                )}
            </div>

            {/* Step 2: Layouts */}
            {selectedTheme && (
                <div className={`card ${styles.sectionCard} ${styles.cardStep2}`}>
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

                    <ul className={styles.customTabs}>
                        {pptSchema.slides.map((slide, idx) => (
                            <li key={idx}>
                                <button type="button"
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
                            {layouts.map(layout => (
                                <div
                                    key={layout.name}
                                    className={`${styles.layoutCard} ${currentSlide?.layout?.name === layout.name ? styles.selected : ''}`}
                                    onClick={() => selectLayout(layout)}
                                >
                                    <div className={styles.previewBox}>
                                        <img src={getLayoutPreviewSrc(selectedTheme, layout.name)} alt={layout.name} />
                                    </div>
                                    <div className={styles.cardInfo}><h6 className={styles.layoutName}>{layout.name}</h6></div>
                                </div>
                            ))}
                        </div>
                        {layouts.length === 0 && (
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

            {/* Step 3: Action */}
            <div className={`card ${styles.sectionCard} ${styles.cardStep3}`}>
                <div className={styles.actionGrid}>
                    <div className={styles.summaryBox}>
                        <h5 className={styles.summaryTitle}>Configuration Summary</h5>
                        <div className={styles.statItem}><span>Theme</span><strong>{selectedTheme || 'Not selected'}</strong></div>
                        <div className={styles.statItem}><span>Status</span><strong>{configuredCount === totalSlides ? 'Ready to Generate' : `${totalSlides - configuredCount} slides remaining`}</strong></div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <button type="button"
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