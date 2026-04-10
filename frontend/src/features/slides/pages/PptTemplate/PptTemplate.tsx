import React, { useMemo, useState } from 'react';
import styles from '../../styles/pptTemplate.module.css';
import type { DeliveryArtifactType } from '../../../../api/slidesDeliveryApi';
import SlidesLoadingState from '../../components/SlidesLoadingState';
import type { LayoutItem, PptTemplateProps } from './types';
import ThemeFamiliesSection from './components/ThemeFamiliesSection';
import LayoutMappingSection from './components/LayoutMappingSection';
import ConfigurationActionsSection from './components/ConfigurationActionsSection';
import DeliveryPackSection from './components/DeliveryPackSection';
import { useThemeCatalog } from './hooks/useThemeCatalog';
import { useSlideEditor } from './hooks/useSlideEditor';
import {
    formatFamilyTitle,
    getPlaceholderTone,
    getPreviewBlockText,
    getPreviewPlaceholders,
    getThemeGradient,
} from './utils/previewUtils';
import { copyTextToClipboard, formatDeliveryItem } from './utils/deliveryUtils';

export default function PptTemplate({ states, handlers }: PptTemplateProps) {
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

    const [layoutKeyword, setLayoutKeyword] = useState('');

    const {
        themeKeyword,
        setThemeKeyword,
        themeSortMode,
        setThemeSortMode,
        activeFamilyFilter,
        setActiveFamilyFilter,
        expandedThemeGroups,
        setExpandedThemeGroups,
        themePreviewLayouts,
        selectedThemeMeta,
        groupedThemes,
        availableFamilies,
        getThemeLayoutCount,
    } = useThemeCatalog(themes, selectedTheme);

    const {
        currentSlide,
        configuredCount,
        totalSlides,
        remainingSlides,
        configProgress,
        canGenerate,
        jumpToNextUnconfiguredSlide,
        moveCurrentBulletBy,
        handleBulletKeyDown,
        dragBulletIndex,
        setDragBulletIndex,
        dragOverBulletIndex,
        setDragOverBulletIndex,
    } = useSlideEditor(pptSchema, currentSlideIndex, setCurrentSlideIndex, reorderCurrentSlideBullets);

    const visibleLayouts = useMemo(() => {
        const q = layoutKeyword.trim().toLowerCase();
        if (!q) return layouts;
        return layouts.filter((layout: any) => {
            const name = String(layout?.name || '').toLowerCase();
            const placeholderNames = Array.isArray(layout?.placeholders)
                ? layout.placeholders.map((p: any) => `${p?.name || ''} ${p?.type || ''}`).join(' ').toLowerCase()
                : '';
            return `${name} ${placeholderNames}`.includes(q);
        });
    }, [layouts, layoutKeyword]);

    const currentSlidePreviewBlocks = useMemo(() => {
        const activeLayout: LayoutItem = {
            name: currentSlide?.layout?.name || 'Current',
            placeholders: Array.isArray(currentSlide?.layout?.placeholders) ? currentSlide.layout.placeholders : [],
        };
        return getPreviewPlaceholders(activeLayout);
    }, [currentSlide]);

    const resolvePlaceholderTone = (type: string) => getPlaceholderTone(type, styles);
    const resolvePreviewBlockText = (type: string, index: number) => getPreviewBlockText(type, index, currentSlide);

    const renderDeliveryItem = (item: any, idx: number) => {
        const { lines, copyText } = formatDeliveryItem(item, deliveryActiveTab as DeliveryArtifactType);
        return (
            <div key={idx} className={styles.deliveryItem}>
                <div className={styles.deliveryTextWrap}>
                    {lines.map((line, lineIdx) => (
                        <p key={`${idx}-${lineIdx}`} style={{ margin: 0 }}>{line}</p>
                    ))}
                </div>
                <button type="button" className={styles.copyBtn} onClick={() => copyTextToClipboard(copyText)}>
                    <i className="far fa-copy"></i> Copy
                </button>
            </div>
        );
    };

    return (
        <div className={styles.presentonShell}>
            <main className={styles.presentonMain}>
                <section className={styles.studioHero}>
                    <div>
                        <p className={styles.studioKicker}>Template Studio</p>
                        <h1 className={styles.studioTitle}>Design The Slide System Before You Generate</h1>
                        <p className={styles.studioSubtitle}>
                            Pick a template family, assign layout per slide, then export PPT and classroom delivery assets.
                        </p>
                    </div>
                    <div className={styles.studioStats}>
                        <div className={styles.heroStat}><span>Slides</span><strong>{totalSlides}</strong></div>
                        <div className={styles.heroStat}><span>Configured</span><strong>{configuredCount}</strong></div>
                        <div className={styles.heroStat}><span>Progress</span><strong>{configProgress}%</strong></div>
                    </div>
                </section>

                {errorMsg && <div className="alert alert-warning" role="alert">{errorMsg}</div>}

                <ThemeFamiliesSection
                    styles={styles}
                    themeKeyword={themeKeyword}
                    setThemeKeyword={setThemeKeyword}
                    availableFamilies={availableFamilies}
                    activeFamilyFilter={activeFamilyFilter}
                    setActiveFamilyFilter={setActiveFamilyFilter}
                    themeSortMode={themeSortMode}
                    setThemeSortMode={setThemeSortMode}
                    groupedThemes={groupedThemes}
                    selectedThemeMeta={selectedThemeMeta}
                    expandedThemeGroups={expandedThemeGroups}
                    setExpandedThemeGroups={setExpandedThemeGroups}
                    selectedTheme={selectedTheme}
                    selectTheme={selectTheme}
                    themePreviewLayouts={themePreviewLayouts}
                    getPreviewPlaceholders={getPreviewPlaceholders}
                    getPlaceholderTone={resolvePlaceholderTone}
                    getThemeGradient={getThemeGradient}
                    getThemeLayoutCount={getThemeLayoutCount}
                    formatFamilyTitle={formatFamilyTitle}
                />

                {selectedTheme && (
                    <LayoutMappingSection
                        styles={styles}
                        selectedThemeMeta={selectedThemeMeta}
                        selectedTheme={selectedTheme}
                        pptSchema={pptSchema}
                        currentSlideIndex={currentSlideIndex}
                        setCurrentSlideIndex={setCurrentSlideIndex}
                        currentSlide={currentSlide}
                        configuredCount={configuredCount}
                        totalSlides={totalSlides}
                        configProgress={configProgress}
                        remainingSlides={remainingSlides}
                        jumpToNextUnconfiguredSlide={jumpToNextUnconfiguredSlide}
                        currentSlidePreviewBlocks={currentSlidePreviewBlocks}
                        getPreviewBlockText={resolvePreviewBlockText}
                        getPlaceholderTone={resolvePlaceholderTone}
                        applyLayoutToAll={applyLayoutToAll}
                        layoutKeyword={layoutKeyword}
                        setLayoutKeyword={setLayoutKeyword}
                        visibleLayouts={visibleLayouts}
                        selectLayout={selectLayout}
                        getPreviewPlaceholders={getPreviewPlaceholders}
                        updateCurrentSlide={updateCurrentSlide}
                        addCurrentSlideBullet={addCurrentSlideBullet}
                        updateCurrentSlideBullet={updateCurrentSlideBullet}
                        removeCurrentSlideBullet={removeCurrentSlideBullet}
                        reorderCurrentSlideBullets={reorderCurrentSlideBullets}
                        handleBulletKeyDown={handleBulletKeyDown}
                        moveCurrentBulletBy={moveCurrentBulletBy}
                        dragBulletIndex={dragBulletIndex}
                        setDragBulletIndex={setDragBulletIndex}
                        dragOverBulletIndex={dragOverBulletIndex}
                        setDragOverBulletIndex={setDragOverBulletIndex}
                    />
                )}

                <ConfigurationActionsSection
                    styles={styles}
                    selectedTheme={selectedTheme}
                    canGenerate={canGenerate}
                    remainingSlides={remainingSlides}
                    deliveryLoading={deliveryLoading}
                    generatePpt={generatePpt}
                    generateDeliveryPack={generateDeliveryPack}
                />

                <DeliveryPackSection
                    styles={styles}
                    deliveryJobId={deliveryJobId}
                    deliveryError={deliveryError}
                    deliveryLoading={deliveryLoading}
                    deliveryActiveTab={deliveryActiveTab}
                    setDeliveryActiveTab={setDeliveryActiveTab}
                    deliveryArtifacts={deliveryArtifacts}
                    renderDeliveryItem={renderDeliveryItem}
                />

                {isGenerating && (
                    <div className={styles.glassLoadingOverlay}>
                        <div className={styles.loadingCard}>
                            <SlidesLoadingState compact title="Generating PowerPoint" subtitle="Composing your slides and preparing the downloadable file." />
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
