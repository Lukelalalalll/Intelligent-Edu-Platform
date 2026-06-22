/**
 * UploadPage Component
 * 
 * This component handles the presentation generation upload process, allowing users to:
 * - Configure presentation settings (slides, language)
 * - Input prompts
 * - Upload supporting documents
 * 
 * @component
 */

"use client";
import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { clearOutlines, setPresentationId } from "@/store/slices/presentationGeneration";
import { PromptInput } from "./PromptInput";
import { LanguageType, PresentationConfig, ToneType, VerbosityType } from "../type";
import SupportingDoc from "./SupportingDoc";
import { ArrowRight, Paperclip, Sparkles } from "lucide-react";
import { notify } from "@/components/ui/sonner";
import { PresentationGenerationApi } from "../../services/api/presentation-generation";
import { OverlayLoader } from "@/components/ui/overlay-loader";
import { setPptGenUploadState } from "@/store/slices/presentationGenUpload";
import { trackEvent, MixpanelEvent } from "@/utils/mixpanel";
import { ConfigurationSelects } from "./ConfigurationSelects";
import { RootState } from "@/store/store";
import { ImagesApi } from "../../services/api/images";
import CurrentConfig from "./CurrentConfig";
import { LLMConfig } from "@/types/llm_config";
import WelcomeBanner from "@/shared/components/WelcomeBanner";
import Card from "@/shared/components/Card/Card";
import Button from "@/shared/components/Button/Button";
import styles from "./UploadPage.module.css";

const STOCK_IMAGE_PROVIDERS = new Set(["pexels", "pixabay"]);
const FILE_TYPE_WORD = new Set([".doc", ".docx", ".docm", ".odt", ".rtf"]);
const FILE_TYPE_PRESENTATION = new Set([".ppt", ".pptx", ".pptm", ".odp"]);
const FILE_TYPE_SPREADSHEET = new Set([".xls", ".xlsx", ".xlsm", ".ods", ".csv", ".tsv"]);
const FILE_TYPE_IMAGE = new Set([".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".webp"]);
const FILE_MIME_IMAGE = new Set(["image/jpeg", "image/png", "image/gif", "image/bmp", "image/tiff", "image/webp"]);
const FILE_TYPE_PDF = new Set([".pdf"]);
const FILE_TYPE_TEXT = new Set([".txt"]);

// Types for loading state
interface LoadingState {
  isLoading: boolean;
  message: string;
  duration?: number;
  showProgress?: boolean;
  extra_info?: string;
}

const getFileExtension = (fileName: string): string => {
  const index = fileName.lastIndexOf(".");
  if (index < 0) return "";
  return fileName.slice(index).toLowerCase();
};

const getFileCategory = (file: File): string => {
  const extension = getFileExtension(file.name || "");
  if (FILE_TYPE_WORD.has(extension)) return "word";
  if (FILE_TYPE_PRESENTATION.has(extension)) return "presentation";
  if (FILE_TYPE_SPREADSHEET.has(extension)) return "spreadsheet";
  if (FILE_TYPE_IMAGE.has(extension) || FILE_MIME_IMAGE.has((file.type || "").toLowerCase())) return "image";
  if (FILE_TYPE_PDF.has(extension) || file.type === "application/pdf") return "pdf";
  if (FILE_TYPE_TEXT.has(extension) || file.type === "text/plain") return "text";
  return "other";
};

const getSelectedTextModel = (config?: LLMConfig): string => {
  if (!config) return "";
  switch (config.LLM) {
    case "openai":
      return config.OPENAI_MODEL || "";
    case "deepseek":
      return config.DEEPSEEK_MODEL || "";
    case "google":
      return config.GOOGLE_MODEL || "";
    case "vertex":
      return config.VERTEX_MODEL || "";
    case "azure":
      return config.AZURE_OPENAI_MODEL || "";
    case "bedrock":
      return config.BEDROCK_MODEL || "";
    case "openrouter":
      return config.OPENROUTER_MODEL || "";
    case "fireworks":
      return config.FIREWORKS_MODEL || "";
    case "together":
      return config.TOGETHER_MODEL || "";
    case "cerebras":
      return config.CEREBRAS_MODEL || "";
    case "litellm":
      return config.LITELLM_MODEL || "";
    case "lmstudio":
      return config.LMSTUDIO_MODEL || "";
    case "anthropic":
      return config.ANTHROPIC_MODEL || "";
    case "ollama":
      return config.OLLAMA_MODEL || "";
    case "custom":
      return config.CUSTOM_MODEL || "";
    case "codex":
      return config.CODEX_MODEL || "";
    default:
      return "";
  }
};

const getSelectedImageQuality = (config?: LLMConfig): string => {
  if (!config) return "";
  if (config.IMAGE_PROVIDER === "dall-e-3") return config.DALL_E_3_QUALITY || "";
  if (config.IMAGE_PROVIDER === "gpt-image-1.5") return config.GPT_IMAGE_1_5_QUALITY || "";
  return "";
};

const UploadPage = () => {
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useDispatch();
  const llmConfig = useSelector((state: RootState) => state.userConfig.llm_config);

  const [files, setFiles] = useState<File[]>([]);
  const [config, setConfig] = useState<PresentationConfig>({
    slides: null,
    language: LanguageType.Auto,
    prompt: "",
    tone: ToneType.Default,
    verbosity: VerbosityType.Standard,
    instructions: "",
    includeTableOfContents: false,
    includeTitleSlide: false,
    webSearch: false,
  });

  useEffect(() => {
    if (llmConfig?.WEB_GROUNDING !== undefined) {
      setConfig((current) => ({
        ...current,
        webSearch: !!llmConfig.WEB_GROUNDING,
      }));
    }
  }, [llmConfig?.WEB_GROUNDING]);

  const [loadingState, setLoadingState] = useState<LoadingState>({
    isLoading: false,
    message: "",
    duration: 4,
    showProgress: false,
    extra_info: "",
  });

  const getUploadSnapshotProps = () => {
    const trimmedPrompt = config.prompt.trim();
    const trimmedInstructions = (config.instructions || "").trim();
    const attachmentCategories = Array.from(new Set(files.map(getFileCategory))).sort();
    const imageGenerationEnabled = !llmConfig?.DISABLE_IMAGE_GENERATION;
    const parsedSlides =
      config.slides && /^\d+$/.test(config.slides) ? Number(config.slides) : null;

    return {
      pathname,
      generation_path: files.length > 0 ? "documents" : "prompt_only",
      slides_selected: parsedSlides,
      slides_mode: config.slides ? "selected" : "auto",
      language: config.language || "",
      tone: config.tone,
      verbosity: config.verbosity,
      include_table_of_contents: !!config.includeTableOfContents,
      include_title_slide: !!config.includeTitleSlide,
      web_search: !!config.webSearch,
      has_prompt: Boolean(trimmedPrompt),
      prompt_char_count: trimmedPrompt.length,
      prompt_word_count: trimmedPrompt ? trimmedPrompt.split(/\s+/).filter(Boolean).length : 0,
      has_instructions: Boolean(trimmedInstructions),
      instructions_char_count: trimmedInstructions.length,
      has_attachments: files.length > 0,
      attachments_count: files.length,
      attachment_categories: attachmentCategories.join(","),
      text_provider: llmConfig?.LLM || "",
      text_model: getSelectedTextModel(llmConfig),
      image_generation_enabled: imageGenerationEnabled,
      image_provider: imageGenerationEnabled ? (llmConfig?.IMAGE_PROVIDER || "") : "disabled",
      image_quality: imageGenerationEnabled ? getSelectedImageQuality(llmConfig) : "",
    };
  };

  const trackUploadValidationFailure = (reason: string) => {
    trackEvent(MixpanelEvent.Upload_Configuration_Invalid, {
      ...getUploadSnapshotProps(),
      reason,
    });
  };

  const handleConfigChange = (key: keyof PresentationConfig, value: unknown) => {
    setConfig((prev) => ({ ...prev, [key]: value } as PresentationConfig));
  };

  const ensureStockImageProviderReady = async (): Promise<boolean> => {
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
  };

  /**
   * Validates the current configuration and files
   * @returns boolean indicating if the configuration is valid
   */
  const validateConfiguration = (): boolean => {
    if (!config.language) {
      trackUploadValidationFailure("language_missing");
      notify.warning("Language required", "Please select a language.");
      return false;
    }

    if (files.length > 0 && config.language === LanguageType.Auto) {
      trackUploadValidationFailure("language_auto_with_documents");
      notify.warning("Language required", "Please choose a language before processing uploaded documents.");
      return false;
    }

    if (!config.prompt.trim() && files.length === 0) {
      trackUploadValidationFailure("prompt_or_document_missing");
      notify.warning("Input required", "Provide a prompt or upload at least one document.");
      return false;
    }
    return true;
  };

  /**
   * Handles the presentation generation process
   */
  const handleGeneratePresentation = async () => {
    if (!validateConfiguration()) return;
    trackEvent(MixpanelEvent.Upload_Generation_Started, getUploadSnapshotProps());


    const isStockProviderReady = await ensureStockImageProviderReady();
    if (!isStockProviderReady) {
      trackUploadValidationFailure("stock_image_provider_unreachable");
      return;
    }

    try {
      const hasUploadedAssets = files.length > 0;

      if (hasUploadedAssets) {
        await handleDocumentProcessing();
      } else {
        await handleDirectPresentationGeneration();
      }
    } catch (error) {
      handleGenerationError(error);
    }
  };

  /**
   * Handles document processing
   */
  const handleDocumentProcessing = async () => {
    setLoadingState({
      isLoading: true,
      message: "Processing documents...",
      showProgress: true,
      duration: 90,
      extra_info: files.length > 0 ? "It might take a few minutes for large documents." : "",
    });

    let documents = [];

    if (files.length > 0) {
      const uploadResponse = await PresentationGenerationApi.uploadDoc(files);
      documents = uploadResponse;
    }

    const selectedLanguage = config?.language ?? "";

    const promises: Promise<any>[] = [];

    if (documents.length > 0) {
      promises.push(
        PresentationGenerationApi.decomposeDocuments(
          documents,
          selectedLanguage
        )
      );
    }
    const responses = await Promise.all(promises);
    dispatch(setPptGenUploadState({
      config,
      files: responses,
    }));
    dispatch(clearOutlines())
    trackEvent(MixpanelEvent.Upload_Documents_Processed, {
      ...getUploadSnapshotProps(),
      uploaded_documents_count: documents.length,
      decompose_job_count: responses.length,
      destination: "/documents-preview",
    });
    trackEvent(MixpanelEvent.Navigation, { from: pathname, to: "/documents-preview" });
    router.push("/documents-preview");
  };

  /**
   * Handles direct presentation generation without documents
   */
  const handleDirectPresentationGeneration = async () => {
    setLoadingState({
      isLoading: true,
      message: "Generating outlines...",
      showProgress: true,
      duration: 30,
    });

    const selectedLanguage = config?.language ?? "";

    // Use the first available layout group for direct generation
    const createResponse = await PresentationGenerationApi.createPresentation({
      content: config?.prompt ?? "",
      n_slides: config?.slides ? parseInt(config.slides, 10) : null,
      file_paths: [],
      language: selectedLanguage,
      tone: config?.tone,
      verbosity: config?.verbosity,
      instructions: config?.instructions || null,
      include_table_of_contents: !!config?.includeTableOfContents,
      include_title_slide: !!config?.includeTitleSlide,
      web_search: !!config?.webSearch,
    });


    dispatch(setPresentationId(createResponse.id));
    dispatch(clearOutlines())
    trackEvent(MixpanelEvent.Upload_Outline_Generation_Requested, {
      ...getUploadSnapshotProps(),
      presentation_id: createResponse.id,
      destination: "/outline",
    });
    trackEvent(MixpanelEvent.Navigation, { from: pathname, to: "/outline" });
    router.push("/outline");
  };

  /**
   * Handles errors during presentation generation
   */
  const handleGenerationError = (error: any) => {
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
  };

  const hasPrompt = config.prompt.trim().length > 0;
  const generationPathLabel = files.length > 0 ? "Document-assisted" : "Prompt only";
  const nextStepLabel = files.length > 0 ? "Documents preview" : "Outline builder";
  const primaryActionLabel = files.length > 0 ? "Next: Review documents" : "Next: Generate outline";

  return (
    <div className={styles.page}>
      <OverlayLoader
        show={loadingState.isLoading}
        text={loadingState.message}
        showProgress={loadingState.showProgress}
        duration={loadingState.duration}
        extra_info={loadingState.extra_info}
      />
      <div className={styles.container}>
        <WelcomeBanner
          className={styles.banner}
          title="Generate a Presentation"
          subtitle="Start with a concise brief or a few supporting files, then refine the outline before the full deck is generated."
          variant="workspace"
        />

        <div className={styles.workspaceGrid}>
          <Card glass className={`${styles.sectionCard} ${styles.promptCard}`}>
            <div className={styles.promptBody}>
              <PromptInput
                value={config.prompt}
                onChange={(value) => handleConfigChange("prompt", value)}
              />

              <div className={styles.promptAttachments}>
                <div className={styles.subsectionHeader}>
                  <div className={styles.subsectionIcon}>
                    <Paperclip className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className={styles.subsectionTitle}>Attach source material</h3>
                  </div>
                </div>

                <SupportingDoc
                  files={[...files]}
                  onFilesChange={setFiles}
                />
              </div>
            </div>
          </Card>

          <Card glass className={`${styles.sectionCard} ${styles.setupCard}`}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}>
                <Sparkles />
              </div>
              <div>
                <p className={styles.sectionEyebrow}>Workspace</p>
                <h2 className={styles.sectionTitle}>Current AI setup</h2>
                <p className={styles.sectionDescription}>
                  This page now uses your saved project providers and model settings directly, so Presenton feels like part of the same workflow.
                </p>
              </div>
            </div>

            <div className={styles.setupBody}>
              <CurrentConfig webSearchEnabled={config.webSearch} />
              <div className={styles.promptFooter}>
                <div className={styles.actionSummary}>
                  <div className={styles.actionItem}>
                    <span>Input ready</span>
                    <strong>{hasPrompt || files.length > 0 ? "Ready to generate" : "Add a prompt or file"}</strong>
                  </div>
                  <div className={styles.actionItem}>
                    <span>Attachments</span>
                    <strong>{files.length > 0 ? `${files.length} file${files.length > 1 ? "s" : ""} attached` : "Optional"}</strong>
                  </div>
                  <div className={styles.actionItem}>
                    <span>Next step</span>
                    <strong>{nextStepLabel}</strong>
                  </div>
                </div>

                <Button
                  onClick={handleGeneratePresentation}
                  disabled={loadingState.isLoading}
                  className={styles.primaryAction}
                >
                  <span>{primaryActionLabel}</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
              <div className={styles.statusGrid}>
                <div className={styles.statusCard}>
                  <span className={styles.statusLabel}>Generation path</span>
                  <div className={styles.statusValue}>{generationPathLabel}</div>
                </div>
                <div className={styles.statusCard}>
                  <span className={styles.statusLabel}>Slide target</span>
                  <div className={styles.statusValue}>{config.slides ? `${config.slides} slides` : "Auto"}</div>
                </div>
                <div className={styles.statusCard}>
                  <span className={styles.statusLabel}>Language</span>
                  <div className={styles.statusValue}>{config.language || "Auto"}</div>
                </div>
              </div>
              <div className={styles.controlsBody}>
                <ConfigurationSelects
                  config={config}
                  onConfigChange={handleConfigChange}
                />
                <p className={styles.controlsNote}>
                  Prompt-only runs jump straight into outline generation. Adding source files keeps the flow grounded and sends you through document preview first.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default UploadPage;
