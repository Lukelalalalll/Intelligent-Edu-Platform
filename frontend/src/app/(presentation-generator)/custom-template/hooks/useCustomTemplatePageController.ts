"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  aiConfigApi,
  type AIConfigResponse,
} from "@/features/ai-config/api/aiConfigApi";
import {
  resolvePptGeneratorMultimodalProviderOverride,
  writeStoredPptGeneratorMultimodalProviderOverride,
  type PptGeneratorSelectableMultimodalProvider,
} from "@/ppt_generator/providerOverride";
import { mapPptGeneratorHrefToAppRoute } from "@/ppt_generator/routing";
import { useI18n } from "@/shared/i18n";

import { useFontLoader as loadFonts } from "../../hooks/useFontLoad";
import {
  buildCustomTemplateToolbarConfig,
  getCustomTemplateShellSteps,
  mapTemplateStateToShellStep,
} from "../customTemplatePageConfig";
import { useFileUpload } from "./useFileUpload";
import { useLayoutSaving } from "./useLayoutSaving";
import { useTemplateCreation } from "./useTemplateCreation";

export function useCustomTemplatePageController() {
  const { t } = useI18n();
  const router = useRouter();
  const fileUpload = useFileUpload();
  const templateCreation = useTemplateCreation();
  const [aiConfig, setAiConfig] = useState<AIConfigResponse | null>(null);
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

  useEffect(() => {
    let active = true;
    aiConfigApi.get().then((config) => {
      if (active) {
        setAiConfig(config);
      }
    }).catch(() => {
      if (active) {
        setAiConfig(null);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const unresolvedFonts = useMemo(() => getUnresolvedFonts(), [getUnresolvedFonts]);
  const multimodalProvider = useMemo(
    () => resolvePptGeneratorMultimodalProviderOverride(aiConfig),
    [aiConfig],
  );
  const multimodalConfig = multimodalProvider === "bigmodel"
    ? aiConfig?.multimodal?.bigmodel ?? null
    : aiConfig?.multimodal?.openai ?? null;
  const multimodalConfigured = Boolean(multimodalConfig?.api_key_set && multimodalProvider);

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

  const handleOpenAIConfig = useCallback(() => {
    router.push("/ai-config");
  }, [router]);

  const handleSelectMultimodalProvider = useCallback(
    (provider: PptGeneratorSelectableMultimodalProvider) => {
      writeStoredPptGeneratorMultimodalProviderOverride(provider);
      setAiConfig((current) => (current ? { ...current } : current));
    },
    [],
  );

  const handleInitTemplateCreation = useCallback(async () => {
    return initTemplateCreation(multimodalProvider);
  }, [initTemplateCreation, multimodalProvider]);

  const handleRetrySlide = useCallback((slideIndex: number) => {
    retrySlide(slideIndex, multimodalProvider);
  }, [multimodalProvider, retrySlide]);

  const toolbar = useMemo(
    () =>
      buildCustomTemplateToolbarConfig({
        t,
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
        onGenerateTemplate: handleInitTemplateCreation,
        onOpenSaveModal: openSaveModal,
        fileName: fileUpload.selectedFile?.name,
      }),
    [
      allFontsResolved,
      completedSlides,
      fileUpload.selectedFile,
      handleCheckFonts,
      handleFontUploadAndPreview,
      handleInitTemplateCreation,
      hasProcessedSlides,
      isProcessingSlides,
      isSavingLayout,
      unresolvedFonts.length,
      openSaveModal,
      state.previewData,
      state.step,
      state.totalSlides,
      t,
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
      steps: getCustomTemplateShellSteps(t),
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
      multimodalConfigured,
      multimodalModel: multimodalConfig?.model || "",
      multimodalProviderLabel:
        multimodalProvider === "bigmodel"
          ? "BigModel / GLM"
          : multimodalProvider === "openai"
            ? "OpenAI"
            : "",
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
      onInitTemplate: handleInitTemplateCreation,
      isLoading: state.isLoading,
    },
    templateCreationStepProps: {
      slides,
      setSlides,
      retrySlide: handleRetrySlide,
      isCompleted: flow.isCompleted,
      isSavingLayout,
      isProcessingSlides,
      completedSlides,
      totalSlides: state.totalSlides,
      onOpenSaveModal: openSaveModal,
      multimodalProvider: multimodalProvider || "openai",
      multimodalConfigured,
      multimodalModel: multimodalConfig?.model || "",
      multimodalUpdatedAt: multimodalConfig?.updated_at || null,
      onSelectMultimodalProvider: handleSelectMultimodalProvider,
      onOpenAIConfig: handleOpenAIConfig,
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
