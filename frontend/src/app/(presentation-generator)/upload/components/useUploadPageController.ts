"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";

import { notify } from "@/components/ui/sonner";
import { aiConfigApi, type AIConfigResponse } from "@/features/ai-config/api/aiConfigApi";
import {
  applyPptGeneratorProviderOverride,
  getConfiguredPptGeneratorProviders,
  resolvePptGeneratorProviderOverride,
  writeStoredPptGeneratorProviderOverride,
  type PptGeneratorSelectableProvider,
} from "@/ppt_generator/providerOverride";
import { useI18n } from "@/shared/i18n";
import { RootState } from "@/store/store";
import { clearOutlines, setPresentationId } from "@/store/slices/presentationGeneration";
import { setLLMConfig } from "@/store/slices/userConfig";
import { setPptGenUploadState } from "@/store/slices/presentationGenUpload";
import { MixpanelEvent, trackEvent } from "@/utils/mixpanel";

import { ImagesApi } from "../../services/api/images";
import { PresentationGenerationApi } from "../../services/api/presentation-generation";
import { LanguageType, type PresentationConfig } from "../type";
import {
  getGenerationLanguageForLocale,
  normalizeGenerationLanguage,
} from "../../utils/pptGeneratorLanguage";
import {
  buildUploadActionSummary,
  buildUploadSnapshotProps,
  buildUploadStatusCards,
  getInitialPresentationConfig,
  INITIAL_LOADING_STATE,
  type LoadingState,
  STOCK_IMAGE_PROVIDERS,
} from "./uploadPageHelpers";

export function useUploadPageController() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useDispatch();
  const llmConfig = useSelector((state: RootState) => state.userConfig.llm_config);

  const [files, setFiles] = useState<File[]>([]);
  const [config, setConfig] = useState<PresentationConfig>(() => getInitialPresentationConfig(locale));
  const [loadingState, setLoadingState] = useState<LoadingState>(INITIAL_LOADING_STATE);
  const [aiConfig, setAiConfig] = useState<AIConfigResponse | null>(null);
  const hasManualLanguageOverrideRef = useRef(false);

  useEffect(() => {
    let active = true;
    aiConfigApi
      .get()
      .then((response) => {
        if (!active) {
          return;
        }
        setAiConfig(response);
      })
      .catch((error) => {
        console.error("Failed to load AI config for upload page:", error);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const nextLanguage = getGenerationLanguageForLocale(locale);
    setConfig((current) => {
      const normalizedLanguage = normalizeGenerationLanguage(current.language);
      if (hasManualLanguageOverrideRef.current && normalizedLanguage) {
        return current;
      }
      if (normalizedLanguage === nextLanguage) {
        return current;
      }
      return {
        ...current,
        language: nextLanguage,
      };
    });
  }, [locale]);

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

  const configuredProviders = useMemo(
    () => getConfiguredPptGeneratorProviders(aiConfig),
    [aiConfig]
  );
  const selectedProvider = useMemo(
    () => resolvePptGeneratorProviderOverride(aiConfig),
    [aiConfig]
  );
  useEffect(() => {
    const currentProvider =
      llmConfig.LLM === "anthropic"
        ? "claude"
        : (llmConfig.LLM as PptGeneratorSelectableProvider | undefined);
    if (!selectedProvider || currentProvider === selectedProvider) {
      return;
    }
    dispatch(setLLMConfig(applyPptGeneratorProviderOverride(llmConfig, selectedProvider)));
  }, [dispatch, llmConfig, selectedProvider]);
  const providerCards = useMemo(
    () => [
      {
        id: "openai" as const,
        label: "OpenAI",
        configured: Boolean(aiConfig?.openai?.api_key_set),
        model: aiConfig?.openai?.model || llmConfig.OPENAI_MODEL || "gpt-5.6",
      },
      {
        id: "claude" as const,
        label: "Claude",
        configured: Boolean(aiConfig?.claude?.api_key_set),
        model: aiConfig?.claude?.model || llmConfig.ANTHROPIC_MODEL || "claude-sonnet-5",
      },
      {
        id: "bigmodel" as const,
        label: "BigModel / GLM",
        configured: Boolean(aiConfig?.bigmodel?.api_key_set),
        model:
          aiConfig?.bigmodel?.text_model || llmConfig.BIGMODEL_MODEL || "glm-4.5-flash",
      },
      {
        id: "minimax" as const,
        label: "MiniMax",
        configured: Boolean(aiConfig?.minimax?.api_key_set),
        model:
          aiConfig?.minimax?.text_model || llmConfig.MINIMAX_MODEL || "MiniMax-M2.7",
      },
      {
        id: "deepseek" as const,
        label: "DeepSeek",
        configured: Boolean(aiConfig?.deepseek?.api_key_set),
        model:
          aiConfig?.deepseek?.model || llmConfig.DEEPSEEK_MODEL || "deepseek-v4-pro",
      },
    ],
    [aiConfig, llmConfig.ANTHROPIC_MODEL, llmConfig.BIGMODEL_MODEL, llmConfig.DEEPSEEK_MODEL, llmConfig.MINIMAX_MODEL, llmConfig.OPENAI_MODEL]
  );
  const generationDisabledReason = useMemo(() => {
    if (aiConfig && configuredProviders.length === 0) {
      return t("ppt_generator.upload.currentConfig.noneConfigured");
    }
    return null;
  }, [aiConfig, configuredProviders.length, t]);
  const multimodalSummary = useMemo(() => {
    const multimodalOptions = [
      aiConfig?.multimodal?.openai?.api_key_set
        ? `OpenAI (${aiConfig.multimodal.openai.model || "gpt-5.6"})`
        : null,
      aiConfig?.multimodal?.claude?.api_key_set
        ? `Claude (${aiConfig.multimodal.claude.model || "claude-sonnet-5"})`
        : null,
      aiConfig?.multimodal?.bigmodel?.api_key_set
        ? `BigModel (${aiConfig.multimodal.bigmodel.model || "glm-5v-flash"})`
        : null,
      aiConfig?.multimodal?.minimax?.api_key_set
        ? `MiniMax (${aiConfig.multimodal.minimax.model || "MiniMax-M3"})`
        : null,
    ].filter(Boolean);
    if (multimodalOptions.length === 0) {
      return "Not configured";
    }
    return multimodalOptions.join(" / ");
  }, [aiConfig]);

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

  const generationPathLabel =
    files.length > 0
      ? t("ppt_generator.upload.path.documents")
      : t("ppt_generator.upload.path.promptOnly");
  const nextStepLabel =
    files.length > 0
      ? t("ppt_generator.upload.next.documents")
      : t("ppt_generator.upload.next.outline");
  const primaryActionLabel =
    files.length > 0
      ? t("ppt_generator.upload.cta.documents")
      : t("ppt_generator.upload.cta.outline");

  const actionSummary = useMemo(
    () =>
      buildUploadActionSummary({
        inputReady: uploadSnapshotProps.has_prompt || files.length > 0,
        filesCount: files.length,
        nextStepLabel,
        t,
      }),
    [files.length, nextStepLabel, t, uploadSnapshotProps.has_prompt]
  );

  const statusCards = useMemo(
    () =>
      buildUploadStatusCards({
        generationPathLabel,
        slides: effectiveConfig.slides,
        language: effectiveConfig.language,
        t,
      }),
    [effectiveConfig.language, effectiveConfig.slides, generationPathLabel, t]
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
      if (key === "language") {
        hasManualLanguageOverrideRef.current = true;
      }
      setConfig((current) => ({ ...current, [key]: value } as PresentationConfig));
    },
    []
  );

  const handleFilesChange = useCallback((nextFiles: File[]) => {
    setFiles(nextFiles);
  }, []);

  const handleProviderSelect = useCallback(
    (provider: PptGeneratorSelectableProvider) => {
      if (!configuredProviders.includes(provider)) {
        return;
      }
      writeStoredPptGeneratorProviderOverride(provider);
      dispatch(setLLMConfig(applyPptGeneratorProviderOverride(llmConfig, provider)));
    },
    [configuredProviders, dispatch, llmConfig]
  );

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
        t("ppt_generator.upload.notify.imageUnavailable.title"),
        error?.message ||
          t("ppt_generator.upload.notify.imageUnavailable.body", {
            provider: selectedProvider,
          })
      );
      return false;
    }
  }, [llmConfig, t]);

  const validateConfiguration = useCallback((): boolean => {
    if (generationDisabledReason) {
      trackUploadValidationFailure("provider_not_configured");
      notify.warning(
        t("ppt_generator.upload.notify.providerRequired.title"),
        generationDisabledReason
      );
      return false;
    }

    if (!effectiveConfig.language) {
      trackUploadValidationFailure("language_missing");
      notify.warning(
        t("ppt_generator.upload.notify.languageRequired.title"),
        t("ppt_generator.upload.notify.languageRequired.body")
      );
      return false;
    }

    if (files.length > 0 && effectiveConfig.language === LanguageType.Auto) {
      trackUploadValidationFailure("language_auto_with_documents");
      notify.warning(
        t("ppt_generator.upload.notify.languageRequired.title"),
        t("ppt_generator.upload.notify.languageRequired.documents")
      );
      return false;
    }

    if (!effectiveConfig.prompt.trim() && files.length === 0) {
      trackUploadValidationFailure("prompt_or_document_missing");
      notify.warning(
        t("ppt_generator.upload.notify.inputRequired.title"),
        t("ppt_generator.upload.notify.inputRequired.body")
      );
      return false;
    }

    return true;
  }, [
    effectiveConfig.language,
    effectiveConfig.prompt,
    files.length,
    generationDisabledReason,
    trackUploadValidationFailure,
    t,
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
      t("ppt_generator.upload.notify.generationFailed.title"),
      error.message || t("ppt_generator.upload.notify.generationFailed.body")
    );
  }, [t]);

  const handleDocumentProcessing = useCallback(async () => {
    setLoadingState({
      isLoading: true,
      message: t("ppt_generator.upload.loading.documents"),
      showProgress: true,
      duration: 90,
      extra_info:
        files.length > 0 ? t("ppt_generator.upload.loading.documentsExtra") : "",
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
  }, [dispatch, effectiveConfig, files, pathname, router, t, uploadSnapshotProps]);

  const handleDirectPresentationGeneration = useCallback(async () => {
    setLoadingState({
      isLoading: true,
      message: t("ppt_generator.upload.loading.outlines"),
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
  }, [dispatch, effectiveConfig, pathname, router, t, uploadSnapshotProps]);

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
    llmConfig,
    loadingState,
    viewState: {
      actionSummary,
      generationDisabledReason,
      providerCards,
      primaryActionLabel,
      selectedProvider,
      statusCards,
      multimodalSummary,
    },
    actions: {
      handleConfigChange,
      handleFilesChange,
      handleGeneratePresentation,
      handleProviderSelect,
    },
  };
}
