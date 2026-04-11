import React from 'react';
import type { LayoutItem, ThemeItem } from '../types';

type Props = {
    styles: Record<string, string>;
    selectedThemeMeta: ThemeItem | null;
    selectedTheme: string;
    pptSchema: any;
    currentSlideIndex: number;
    setCurrentSlideIndex: (index: number) => void;
    currentSlide: any;
    configuredCount: number;
    totalSlides: number;
    configProgress: number;
    remainingSlides: number;
    jumpToNextUnconfiguredSlide: () => void;
    currentSlidePreviewBlocks: Array<{ key: string; left: number; top: number; width: number; height: number; type: string }>;
    getPreviewBlockText: (type: string, index: number) => string;
    getPlaceholderTone: (type: string) => string;
    applyLayoutToAll: () => void;
    layoutKeyword: string;
    setLayoutKeyword: (value: string) => void;
    visibleLayouts: LayoutItem[];
    selectLayout: (layout: LayoutItem) => void;
    getPreviewPlaceholders: (layout: LayoutItem) => Array<{ key: string; left: number; top: number; width: number; height: number; type: string }>;
    resolveLayoutPreviewImage: (layoutName: string) => string | null;
    updateCurrentSlide: (patch: any) => void;
    addCurrentSlideBullet: () => void;
    updateCurrentSlideBullet: (index: number, value: string) => void;
    removeCurrentSlideBullet: (index: number) => void;
    reorderCurrentSlideBullets: (from: number, to: number) => void;
    handleBulletKeyDown: (e: React.KeyboardEvent, idx: number) => void;
    moveCurrentBulletBy: (fromIndex: number, delta: number) => void;
    dragBulletIndex: number | null;
    setDragBulletIndex: React.Dispatch<React.SetStateAction<number | null>>;
    dragOverBulletIndex: number | null;
    setDragOverBulletIndex: React.Dispatch<React.SetStateAction<number | null>>;
};

export default function LayoutMappingSection({
    styles,
    selectedThemeMeta,
    selectedTheme,
    pptSchema,
    currentSlideIndex,
    setCurrentSlideIndex,
    currentSlide,
    configuredCount,
    totalSlides,
    configProgress,
    remainingSlides,
    jumpToNextUnconfiguredSlide,
    currentSlidePreviewBlocks,
    getPreviewBlockText,
    getPlaceholderTone,
    applyLayoutToAll,
    layoutKeyword,
    setLayoutKeyword,
    visibleLayouts,
    selectLayout,
    getPreviewPlaceholders,
    resolveLayoutPreviewImage,
    updateCurrentSlide,
    addCurrentSlideBullet,
    updateCurrentSlideBullet,
    removeCurrentSlideBullet,
    reorderCurrentSlideBullets,
    handleBulletKeyDown,
    moveCurrentBulletBy,
    dragBulletIndex,
    setDragBulletIndex,
    dragOverBulletIndex,
    setDragOverBulletIndex,
}: Props) {
    return (
        <section id="layout-editor" className={`card ${styles.sectionCard}`}>
            <div className={styles.cardHeader}>
                <div className={styles.cardIcon}><i className="fas fa-th-large"></i></div>
                <h2 className={styles.sectionTitle}>Layout Mapping</h2>
            </div>

            <div className={styles.progressWrapper}>
                <span className={styles.progressText}>Progress: <strong>{configuredCount} / {totalSlides}</strong> configured</span>
                <div className={styles.customProgress}>
                    <div className={styles.customProgressBar} style={{ width: `${configProgress}%` }}></div>
                </div>
            </div>

            <div className={styles.editorShell}>
                <aside className={styles.slideRail}>
                    <div className={styles.slideRailHeaderRow}>
                        <h5 className={styles.editorTitle}>Slides</h5>
                        <span className={styles.slideCountTag}>{totalSlides}</span>
                    </div>
                    <button
                        type="button"
                        className={styles.jumpBtn}
                        onClick={jumpToNextUnconfiguredSlide}
                        disabled={remainingSlides <= 0}
                    >
                        <i className="fas fa-location-arrow"></i>
                        Next Unconfigured ({remainingSlides})
                    </button>
                    <div className={styles.slideRailList}>
                        {pptSchema.slides.map((slide: any, idx: number) => (
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
                        <h5 className={styles.editorTitle}>Slide Preview</h5>
                        <span className={styles.metaTag}>Layout: {currentSlide?.layout?.name || 'None'}</span>
                    </div>

                    <div className={styles.slideMock}>
                        {currentSlidePreviewBlocks.length > 0 ? (
                            <div className={styles.slideMockCanvas}>
                                {currentSlidePreviewBlocks.map((p, idx) => (
                                    <span
                                        key={p.key}
                                        className={`${styles.layoutPreviewBlock} ${getPlaceholderTone(p.type)} ${styles.slideMockBlock}`}
                                        style={{
                                            left: `${p.left * 100}%`,
                                            top: `${p.top * 100}%`,
                                            width: `${p.width * 100}%`,
                                            height: `${p.height * 100}%`,
                                        }}
                                        title={getPreviewBlockText(p.type, idx)}
                                    >
                                        <span className={styles.slideMockBlockText}>{getPreviewBlockText(p.type, idx)}</span>
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <>
                                <div className={styles.slideMockTitle}>{currentSlide?.title || 'Untitled Slide'}</div>
                                <ul className={styles.slideMockBullets}>
                                    {(Array.isArray(currentSlide?.content) ? currentSlide.content : []).slice(0, 8).map((item: string, idx: number) => (
                                        <li key={`${idx}-${item}`}>{item}</li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </div>

                    <div className={styles.layoutSectionHeader}>
                        <h6 className={styles.editorSubTitle}>Choose Layout</h6>
                        <button type="button" className={styles.btnApplyAll} onClick={applyLayoutToAll}>
                            <i className="fas fa-clone"></i> Apply Layout To All
                        </button>
                    </div>

                    <div className={styles.searchRow}>
                        <input
                            type="text"
                            className="form-control"
                            placeholder="Search layouts by name or placeholder type"
                            value={layoutKeyword}
                            onChange={(e) => setLayoutKeyword(e.target.value)}
                        />
                    </div>

                    <div className={styles.layoutGrid}>
                        {(visibleLayouts as LayoutItem[]).map((layout, idx) => {
                            const previewPlaceholders = getPreviewPlaceholders(layout);
                            const previewImageUrl = resolveLayoutPreviewImage(layout.name);

                            return (
                                <button
                                    key={`${layout.name}-${idx}`}
                                    type="button"
                                    className={`${styles.layoutCard} ${currentSlide?.layout?.name === layout.name ? styles.selected : ''}`}
                                    onClick={() => selectLayout(layout)}
                                >
                                    <div className={styles.previewBox}>
                                        <div className={styles.layoutPreviewFrame}>
                                            {previewImageUrl ? (
                                                <img
                                                    src={previewImageUrl}
                                                    alt={layout.name}
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '10px' }}
                                                />
                                            ) : previewPlaceholders.length > 0 ? (
                                                previewPlaceholders.map((p) => (
                                                    <span
                                                        key={p.key}
                                                        className={`${styles.layoutPreviewBlock} ${getPlaceholderTone(p.type)}`}
                                                        style={{
                                                            left: `${p.left * 100}%`,
                                                            top: `${p.top * 100}%`,
                                                            width: `${p.width * 100}%`,
                                                            height: `${p.height * 100}%`,
                                                        }}
                                                    />
                                                ))
                                            ) : (
                                                <div className={styles.layoutPreviewFallback}>No geometry data</div>
                                            )}
                                        </div>
                                    </div>
                                    <div className={styles.cardInfo}>
                                        <h6 className={styles.layoutName} title={layout.name}>{layout.name}</h6>
                                        <p className={styles.themeDesc}>{previewPlaceholders.length || 0} placeholders</p>
                                    </div>
                                </button>
                            );
                        })}
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
                            {(Array.isArray(currentSlide?.content) ? currentSlide.content : []).map((bullet: string, idx: number) => (
                                <div
                                    key={`${idx}-${bullet}`}
                                    className={`${styles.bulletItem} ${dragOverBulletIndex === idx ? styles.bulletItemDropTarget : ''}`}
                                    draggable
                                    onDragStart={() => setDragBulletIndex(idx)}
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        setDragOverBulletIndex(idx);
                                    }}
                                    onDrop={() => {
                                        if (dragBulletIndex !== null && dragBulletIndex !== idx) {
                                            reorderCurrentSlideBullets(dragBulletIndex, idx);
                                        }
                                        setDragBulletIndex(null);
                                        setDragOverBulletIndex(null);
                                    }}
                                    onDragEnd={() => {
                                        setDragBulletIndex(null);
                                        setDragOverBulletIndex(null);
                                    }}
                                >
                                    <span className={styles.dragHandle}><i className="fas fa-grip-vertical"></i></span>
                                    <textarea
                                        className={`form-control ${styles.bulletInput}`}
                                        value={bullet}
                                        onChange={(e) => updateCurrentSlideBullet(idx, e.target.value)}
                                        rows={2}
                                        onKeyDown={(e) => handleBulletKeyDown(e, idx)}
                                    />
                                    <div className={styles.bulletActionStack}>
                                        <button
                                            type="button"
                                            className={styles.reorderBulletBtn}
                                            onClick={() => moveCurrentBulletBy(idx, -1)}
                                            disabled={idx === 0}
                                            title="Move up"
                                        >
                                            <i className="fas fa-arrow-up"></i>
                                        </button>
                                        <button
                                            type="button"
                                            className={styles.reorderBulletBtn}
                                            onClick={() => moveCurrentBulletBy(idx, 1)}
                                            disabled={idx === (Array.isArray(currentSlide?.content) ? currentSlide.content.length - 1 : -1)}
                                            title="Move down"
                                        >
                                            <i className="fas fa-arrow-down"></i>
                                        </button>
                                        <button type="button" className={styles.deleteBulletBtn} onClick={() => removeCurrentSlideBullet(idx)}>
                                            <i className="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </aside>
            </div>
        </section>
    );
}
