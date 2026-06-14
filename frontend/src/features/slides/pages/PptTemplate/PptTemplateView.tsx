import React, { useCallback, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import layoutStyles from './styles/PptTemplateSteps.module.css';
import WelcomeBanner from '../../../../shared/components/WelcomeBanner';
import { slidesEditorApi } from '../../api/slidesApi';
import { resolveApiRoot } from '@/shared/api/root';
import type { EditorEdit } from '../../api/slidesApi';
import type { PptTemplateProps, FloatingImage, ThemeItem } from './types';
import { useActiveSlide } from './hooks/useActiveSlide';
import { useEditorState } from './hooks/useEditorState';
import { useGenerationFlow } from './hooks/useGenerationFlow';
import PptTemplateStepper from './components/PptTemplateStepper';
import ThemeStepView from './components/ThemeStepView';
import LayoutAssignmentStepView from './components/LayoutAssignmentStepView';
import PreviewEditorStepView from './components/PreviewEditorStepView';
import GenerationOverlay from './components/GenerationOverlay';

const STEP_ITEMS = [
    { step: 1, title: 'Choose Theme', icon: 'fa-paint-brush' },
    { step: 2, title: 'Layout Assignment', icon: 'fa-th-large' },
    { step: 3, title: 'Preview & Download', icon: 'fa-images' },
];

const PREFERRED_THEME_ORDER = ['Business', 'Classic', 'Dark', 'Light'];

function normalizeThemeName(value: string) {
    return value.trim().toLowerCase();
}

function getErrorMessage(error: unknown, fallback: string) {
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object') {
        const maybeAxios = error as { response?: { data?: { detail?: string } }; message?: string };
        return maybeAxios.response?.data?.detail || maybeAxios.message || fallback;
    }
    return fallback;
}

function escapeSvgText(value: string) {
    return value.replace(/[<>&"']/g, (char) => ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&#39;',
    }[char] ?? char));
}

export default function PptTemplate({ states, handlers }: PptTemplateProps) {
    const { themes, selectedTheme, pptSchema, errorMsg, layouts, currentSlideIndex } = states;
    const { selectTheme, setCurrentSlideIndex, selectLayout, applyLayoutToAll } = handlers;

    const [isExporting, setIsExporting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [currentStep, setCurrentStep] = useState(1);
    const [uploadTargetSlideIdx, setUploadTargetSlideIdx] = useState<number | null>(null);

    const freeImageInputRef = useRef<HTMLInputElement | null>(null);
    const { activeSlideIdx, setActiveSlide, resetActiveSlide } = useActiveSlide(0);

    const {
        selectedElementId,
        uploadingFreeImage,
        textEdits,
        floatingImages,
        hasUnsavedEdits,
        setSelectedElementId,
        setUploadingFreeImage,
        setTextEdit,
        addFloatingImage,
        moveFloatingImage,
        removeFloatingImage,
        resetAll,
        clearEdits,
    } = useEditorState();

    const {
        layoutMode,
        setLayoutMode,
        aiProvider,
        setAiProvider,
        isGenerating,
        generateProgress,
        session,
        setSession,
        assignedSchema,
        canGenerate,
        resetGeneratedState,
        handleGenerate,
        handleCancelGenerate,
    } = useGenerationFlow({
        selectedTheme,
        pptSchema,
        onBeforeGenerate: () => {
            resetAll();
            resetActiveSlide();
        },
        onAfterGenerate: () => {
            resetActiveSlide();
            setCurrentStep(3);
        },
    });

    const apiBase = resolveApiRoot();
    const backendStaticBase = `${apiBase}/static`;

    const genId = useCallback(() => `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, []);

    const visibleThemes = useMemo(() => {
        const themeByNormalizedName = new Map(
            (themes || []).map((theme) => [normalizeThemeName(theme.name || ''), theme]),
        );
        return [
            ...PREFERRED_THEME_ORDER.map((name) => themeByNormalizedName.get(normalizeThemeName(name))).filter(Boolean) as ThemeItem[],
            ...(themes || []).filter(
                (theme) =>
                    !PREFERRED_THEME_ORDER.some(
                        (name) => normalizeThemeName(name) === normalizeThemeName(theme.name || ''),
                    ),
            ),
        ].slice(0, 4);
    }, [themes]);

    const getThemePreviewSrc = useCallback(
        (name: string) => `${backendStaticBase}/img/${encodeURIComponent(name.toLowerCase())}-theme.png`,
        [backendStaticBase],
    );

    const getLayoutPreviewSrc = useCallback(
        (themeName: string, layoutName: string) =>
            `${backendStaticBase}/img/${encodeURIComponent(themeName)}/${encodeURIComponent(layoutName)}.png`,
        [backendStaticBase],
    );

    const applyImageFallback = useCallback((img: HTMLImageElement, fallbacks: string[], finalSrc?: string) => {
        const step = Number(img.dataset.fallbackStep || '0');
        if (step < fallbacks.length) {
            img.dataset.fallbackStep = String(step + 1);
            img.src = fallbacks[step];
            return;
        }
        if (finalSrc && step === fallbacks.length) {
            img.dataset.fallbackStep = String(step + 1);
            img.src = finalSrc;
        }
    }, []);

    const handleLayoutPreviewError = useCallback((e: React.SyntheticEvent<HTMLImageElement>, themeName: string, layoutName: string) => {
        const img = e.currentTarget;
        const safeName = escapeSvgText(layoutName);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="112" viewBox="0 0 200 112">
  <rect width="200" height="112" rx="6" fill="#f1f3f5" stroke="#dee2e6" stroke-width="1"/>
  <text x="100" y="48" font-family="sans-serif" font-size="10" fill="#495057" text-anchor="middle" dominant-baseline="middle">${safeName}</text>
  <text x="100" y="68" font-family="sans-serif" font-size="9" fill="#adb5bd" text-anchor="middle">No preview</text>
</svg>`;
        applyImageFallback(
            img,
            [
                `${backendStaticBase}/img/${encodeURIComponent(themeName)}/${layoutName}.png`,
                `${backendStaticBase}/img/${encodeURIComponent(themeName)}/${encodeURIComponent(layoutName.toLowerCase())}.png`,
            ],
            `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
        );
    }, [applyImageFallback, backendStaticBase]);

    const handleThemePreviewError = useCallback((e: React.SyntheticEvent<HTMLImageElement>, name: string) => {
        const img = e.currentTarget;
        applyImageFallback(
            img,
            [
                `${backendStaticBase}/img/themes/${encodeURIComponent(name)}.png`,
                `${backendStaticBase}/img/themes/${encodeURIComponent(name.toLowerCase())}.png`,
            ],
        );
    }, [applyImageFallback, backendStaticBase]);

    const handleAddFreeImage = useCallback(async (file: File, slideIndex: number) => {
        setUploadingFreeImage(true);
        try {
            const { asset_id } = await slidesEditorApi.uploadImage(file);
            const ext = file.name.includes('.') ? `.${file.name.split('.').pop()}` : '.png';
            const previewUrl = URL.createObjectURL(file);
            const newImg: FloatingImage = {
                id: genId(), previewUrl, assetId: asset_id, ext,
                xPct: 0.1, yPct: 0.1, wPct: 0.35,
            };
            addFloatingImage(slideIndex, newImg);
            toast.success('Image added — drag to reposition');
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, 'Image upload failed'));
        } finally {
            setUploadingFreeImage(false);
        }
    }, [addFloatingImage, genId, setUploadingFreeImage]);

    const editsArray = useMemo<EditorEdit[]>(
        () =>
            Object.entries(textEdits).flatMap(([slideIndex, elementMap]) =>
                Object.entries(elementMap).map(([elementId, content]) => ({
                    slide_index: Number(slideIndex),
                    element_id: elementId,
                    content,
                })),
            ),
        [textEdits],
    );

    const floatingSlideImages = useMemo(
        () =>
            Object.entries(floatingImages)
                .filter(([, images]) => images.length > 0)
                .flatMap(([slideIndex, images]) =>
                    images.map((image) => ({
                        slide_index: Number(slideIndex),
                        asset_id: image.assetId,
                        ext: image.ext,
                        x_pct: image.xPct,
                        y_pct: image.yPct,
                        w_pct: image.wPct,
                    })),
                ),
        [floatingImages],
    );

    const handleExport = useCallback(async () => {
        if (!session || !selectedTheme) return;
        setIsExporting(true);
        try {
            const blob = await slidesEditorApi.exportPptx({
                session_id: session.session_id,
                theme: session.theme || selectedTheme,
                ppt_schema: assignedSchema || pptSchema || {},
                edits: editsArray,
                slide_images: floatingSlideImages,
            });

            if (!blob || blob.size < 1024) {
                throw new Error('Exported file is unexpectedly small. Please retry.');
            }

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const baseTitle = (pptSchema?.presentation_title || 'presentation')
                .toString()
                .replace(/[^a-zA-Z0-9_-]+/g, '_');
            a.download = `${baseTitle}_${selectedTheme}.pptx`;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 2000);
            toast.success('PPTX downloaded successfully.');
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, 'Export failed'));
        } finally {
            setIsExporting(false);
        }
    }, [assignedSchema, editsArray, floatingSlideImages, pptSchema, selectedTheme, session]);

    const handleSave = useCallback(async () => {
        if (!session || !hasUnsavedEdits) return;
        setIsSaving(true);
        try {
            const updatedSession = await slidesEditorApi.reRenderSession({
                session_id: session.session_id,
                edits: editsArray,
                slide_images: floatingSlideImages.length > 0 ? floatingSlideImages : undefined,
            });

            const cacheBuster = `?v=${Date.now()}`;
            updatedSession.slides = updatedSession.slides.map((slide) => ({
                ...slide,
                preview_url: slide.preview_url.split('?')[0] + cacheBuster,
            }));

            setSession(updatedSession);
            clearEdits();
            toast.success('Slides saved & refreshed!');
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, 'Save failed'));
        } finally {
            setIsSaving(false);
        }
    }, [clearEdits, editsArray, floatingSlideImages, hasUnsavedEdits, session, setSession]);

    const resetEditorForNewTheme = useCallback(() => {
        resetGeneratedState();
        resetAll();
        resetActiveSlide();
    }, [resetActiveSlide, resetAll, resetGeneratedState]);

    const handleThemeSelect = useCallback((themeName: string) => {
        selectTheme(themeName);
        resetEditorForNewTheme();
        setCurrentStep(2);
    }, [resetEditorForNewTheme, selectTheme]);

    const handleStepClick = useCallback((step: number) => {
        if (currentStep > step) {
            setCurrentStep(step);
            return;
        }
        if (step === 2 && selectedTheme) {
            setCurrentStep(2);
            return;
        }
        if (step === 3 && session) {
            setCurrentStep(3);
        }
    }, [currentStep, selectedTheme, session]);

    const openImagePickerForSlide = useCallback((slideIndex: number) => {
        setActiveSlide(slideIndex);
        setUploadTargetSlideIdx(slideIndex);
        freeImageInputRef.current?.click();
    }, [setActiveSlide]);

    const handleFreeImageInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const target = uploadTargetSlideIdx ?? activeSlideIdx;
            handleAddFreeImage(file, target);
        }
        event.target.value = '';
    }, [activeSlideIdx, handleAddFreeImage, uploadTargetSlideIdx]);

    const setActiveAndScroll = useCallback((slideIndex: number) => {
        setActiveSlide(slideIndex);
        document.getElementById(`slide-item-${slideIndex}`)?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
        });
    }, [setActiveSlide]);

    const slideCallbacks = useMemo(() => {
        if (!session) return [] as Array<{
            onSelect: () => void;
            onOpenUpload: (event: React.MouseEvent<HTMLButtonElement>) => void;
            onTextChange: (id: string, text: string) => void;
            onMoveImage: (imgId: string, x: number, y: number) => void;
            onRemoveImage: (imgId: string) => void;
        }>;

        return session.slides.map((_, idx) => ({
            onSelect: () => setActiveSlide(idx),
            onOpenUpload: (event: React.MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
                openImagePickerForSlide(idx);
            },
            onTextChange: (id: string, text: string) => setTextEdit(idx, id, text),
            onMoveImage: (imgId: string, x: number, y: number) => moveFloatingImage(idx, imgId, x, y),
            onRemoveImage: (imgId: string) => removeFloatingImage(idx, imgId),
        }));
    }, [moveFloatingImage, openImagePickerForSlide, removeFloatingImage, session, setActiveSlide, setTextEdit]);

    const hasSlides = (pptSchema?.slides?.length || 0) > 0;
    const totalSlides = pptSchema?.slides?.length || 0;
    const configuredCount = pptSchema?.slides?.filter((slide) => slide.layout?.name).length || 0;
    const progress = totalSlides > 0 ? (configuredCount / totalSlides) * 100 : 0;
    const currentSlide = pptSchema?.slides?.[currentSlideIndex];

    return (
        <div className={`container ${layoutStyles.pageShell}`}>
            <WelcomeBanner
                title={<><i className="fas fa-palette" /> PowerPoint Template Selection</>}
                subtitle="Select a theme, let AI design your slides, then preview and add images"
                variant="workspace"
            />

            <PptTemplateStepper items={STEP_ITEMS} currentStep={currentStep} onStepClick={handleStepClick} />

            {errorMsg && <div className="alert alert-warning" role="alert">{errorMsg}</div>}

            <div key={currentStep} className={layoutStyles.stepView}>
                {currentStep === 1 && (
                    <ThemeStepView
                        themes={themes}
                        visibleThemes={visibleThemes}
                        selectedTheme={selectedTheme}
                        getThemePreviewSrc={getThemePreviewSrc}
                        onThemePreviewError={handleThemePreviewError}
                        onThemeSelect={handleThemeSelect}
                    />
                )}

                {currentStep === 2 && selectedTheme && (
                    <LayoutAssignmentStepView
                        selectedTheme={selectedTheme}
                        layoutMode={layoutMode}
                        onLayoutModeChange={setLayoutMode}
                        aiProvider={aiProvider}
                        onAiProviderChange={setAiProvider}
                        hasSlides={hasSlides}
                        canGenerate={canGenerate}
                        isGenerating={isGenerating}
                        configuredCount={configuredCount}
                        totalSlides={totalSlides}
                        progress={progress}
                        currentSlideIndex={currentSlideIndex}
                        currentSlide={currentSlide}
                        slides={pptSchema?.slides || []}
                        layouts={layouts}
                        onBack={() => setCurrentStep(1)}
                        onSelectSlide={setCurrentSlideIndex}
                        onSelectLayout={selectLayout}
                        onApplyLayoutToAll={applyLayoutToAll}
                        onGenerate={handleGenerate}
                        getLayoutPreviewSrc={getLayoutPreviewSrc}
                        onLayoutPreviewError={handleLayoutPreviewError}
                    />
                )}

                {currentStep === 3 && session && (
                    <PreviewEditorStepView
                        session={session}
                        apiBase={apiBase}
                        activeSlideIdx={activeSlideIdx}
                        textEdits={textEdits}
                        floatingImages={floatingImages}
                        selectedElementId={selectedElementId}
                        uploadingFreeImage={uploadingFreeImage}
                        hasUnsavedEdits={hasUnsavedEdits}
                        isSaving={isSaving}
                        isExporting={isExporting}
                        slideCallbacks={slideCallbacks}
                        freeImageInputRef={freeImageInputRef}
                        onBack={() => setCurrentStep(2)}
                        onSave={handleSave}
                        onExport={handleExport}
                        onSidebarSlideClick={setActiveAndScroll}
                        onSelectElement={setSelectedElementId}
                        onFreeImageInputChange={handleFreeImageInputChange}
                    />
                )}
            </div>

            <GenerationOverlay
                isGenerating={isGenerating}
                generateProgress={generateProgress}
                onCancelGenerate={handleCancelGenerate}
            />
        </div>
    );
}
