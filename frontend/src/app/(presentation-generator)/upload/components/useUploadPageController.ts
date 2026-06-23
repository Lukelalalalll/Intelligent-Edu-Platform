"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";

import { notify } from "@/components/ui/sonner";
import { RootState } from "@/store/store";
import { clearOutlines, setPresentationId } from "@/store/slices/presentationGeneration";
import { setPptGenUploadState } from "@/store/slices/presentationGenUpload";
import { MixpanelEvent, trackEvent } from "@/utils/mixpanel";

import { ImagesApi } from "../../services/api/images";
import { PresentationGenerationApi } from "../../services/api/presentation-generation";
import { LanguageType, type PresentationConfig } from "../type";
import {
  buildUploadActionSummary,
  buildUploadSnapshotProps,
  buildUploadStatusCards,
  INITIAL_LOADING_STATE,
  INITIAL_PRESENTATION_CONFIG,
  type LoadingState,
  STOCK_IMAGE_PROVIDERS,
} from "./uploadPageHelpers";

export function useUploadPageController() {
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useDispatch();
  const llmConfig = useSelector((state: RootState) => state.userConfig.llm_config);

  const [files, setFiles] = useState<File[]>([]);
  const [config, setConfig] = useState<PresentationConfig>(INITIAL_PRESENTATION_CONFIG);
  const [loadingState, setLoadingState] = useState<LoadingState>(INITIAL_LOADING_STATE);

  const effectiveConfig = useMemo(
    () => ({
      ...config,
      webSearch:
        llmConfig?.WEB_GROUNDING !== undefined
          ? !!llmConfig.WEB_GROUNDING
          : config.webSearch,
    }),
    [config, llmConfig?.WEB_GROUNDING]
  );

  const uploadSnapshotProps = useMemo(
    () =>
      buildUploadSnapshotProps({
        config: effectiveConfig,
        files,
        llmConfig,
        pathname,
      }),
    [effectiveConfig, files, llmConfig, pathname]
  );

  const generationPathLabel = files.length > 0 ? "Document-assisted" : "Prompt only";
  const nextStepLabel = files.length > 0 ? "Documents preview" : "Outline builder";
  const primaryActionLabel =
    files.length > 0 ? "Next: Review documents" : "Next: Generate outline";

  const actionSummary = useMemo(
    () =>
      buildUploadActionSummary({
        inputReady: uploadSnapshotProps.has_prompt || files.length > 0,
        filesCount: files.length,
        nextStepLabel,
      }),
    [files.length, nextStepLabel, uploadSnapshotProps.has_prompt]
  );

  const statusCards = useMemo(
    () =>
      buildUploadStatusCards({
        generationPathLabel,
        slides: effectiveConfig.slides,
        language: effectiveConfig.language,
      }),
    [effectiveConfig.language, effectiveConfig.slides, generationPathLabel]
  );

  const trackUploadValidationFailure = useCallback(
    (reason: string) => {
      trackEvent(MixpanelEvent.Upload_Configuration_Invalid, {
        ...uploadSnapshotProps,
        reason,
      });
    },
    [uploadSnapshotProps]
  );

  const handleConfigChange = useCallback(
    (key: keyof PresentationConfig, value: unknown) => {
      setConfig((current) => ({ ...current, [key]: value } as PresentationConfig));
    },
    []
  );

  const handleFilesChange = useCallback((nextFiles: File[]) => {
    setFiles(nextFiles);
  }, []);

  const ensureStockImageProviderReady = useCallback(async (): Promise<boolean> => {
    if (llmConfig?.DISABLE_IMAGE_GENERATION) {
      return true;
    }

    const selectedProvider = (llmConfig?.IMAGE_PROVIDER || "").toLowerCase();
    if (!STOCK_IMAGE_PROVIDERS.has(selectedProvider)) {
      return true;
    }

    try {
      const providerApiKey =
        selectedProvider === "pexels"
          ? llmConfig?.PEXELS_API_KEY
          : llmConfig?.PIXABAY_API_KEY;

      await ImagesApi.searchStockImages("business", 1, {
        provider: selectedProvider,
        apiKey: providerApiKey,
        strictApiKey: true,
      });

      return true;
    } catch (error: any) {
      notify.error(
        "Image provider unavailable",
        error?.message ||
          `Unable to reach ${selectedProvider} right now. Please check your API key/settings and try again.`
      );
      return false;
    }
  }, [llmConfig]);

  const validateConfiguration = useCallback((): boolean => {
    if (!effectiveConfig.language) {
      trackUploadValidationFailure("language_missing");
      notify.warning("Language required", "Please select a language.");
      return false;
    }

    if (files.length > 0 && effectiveConfig.language === LanguageType.Auto) {
      trackUploadValidationFailure("language_auto_with_documents");
      notify.warning(
        "Language required",
        "Please choose a language before processing uploaded documents."
      );
      return false;
    }

    if (!effectiveConfig.prompt.trim() && files.length === 0) {
      trackUploadValidationFailure("prompt_or_document_missing");
      notify.warning(
        "Input required",
        "Provide a prompt or upload at least one document."
      );
      return false;
    }

    return true;
  }, [
    effectiveConfig.language,
    effectiveConfig.prompt,
    files.length,
    trackUploadValidationFailure,
  ]);

  const handleGenerationError = useCallback((error: any) => {
    console.error("Error in upload page", error);
    setLoadingState({
      isLoading: false,
      message: "",
      duration: 0,
      showProgress: false,
    });
    notify.error(
      "Generation failed",
      error.message || "Something went wrong while starting your presentation."
    );
  }, []);

  const handleDocumentProcessing = useCallback(async () => {
    setLoadingState({
      isLoading: true,
      message: "Processing documents...",
      showProgress: true,
      duration: 90,
      extra_info:
        files.length > 0 ? "It might take a few minutes for large documents." : "",
    });

    let documents = [];

    if (files.length > 0) {
      documents = await PresentationGenerationApi.uploadDoc(files);
    }

    const selectedLanguage = effectiveConfig.language ?? "";
    const requests: Promise<any>[] = [];

    if (documents.length > 0) {
      requests.push(
        PresentationGenerationApi.decomposeDocuments(documents, selectedLanguage)
      );
    }

    const responses = await Promise.all(requests);

    dispatch(
      setPptGenUploadState({
        config: effectiveConfig,
        files: responses,
      })
    );
    dispatch(clearOutlines());

    trackEvent(MixpanelEvent.Upload_Documents_Processed, {
      ...uploadSnapshotProps,
      uploaded_documents_count: documents.length,
      decompose_job_count: responses.length,
      destination: "/documents-preview",
    });
    trackEvent(MixpanelEvent.Navigation, {
      from: pathname,
      to: "/documents-preview",
    });

    router.push("/documents-preview");
  }, [dispatch, effectiveConfig, files, pathname, router, uploadSnapshotProps]);

  const handleDirectPresentationGeneration = useCallback(async () => {
    setLoadingState({
      isLoading: true,
      message: "Generating outlines...",
      showProgress: true,
      duration: 30,
    });

    const selectedLanguage = effectiveConfig.language ?? "";
    const createResponse = await PresentationGenerationApi.createPresentation({
      content: effectiveConfig.prompt ?? "",
      n_slides: effectiveConfig.slides ? parseInt(effectiveConfig.slides, 10) : null,
      file_paths: [],
      language: selectedLanguage,
      tone: effectiveConfig.tone,
      verbosity: effectiveConfig.verbosity,
      instructions: effectiveConfig.instructions || null,
      include_table_of_contents: !!effectiveConfig.includeTableOfContents,
      include_title_slide: !!effectiveConfig.includeTitleSlide,
      web_search: !!effectiveConfig.webSearch,
    });

    dispatch(setPresentationId(createResponse.id));
    dispatch(clearOutlines());

    trackEvent(MixpanelEvent.Upload_Outline_Generation_Requested, {
      ...uploadSnapshotProps,
      presentation_id: createResponse.id,
      destination: "/outline",
    });
    trackEvent(MixpanelEvent.Navigation, {
      from: pathname,
      to: "/outline",
    });

    router.push("/outline");
  }, [dispatch, effectiveConfig, pathname, router, uploadSnapshotProps]);

  const handleGeneratePresentation = useCallback(async () => {
    if (!validateConfiguration()) {
      return;
    }

    trackEvent(MixpanelEvent.Upload_Generation_Started, uploadSnapshotProps);

    const isStockProviderReady = await ensureStockImageProviderReady();
    if (!isStockProviderReady) {
      trackUploadValidationFailure("stock_image_provider_unreachable");
      return;
    }

    try {
      if (files.length > 0) {
        await handleDocumentProcessing();
        return;
      }

      await handleDirectPresentationGeneration();
    } catch (error) {
      handleGenerationError(error);
    }
  }, [
    ensureStockImageProviderReady,
    files.length,
    handleDirectPresentationGeneration,
    handleDocumentProcessing,
    handleGenerationError,
    trackUploadValidationFailure,
    uploadSnapshotProps,
    validateConfiguration,
  ]);

  return {
    config: effectiveConfig,
    files,
    loadingState,
    viewState: {
      actionSummary,
      primaryActionLabel,
      statusCards,
    },
    actions: {
      handleConfigChange,
      handleFilesChange,
      handleGeneratePresentation,
    },
  };
}
