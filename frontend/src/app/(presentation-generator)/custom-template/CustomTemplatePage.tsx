"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  FileCog,
  Images,
  Palette,
  Save,
  Sparkles,
  Type,
  Upload,
} from "lucide-react";

import PptGeneratorShell, {
  type PptGeneratorStep,
} from "@/features/slides/components/PptGeneratorShell";
import { mapPresentonHrefToAppRoute } from "@/presenton/routing";
import { useFontLoader } from "../hooks/useFontLoad";
import { useFileUpload } from "./hooks/useFileUpload";
import { useLayoutSaving } from "./hooks/useLayoutSaving";
import { useTemplateCreation } from "./hooks/useTemplateCreation";
import { SaveLayoutModal } from "./components/SaveLayoutModal";
import { FileUploadSection } from "./components/FileUploadSection";
import { Step2FontManagement } from "./components/steps/Step2FontManagement";
import { Step3SlidePreview } from "./components/steps/Step3SlidePreview";
import { Step4TemplateCreation } from "./components/steps/Step4TemplateCreation";
import type { ProcessedSlide, TemplateCreationStep } from "./types";
import styles from "./customTemplateWorkbench.module.css";

type ToolbarConfig = {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel?: string;
  actionIcon?: React.ReactNode;
  actionDisabled?: boolean;
  actionLoading?: boolean;
  onAction?: () => void;
  meta?: string;
};

const STEP_LABELS: Array<{
  key: TemplateCreationStep | "font-check-group";
  label: string;
  icon: React.ReactNode;
}> = [
  { key: "file-upload", label: "Upload", icon: <Upload className="h-4 w-4" /> },
  { key: "font-check-group", label: "Fonts", icon: <Type className="h-4 w-4" /> },
  { key: "slides-preview", label: "Preview", icon: <Images className="h-4 w-4" /> },
  { key: "template-creation", label: "Generate", icon: <Sparkles className="h-4 w-4" /> },
  { key: "completed", label: "Done", icon: <CheckCircle2 className="h-4 w-4" /> },
];

function mapStateToShellStep(step: TemplateCreationStep): number {
  if (step === "font-check" || step === "font-upload") return 1;
  return Math.max(
    STEP_LABELS.findIndex((item) => item.key === step),
    0
  );
}

function getToolbarConfig(args: {
  step: TemplateCreationStep;
  hasFile: boolean;
  fontCount: number;
  missingFontCount: number;
  previewCount: number;
  totalSlides: number;
  completedSlides: number;
  allFontsReady: boolean;
  hasProcessedSlides: boolean;
  isSavingLayout: boolean;
  isProcessingSlides: boolean;
  onCheckFonts: () => void;
  onContinueFonts: () => Promise<void>;
  onGenerateTemplate: () => Promise<void>;
  onOpenSaveModal: () => void;
  fileName?: string;
}): ToolbarConfig {
  const {
    step,
    hasFile,
    fontCount,
    missingFontCount,
    previewCount,
    totalSlides,
    completedSlides,
    allFontsReady,
    hasProcessedSlides,
    isSavingLayout,
    isProcessingSlides,
    onCheckFonts,
    onContinueFonts,
    onGenerateTemplate,
    onOpenSaveModal,
    fileName,
  } = args;

  if (step === "file-upload") {
    return {
      eyebrow: "Template Studio",
      title: "Upload a PPTX to build a reusable template family",
      description:
        "Start from an existing slide deck, check font coverage, preview extracted slides, and convert the deck into editable Presenton template layouts.",
      actionLabel: hasFile ? "Check Fonts" : "Select a PPTX file",
      actionIcon: <FileCog className="h-4 w-4" />,
      actionDisabled: !hasFile,
      onAction: onCheckFonts,
      meta: fileName
        ? `Current file: ${fileName}`
        : "PPTX only | Max 100MB | Approx. 5 minutes",
    };
  }

  if (step === "font-check" || step === "font-upload") {
    return {
      eyebrow: "Font Validation",
      title: "Verify typefaces before generating slide previews",
      description:
        "Presenton compares the uploaded deck against available fonts so your reconstructed slides stay faithful to the original typography.",
      actionLabel: allFontsReady ? "Continue to Preview" : "Continue",
      actionIcon: <Type className="h-4 w-4" />,
      actionDisabled: false,
      actionLoading: step === "font-upload",
      onAction: () => {
        void onContinueFonts();
      },
      meta:
        missingFontCount > 0
          ? `${missingFontCount} missing font${missingFontCount === 1 ? "" : "s"} still unresolved`
          : `${fontCount} font source${fontCount === 1 ? "" : "s"} ready for preview`,
    };
  }

  if (step === "slides-preview") {
    return {
      eyebrow: "Preview Slides",
      title: "Review extracted slides before layout reconstruction",
      description:
        "Check image fidelity, confirm fonts loaded correctly, and then convert each slide into a reusable React template.",
      actionLabel: "Generate Template",
      actionIcon: <Sparkles className="h-4 w-4" />,
      actionDisabled: previewCount === 0,
      actionLoading: false,
      onAction: () => {
        void onGenerateTemplate();
      },
      meta: `${previewCount} slide preview${previewCount === 1 ? "" : "s"} ready`,
    };
  }

  if (step === "template-creation") {
    return {
      eyebrow: "Generation Workspace",
      title: "Reconstruct each slide into editable template code",
      description:
        "Monitor generation, inspect individual slide layouts, and open schema editing on the right when you need to tighten structure or content slots.",
      meta:
        totalSlides > 0
          ? `${completedSlides}/${totalSlides} slides completed`
          : "Preparing slide generation",
    };
  }

  return {
    eyebrow: "Save Template",
    title: "Template reconstruction complete",
    description:
      "Review the finished layouts, make any last schema adjustments, and save the result as a reusable custom Presenton template.",
    actionLabel: "Save Template",
    actionIcon: <Save className="h-4 w-4" />,
    actionDisabled: !hasProcessedSlides || isProcessingSlides,
    actionLoading: isSavingLayout,
    onAction: onOpenSaveModal,
    meta:
      totalSlides > 0
        ? `${completedSlides}/${totalSlides} slides ready to package`
        : "Layouts ready",
  };
}

const CustomTemplatePage = () => {
  const router = useRouter();
  const [schemaEditorSlideIndex, setSchemaEditorSlideIndex] = useState<number | null>(null);
  const [schemaPreviewData, setSchemaPreviewData] = useState<Record<number, Record<string, any>>>({});

  const {
    selectedFile,
    isDragging,
    handleFileSelect,
    removeFile,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useFileUpload();

  const {
    state,
    uploadedFonts,
    slides,
    setSlides,
    completedSlides,
    checkFonts,
    uploadFont,
    removeFont,
    fontUploadAndPreview,
    initTemplateCreation,
    retrySlide,
    allFontsUploaded,
  } = useTemplateCreation();

  const {
    isSavingLayout,
    isModalOpen,
    openSaveModal,
    closeSaveModal,
    saveLayout,
  } = useLayoutSaving(slides);

  const handleCheckFonts = useCallback(async () => {
    if (selectedFile) {
      await checkFonts(selectedFile);
    }
  }, [selectedFile, checkFonts]);

  const handleFontUploadAndPreview = useCallback(async () => {
    if (!selectedFile) return;
    const data = await fontUploadAndPreview(selectedFile);
    if (data?.fonts) {
      useFontLoader(data.fonts);
    }
  }, [selectedFile, fontUploadAndPreview]);

  const handleSaveTemplate = useCallback(
    async (
      layoutName: string,
      description: string,
      templateInfoId: string
    ): Promise<string | null> => {
      const id = await saveLayout(layoutName, description, templateInfoId);
      if (id) {
        router.push(`/template-preview?slug=custom-${id}`);
      }
      return id;
    },
    [saveLayout, router]
  );

  const handleBackToTemplates = useCallback(() => {
    router.push(mapPresentonHrefToAppRoute("/templates"));
  }, [router]);

  const handleSlideUpdate = useCallback(
    (index: number, updatedSlideData: Partial<ProcessedSlide>) => {
      setSlides((prevSlides) =>
        prevSlides.map((slide, slideIndex) =>
          slideIndex === index
            ? { ...slide, ...updatedSlideData, modified: true }
            : slide
        )
      );
    },
    [setSlides]
  );

  const handleOpenSchemaEditor = useCallback((index: number | null) => {
    setSchemaEditorSlideIndex(index);
  }, []);

  const handleCloseSchemaEditor = useCallback(() => {
    setSchemaEditorSlideIndex(null);
  }, []);

  const handleSchemaEditorSave = useCallback(
    (updatedReact: string) => {
      if (schemaEditorSlideIndex !== null) {
        setSlides((prev) =>
          prev.map((slide, index) =>
            index === schemaEditorSlideIndex
              ? { ...slide, react: updatedReact }
              : slide
          )
        );
      }
      setSchemaEditorSlideIndex(null);
    },
    [schemaEditorSlideIndex, setSlides]
  );

  const handleSchemaPreviewContent = useCallback(
    (content: Record<string, any>) => {
      if (schemaEditorSlideIndex !== null) {
        setSchemaPreviewData((prev) => ({
          ...prev,
          [schemaEditorSlideIndex]: content,
        }));
      }
    },
    [schemaEditorSlideIndex]
  );

  const handleClearSchemaPreview = useCallback((slideIndex: number) => {
    setSchemaPreviewData((prev) => {
      const next = { ...prev };
      delete next[slideIndex];
      return next;
    });
  }, []);

  const missingFonts = useMemo(() => {
    const unavailable = state.fontsData?.unavailable_fonts ?? [];
    return unavailable.filter((font) => {
      return !uploadedFonts.some(
        (uploaded) =>
          uploaded.fontName === font.name ||
          (font.original_name && uploaded.fontName === font.original_name)
      );
    });
  }, [state.fontsData, uploadedFonts]);

  const shellSteps = useMemo<PptGeneratorStep[]>(
    () =>
      STEP_LABELS.map((step) => ({
        key: String(step.key),
        label: step.label,
        icon: step.icon,
        isClickable: false,
      })),
    []
  );

  const toolbar = useMemo(
    () =>
      getToolbarConfig({
        step: state.step,
        hasFile: Boolean(selectedFile),
        fontCount: Object.keys(state.previewData?.fonts ?? {}).length,
        missingFontCount: missingFonts.length,
        previewCount: state.previewData?.slide_image_urls?.length ?? 0,
        totalSlides: state.totalSlides,
        completedSlides,
        allFontsReady: allFontsUploaded(),
        hasProcessedSlides: slides.some((slide) => slide.processed),
        isSavingLayout,
        isProcessingSlides: slides.some((slide) => slide.processing),
        onCheckFonts: () => {
          void handleCheckFonts();
        },
        onContinueFonts: handleFontUploadAndPreview,
        onGenerateTemplate: initTemplateCreation,
        onOpenSaveModal: openSaveModal,
        fileName: selectedFile?.name,
      }),
    [
      state.step,
      state.previewData,
      state.totalSlides,
      selectedFile,
      missingFonts.length,
      completedSlides,
      allFontsUploaded,
      slides,
      isSavingLayout,
      handleCheckFonts,
      handleFontUploadAndPreview,
      initTemplateCreation,
      openSaveModal,
    ]
  );

  const showFileUpload = state.step === "file-upload";
  const showFontManager = state.step === "font-check" || state.step === "font-upload";
  const showPreview = state.step === "slides-preview";
  const showSlides = state.step === "template-creation" || state.step === "completed";
  const shellStep = mapStateToShellStep(state.step);
  const processingCompleted = state.step === "completed";

  return (
    <PptGeneratorShell
      currentStep={shellStep}
      steps={shellSteps}
      compactStepper
      stepperLeading={
        <button
          type="button"
          className={styles.railBackButton}
          onClick={handleBackToTemplates}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Templates
        </button>
      }
      className={styles.shell}
      contentClassName={styles.page}
      bannerTitle={
        <>
          <Palette className="h-6 w-6" aria-hidden="true" /> Template Studio
        </>
      }
      bannerSubtitle="Convert an existing PPTX into a reusable Presenton template workflow with branded controls, slide previews, schema editing, and template packaging."
      toolbar={
        <div className={styles.toolbar}>
          <div className={styles.toolbarTitle}>
            <span className={styles.toolbarEyebrow}>{toolbar.eyebrow}</span>
            <strong>{toolbar.title}</strong>
            <span>{toolbar.description}</span>
          </div>
          <div className={styles.toolbarActions}>
            {toolbar.meta ? <span className={styles.toolbarMeta}>{toolbar.meta}</span> : null}
            {toolbar.actionLabel && toolbar.onAction ? (
              <button
                type="button"
                className={styles.headerAction}
                onClick={toolbar.onAction}
                disabled={toolbar.actionDisabled || toolbar.actionLoading}
              >
                {toolbar.actionIcon}
                {toolbar.actionLoading ? "Working..." : toolbar.actionLabel}
              </button>
            ) : null}
          </div>
        </div>
      }
    >
      {showFileUpload ? (
        <FileUploadSection
          selectedFile={selectedFile}
          handleFileSelect={handleFileSelect}
          removeFile={removeFile}
          CheckFonts={handleCheckFonts}
          isProcessingPptx={state.isLoading}
          slides={slides}
          completedSlides={completedSlides}
          isDragging={isDragging}
          handleDragOver={handleDragOver}
          handleDragLeave={handleDragLeave}
          handleDrop={handleDrop}
        />
      ) : null}

      {showFontManager && (
        <Step2FontManagement
          fontsData={state.fontsData}
          uploadedFonts={uploadedFonts}
          uploadFont={uploadFont}
          removeFont={removeFont}
          onContinue={handleFontUploadAndPreview}
          isUploading={state.isLoading}
        />
      )}

      {showPreview && (
        <Step3SlidePreview
          previewData={state.previewData}
          onInitTemplate={initTemplateCreation}
          isLoading={state.isLoading}
        />
      )}

      {showSlides && slides.length > 0 && (
        <Step4TemplateCreation
          slides={slides}
          setSlides={setSlides}
          retrySlide={retrySlide}
          onSlideUpdate={handleSlideUpdate}
          schemaEditorSlideIndex={schemaEditorSlideIndex}
          onOpenSchemaEditor={handleOpenSchemaEditor}
          onCloseSchemaEditor={handleCloseSchemaEditor}
          onSchemaEditorSave={handleSchemaEditorSave}
          schemaPreviewData={schemaPreviewData}
          onSchemaPreviewContent={handleSchemaPreviewContent}
          onClearSchemaPreview={handleClearSchemaPreview}
          isCompleted={processingCompleted}
          isSavingLayout={isSavingLayout}
          isProcessingSlides={slides.some((slide) => slide.processing)}
          completedSlides={completedSlides}
          totalSlides={state.totalSlides}
          onOpenSaveModal={openSaveModal}
        />
      )}

      <SaveLayoutModal
        isOpen={isModalOpen}
        onClose={closeSaveModal}
        onSave={handleSaveTemplate}
        isSaving={isSavingLayout}
        template_info_id={state.templateId || ""}
      />
    </PptGeneratorShell>
  );
};

export default CustomTemplatePage;
