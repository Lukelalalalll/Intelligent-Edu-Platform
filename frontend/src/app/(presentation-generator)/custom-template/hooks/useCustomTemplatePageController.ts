"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";

import { mapPptGeneratorHrefToAppRoute } from "@/ppt_generator/routing";

import { useFontLoader as loadFonts } from "../../hooks/useFontLoad";
import {
  buildCustomTemplateToolbarConfig,
  CUSTOM_TEMPLATE_SHELL_STEPS,
  mapTemplateStateToShellStep,
} from "../customTemplatePageConfig";
import { useFileUpload } from "./useFileUpload";
import { useLayoutSaving } from "./useLayoutSaving";
import { useTemplateCreation } from "./useTemplateCreation";

export function useCustomTemplatePageController() {
  const router = useRouter();
  const fileUpload = useFileUpload();
  const templateCreation = useTemplateCreation();
  const {
    state,
    uploadedFonts,
    fontResolutionsByKey,
    slides,
    setSlides,
    completedSlides,
    checkFonts,
    uploadFont,
    removeFont,
    setFontReplacement,
    fontUploadAndPreview,
    initTemplateCreation,
    retrySlide,
    getUnresolvedFonts,
    allFontsResolved,
  } = templateCreation;
  const {
    isSavingLayout,
    isModalOpen,
    openSaveModal,
    closeSaveModal,
    saveLayout,
  } = useLayoutSaving(slides);

  const unresolvedFonts = useMemo(() => getUnresolvedFonts(), [getUnresolvedFonts]);

  const isProcessingSlides = useMemo(
    () => slides.some((slide) => slide.processing),
    [slides]
  );
  const hasProcessedSlides = useMemo(
    () => slides.some((slide) => slide.processed),
    [slides]
  );

  const handleCheckFonts = useCallback(async () => {
    if (fileUpload.selectedFile) {
      await checkFonts(fileUpload.selectedFile);
    }
  }, [checkFonts, fileUpload.selectedFile]);

  const handleFontUploadAndPreview = useCallback(async () => {
    if (!fileUpload.selectedFile) {
      return;
    }

    const data = await fontUploadAndPreview(fileUpload.selectedFile);
    if (data?.fonts) {
      loadFonts(data.fonts);
    }
  }, [fileUpload.selectedFile, fontUploadAndPreview]);

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
    [router, saveLayout]
  );

  const handleBackToTemplates = useCallback(() => {
    router.push(mapPptGeneratorHrefToAppRoute("/templates"));
  }, [router]);

  const toolbar = useMemo(
    () =>
      buildCustomTemplateToolbarConfig({
        step: state.step,
        hasFile: Boolean(fileUpload.selectedFile),
        fontCount: Object.keys(state.previewData?.fonts ?? {}).length,
        missingFontCount: unresolvedFonts.length,
        previewCount: state.previewData?.slide_image_urls?.length ?? 0,
        totalSlides: state.totalSlides,
        completedSlides,
        allFontsResolved: allFontsResolved(),
        hasProcessedSlides,
        isSavingLayout,
        isProcessingSlides,
        onCheckFonts: () => {
          void handleCheckFonts();
        },
        onContinueFonts: handleFontUploadAndPreview,
        onGenerateTemplate: initTemplateCreation,
        onOpenSaveModal: openSaveModal,
        fileName: fileUpload.selectedFile?.name,
      }),
    [
      allFontsResolved,
      completedSlides,
      fileUpload.selectedFile,
      handleCheckFonts,
      handleFontUploadAndPreview,
      hasProcessedSlides,
      initTemplateCreation,
      isProcessingSlides,
      isSavingLayout,
      unresolvedFonts.length,
      openSaveModal,
      state.previewData,
      state.step,
      state.totalSlides,
    ]
  );

  const flow = {
    currentShellStep: mapTemplateStateToShellStep(state.step),
    isCompleted: state.step === "completed",
    showFileUpload: state.step === "file-upload",
    showFontManager: state.step === "font-check" || state.step === "font-upload",
    showPreview: state.step === "slides-preview",
    showSlides:
      (state.step === "template-creation" || state.step === "completed") &&
      slides.length > 0,
  };

  return {
    shell: {
      currentStep: flow.currentShellStep,
      steps: CUSTOM_TEMPLATE_SHELL_STEPS,
      toolbar,
      onBackToTemplates: handleBackToTemplates,
    },
    flow,
    fileUploadStepProps: {
      selectedFile: fileUpload.selectedFile,
      handleFileSelect: fileUpload.handleFileSelect,
      removeFile: fileUpload.removeFile,
      CheckFonts: handleCheckFonts,
      isProcessingPptx: state.isLoading,
      slides,
      completedSlides,
      isDragging: fileUpload.isDragging,
      handleDragOver: fileUpload.handleDragOver,
      handleDragLeave: fileUpload.handleDragLeave,
      handleDrop: fileUpload.handleDrop,
    },
    fontManagementStepProps: {
      fontsData: state.fontsData,
      fontResolutionsByKey,
      uploadedFonts,
      uploadFont,
      removeFont,
      setFontReplacement,
      allFontsResolved: allFontsResolved(),
      onContinue: handleFontUploadAndPreview,
      isUploading: state.isLoading,
    },
    slidePreviewStepProps: {
      previewData: state.previewData,
      onInitTemplate: initTemplateCreation,
      isLoading: state.isLoading,
    },
    templateCreationStepProps: {
      slides,
      setSlides,
      retrySlide,
      isCompleted: flow.isCompleted,
      isSavingLayout,
      isProcessingSlides,
      completedSlides,
      totalSlides: state.totalSlides,
      onOpenSaveModal: openSaveModal,
    },
    saveLayoutModalProps: {
      isOpen: isModalOpen,
      onClose: closeSaveModal,
      onSave: handleSaveTemplate,
      isSaving: isSavingLayout,
      template_info_id: state.templateId || "",
    },
  };
}

