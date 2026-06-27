"use client";

import { LLMConfig } from "@/types/llm_config";
import { type Locale } from "@/shared/i18n";
import { type TranslationKey } from "@/shared/i18n";

import {
  PresentationConfig,
  ToneType,
  VerbosityType,
} from "../type";
import {
  getGenerationLanguageForLocale,
  getGenerationLanguageLabel,
} from "../../utils/presentonLanguage";

export const STOCK_IMAGE_PROVIDERS = new Set(["pexels", "pixabay"]);

const FILE_TYPE_WORD = new Set([".doc", ".docx", ".docm", ".odt", ".rtf"]);
const FILE_TYPE_PRESENTATION = new Set([".ppt", ".pptx", ".pptm", ".odp"]);
const FILE_TYPE_SPREADSHEET = new Set([
  ".xls",
  ".xlsx",
  ".xlsm",
  ".ods",
  ".csv",
  ".tsv",
]);
const FILE_TYPE_IMAGE = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".tiff",
  ".webp",
]);
const FILE_MIME_IMAGE = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/bmp",
  "image/tiff",
  "image/webp",
]);
const FILE_TYPE_PDF = new Set([".pdf"]);
const FILE_TYPE_TEXT = new Set([".txt"]);

export interface LoadingState {
  isLoading: boolean;
  message: string;
  duration?: number;
  showProgress?: boolean;
  extra_info?: string;
}

export interface UploadSnapshotProps {
  [key: string]: unknown;
  pathname: string;
  generation_path: "documents" | "prompt_only";
  slides_selected: number | null;
  slides_mode: "selected" | "auto";
  language: string;
  tone: PresentationConfig["tone"];
  verbosity: PresentationConfig["verbosity"];
  include_table_of_contents: boolean;
  include_title_slide: boolean;
  web_search: boolean;
  has_prompt: boolean;
  prompt_char_count: number;
  prompt_word_count: number;
  has_instructions: boolean;
  instructions_char_count: number;
  has_attachments: boolean;
  attachments_count: number;
  attachment_categories: string;
  text_provider: string;
  text_model: string;
  image_generation_enabled: boolean;
  image_provider: string;
  image_quality: string;
}

export interface UploadActionItem {
  labelKey: TranslationKey;
  label: string;
  value: string;
}

export interface UploadStatusItem {
  labelKey: TranslationKey;
  label: string;
  value: string;
}

export function getInitialPresentationConfig(locale: Locale): PresentationConfig {
  return {
    slides: null,
    language: getGenerationLanguageForLocale(locale),
    prompt: "",
    tone: ToneType.Default,
    verbosity: VerbosityType.Standard,
    instructions: "",
    includeTableOfContents: false,
    includeTitleSlide: false,
    webSearch: false,
  };
}

export const INITIAL_PRESENTATION_CONFIG: PresentationConfig = getInitialPresentationConfig("en");

export const INITIAL_LOADING_STATE: LoadingState = {
  isLoading: false,
  message: "",
  duration: 4,
  showProgress: false,
  extra_info: "",
};

const getFileExtension = (fileName: string): string => {
  const index = fileName.lastIndexOf(".");
  if (index < 0) return "";
  return fileName.slice(index).toLowerCase();
};

export const getFileCategory = (file: File): string => {
  const extension = getFileExtension(file.name || "");
  if (FILE_TYPE_WORD.has(extension)) return "word";
  if (FILE_TYPE_PRESENTATION.has(extension)) return "presentation";
  if (FILE_TYPE_SPREADSHEET.has(extension)) return "spreadsheet";
  if (
    FILE_TYPE_IMAGE.has(extension) ||
    FILE_MIME_IMAGE.has((file.type || "").toLowerCase())
  ) {
    return "image";
  }
  if (FILE_TYPE_PDF.has(extension) || file.type === "application/pdf") {
    return "pdf";
  }
  if (FILE_TYPE_TEXT.has(extension) || file.type === "text/plain") {
    return "text";
  }
  return "other";
};

export const getSelectedTextModel = (config?: LLMConfig): string => {
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

export const getSelectedImageQuality = (config?: LLMConfig): string => {
  if (!config) return "";
  if (config.IMAGE_PROVIDER === "dall-e-3") {
    return config.DALL_E_3_QUALITY || "";
  }
  if (config.IMAGE_PROVIDER === "gpt-image-1.5") {
    return config.GPT_IMAGE_1_5_QUALITY || "";
  }
  return "";
};

export function buildUploadSnapshotProps({
  config,
  files,
  llmConfig,
  pathname,
}: {
  config: PresentationConfig;
  files: File[];
  llmConfig?: LLMConfig;
  pathname: string;
}): UploadSnapshotProps {
  const trimmedPrompt = config.prompt.trim();
  const trimmedInstructions = (config.instructions || "").trim();
  const attachmentCategories = Array.from(
    new Set(files.map(getFileCategory))
  ).sort();
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
    prompt_word_count: trimmedPrompt
      ? trimmedPrompt.split(/\s+/).filter(Boolean).length
      : 0,
    has_instructions: Boolean(trimmedInstructions),
    instructions_char_count: trimmedInstructions.length,
    has_attachments: files.length > 0,
    attachments_count: files.length,
    attachment_categories: attachmentCategories.join(","),
    text_provider: llmConfig?.LLM || "",
    text_model: getSelectedTextModel(llmConfig),
    image_generation_enabled: imageGenerationEnabled,
    image_provider: imageGenerationEnabled
      ? llmConfig?.IMAGE_PROVIDER || ""
      : "disabled",
    image_quality: imageGenerationEnabled
      ? getSelectedImageQuality(llmConfig)
      : "",
  };
}

export function buildUploadActionSummary({
  inputReady,
  filesCount,
  nextStepLabel,
  t,
}: {
  inputReady: boolean;
  filesCount: number;
  nextStepLabel: string;
  t: (key: TranslationKey) => string;
}): UploadActionItem[] {
  return [
    {
      labelKey: "presenton.upload.summary.inputReady",
      label: t("presenton.upload.summary.inputReady"),
      value: inputReady
        ? t("presenton.upload.summary.inputReady.ready")
        : t("presenton.upload.summary.inputReady.empty"),
    },
    {
      labelKey: "presenton.upload.summary.attachments",
      label: t("presenton.upload.summary.attachments"),
      value:
        filesCount > 0
          ? t("presenton.upload.summary.attachments.count", { count: filesCount })
          : t("presenton.upload.summary.attachments.optional"),
    },
    {
      labelKey: "presenton.upload.summary.nextStep",
      label: t("presenton.upload.summary.nextStep"),
      value: nextStepLabel,
    },
  ];
}

export function buildUploadStatusCards({
  generationPathLabel,
  slides,
  language,
  t,
}: {
  generationPathLabel: string;
  slides: string | null;
  language: string | null;
  t: (key: TranslationKey) => string;
}): UploadStatusItem[] {
  return [
    {
      labelKey: "presenton.upload.status.path",
      label: t("presenton.upload.status.path"),
      value: generationPathLabel,
    },
    {
      labelKey: "presenton.upload.status.slides",
      label: t("presenton.upload.status.slides"),
      value: slides
        ? t("presenton.upload.status.slides.count", { count: slides })
        : t("presenton.upload.status.slides.auto"),
    },
    {
      labelKey: "presenton.upload.status.language",
      label: t("presenton.upload.status.language"),
      value: getGenerationLanguageLabel(language) || t("presenton.upload.status.language.auto"),
    },
  ];
}
