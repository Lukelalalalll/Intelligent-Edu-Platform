import type React from 'react';
import type { AIProvider } from '../../../../../shared/aiProvider';
import styles from '../styles/PptTemplateSteps.module.css';
import type { LayoutItem, SlideSchemaItem } from '../types';

type Props = {
    selectedTheme: string;
    layoutMode: 'auto' | 'manual';
    onLayoutModeChange: (mode: 'auto' | 'manual') => void;
    aiProvider: AIProvider;
    onAiProviderChange: (provider: AIProvider) => void;
    hasSlides: boolean;
    canGenerate: boolean;
    isGenerating: boolean;
    configuredCount: number;
    totalSlides: number;
    progress: number;
    currentSlideIndex: number;
    currentSlide?: SlideSchemaItem;
    slides: SlideSchemaItem[];
    layouts: LayoutItem[];
    onBack: () => void;
    onSelectSlide: (index: number) => void;
    onSelectLayout: (layout: LayoutItem) => void;
    onApplyLayoutToAll: () => void;
    onGenerate: () => void;
    getLayoutPreviewSrc: (themeName: string, layoutName: string) => string;
    onLayoutPreviewError: (e: React.SyntheticEvent<HTMLImageElement>, themeName: string, layoutName: string) => void;
};

export default function LayoutAssignmentStepView({
    selectedTheme,
    layoutMode,
    onLayoutModeChange,
    aiProvider,
    onAiProviderChange,
    hasSlides,
    canGenerate,
    isGenerating,
    configuredCount,
    totalSlides,
    progress,
    currentSlideIndex,
    currentSlide,
    slides,
    layouts,
    onBack,
    onSelectSlide,
    onSelectLayout,
    onApplyLayoutToAll,
    onGenerate,
    getLayoutPreviewSrc,
    onLayoutPreviewError,
}: Props) {
    return (
        <div className={`card ${styles.sectionCard} ${styles.cardStep2}`}>
            <div className="d-flex justify-content-between align-items-center mb-5 pb-2">
                <h5 className="card-title mb-0">
                    <i className="fas fa-th-large" aria-hidden="true" /> 2. Layout Assignment
                </h5>
                <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={onBack}
                >
                    <i className="fas fa-arrow-left me-1" /> Back
                </button>
            </div>

            <div className={styles.modeToggle}>
                <button
                    type="button"
                    className={`${styles.modeBtn} ${layoutMode === 'auto' ? styles.modeBtnActive : ''}`}
                    onClick={() => onLayoutModeChange('auto')}
                >
                    <i className="fas fa-magic me-2" />AI Auto
                </button>
                <button
                    type="button"
                    className={`${styles.modeBtn} ${layoutMode === 'manual' ? styles.modeBtnActive : ''}`}
                    onClick={() => onLayoutModeChange('manual')}
                >
                    <i className="fas fa-hand-pointer me-2" />Manual
                </button>
            </div>

            {layoutMode === 'auto' ? (
                <>
                    <p className={styles.generateHint}>
                        AI will automatically choose the best layout for each slide and generate a complete PPTX.
                    </p>
                    <div className={styles.generateActions}>
                        <label className={styles.providerLabel}>
                            AI Provider
                            <select
                                className={styles.providerSelect}
                                value={aiProvider}
                                onChange={(e) => onAiProviderChange(e.target.value as AIProvider)}
                            >
                                <option value="local_ollama">Local Ollama</option>
                        <option value="deepseek">DeepSeek</option>
                                <option value="coze">Coze</option>
                            </select>
                        </label>
                        <button
                            type="button"
                            className={styles.generateBtn}
                            disabled={!hasSlides || isGenerating || !canGenerate}
                            onClick={onGenerate}
                        >
                            {isGenerating
                                ? <><span className="spinner-border spinner-border-sm me-2" /> Generating...</>
                                : <><i className="fas fa-bolt me-2" /> AI Smart Generate</>}
                        </button>
                    </div>
                </>
            ) : (
                <>
                    <div className={styles.progressWrapper}>
                        <span className={styles.progressText}>Progress: <strong>{configuredCount} / {totalSlides}</strong> Configured</span>
                        <div className={styles.customProgress}>
                            <div className={styles.customProgressBar} style={{ width: `${progress}%` }} />
                        </div>
                    </div>

                    <ul className={styles.customTabs}>
                        {slides.map((slide, idx) => (
                            <li key={idx}>
                                <button
                                    type="button"
                                    className={`${styles.navLink} ${currentSlideIndex === idx ? styles.navLinkActive : ''}`}
                                    onClick={() => onSelectSlide(idx)}
                                >
                                    <i className={`fas ${slide.layout?.name ? 'fa-check-circle' : 'fa-circle'} me-2`} />
                                    Page {idx + 1}
                                </button>
                            </li>
                        ))}
                    </ul>

                    <div className={styles.customTabContent}>
                        <div className={styles.slideMetaPanel}>
                            <h4>{currentSlide?.title}</h4>
                            <div className={styles.slideMetaTags}>
                                <span className={styles.metaTag}><i className="fas fa-list-ul" /> {currentSlide?.content?.length || 0} Points</span>
                                <span className={styles.metaTag}><i className="fas fa-th-large" /> Layout: {currentSlide?.layout?.name || 'None'}</span>
                            </div>
                        </div>

                        <div className={styles.layoutGrid}>
                            {layouts.map((layout) => (
                                <div
                                    key={layout.name}
                                    className={`${styles.layoutCard} ${currentSlide?.layout?.name === layout.name ? styles.selected : ''}`}
                                    onClick={() => onSelectLayout(layout)}
                                >
                                    <div className={styles.previewBox}>
                                        <img
                                            src={getLayoutPreviewSrc(selectedTheme, layout.name)}
                                            alt={layout.name}
                                            loading="lazy"
                                            decoding="async"
                                            onError={(e) => onLayoutPreviewError(e, selectedTheme, layout.name)}
                                        />
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
                            <button type="button" className={styles.btnApplyAll} onClick={onApplyLayoutToAll}>
                                <i className="fas fa-clone" /> Apply This Layout to All Slides
                            </button>
                        </div>
                    </div>
                    <div className={styles.generateActions} style={{ marginTop: '1.5rem' }}>
                        <button
                            type="button"
                            className={styles.generateBtn}
                            disabled={!hasSlides || configuredCount !== totalSlides || isGenerating}
                            onClick={onGenerate}
                            title={configuredCount !== totalSlides ? `Configure all slides first (${totalSlides - configuredCount} remaining)` : 'Generate PowerPoint'}
                        >
                            {isGenerating
                                ? <><span className="spinner-border spinner-border-sm me-2" /> Generating...</>
                                : <><i className="fas fa-play me-2" /> Generate</>}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
