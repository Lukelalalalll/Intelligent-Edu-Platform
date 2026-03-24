import React from 'react';
import styles from '../../styles/sub1/pptTemplate.module.css';

export default function PptTemplate({
    states, handlers
}) {
    const { themes, selectedTheme, pptSchema, currentSlideIndex, layouts, isGenerating } = states;
    const { selectTheme, setCurrentSlideIndex, selectLayout, applyLayoutToAll, generatePpt } = handlers;

    const currentSlide = pptSchema?.slides[currentSlideIndex];
    const configuredCount = pptSchema?.slides.filter(s => s.layout?.name).length || 0;
    const totalSlides = pptSchema?.slides.length || 0;

    return (
        <div className="container">
            <header className="page-header">
                <h1><i className="fas fa-palette"></i> PowerPoint Template Selection</h1>
                <p className="subtitle">Design your presentation by selecting a theme and layouts</p>
            </header>

            <div className={styles.workflowHint}>
                <i className="fas fa-info-circle"></i>
                <span><strong>Workflow:</strong> 1. Select a theme &rarr; 2. Navigate through slides &rarr; 3. Choose layout</span>
            </div>

            {/* Step 1: Theme */}
            <div className="card">
                <div className={styles.cardHeader}>
                    <div className={styles.cardIcon}><i className="fas fa-paint-brush"></i></div>
                    <h2>1. Choose Presentation Theme</h2>
                </div>
                <div className={styles.themeGrid}>
                    {themes.map(theme => (
                        <div
                            key={theme.name}
                            className={`${styles.themeCard} ${selectedTheme === theme.name ? styles.selected : ''}`}
                            onClick={() => selectTheme(theme.name)}
                        >
                            <div className={styles.previewBox}>
                                <img src={`/static/img/${theme.name.toLowerCase()}-theme.png`} alt={theme.name} />
                            </div>
                            <div className={styles.cardInfo}>
                                <h5>{theme.name}</h5>
                                <p>{theme.description || 'Professional theme'}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Step 2: Layouts */}
            {selectedTheme && (
                <div className="card">
                    <div className={styles.cardHeader}>
                        <div className={styles.cardIcon}><i className="fas fa-th-large"></i></div>
                        <h2>2. Customize Slide Layouts</h2>
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
                                <button
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
                                        <img src={`/static/img/${selectedTheme}/${layout.name}.png`} alt={layout.name} />
                                    </div>
                                    <div className={styles.cardInfo}><h6>{layout.name}</h6></div>
                                </div>
                            ))}
                        </div>

                        <div style={{ textAlign: 'right', marginTop: '2rem' }}>
                            <button className={styles.btnApplyAll} onClick={applyLayoutToAll}>
                                <i className="fas fa-clone"></i> Apply This Layout to All Slides
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Step 3: Action */}
            {configuredCount === totalSlides && (
                <div className="card">
                    <div className={styles.actionGrid}>
                        <div className={styles.summaryBox}>
                            <h5>Configuration Summary</h5>
                            <div className={styles.statItem}><span>Theme</span><strong>{selectedTheme}</strong></div>
                            <div className={styles.statItem}><span>Status</span><strong>Ready to Generate</strong></div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <button className="btn btn-primary" style={{ width: '100%', height: '80px', fontSize: '1.5rem' }} onClick={generatePpt}>
                                <i className="fas fa-file-powerpoint"></i> Generate PPT
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isGenerating && (
                <div className={styles.glassLoadingOverlay}>
                    <div>
                        <div className="spinner-border text-light"></div>
                        <h4 className="mt-3">Generating PowerPoint...</h4>
                        <p>AI is composing your slides, please wait</p>
                    </div>
                </div>
            )}
        </div>
    );
}