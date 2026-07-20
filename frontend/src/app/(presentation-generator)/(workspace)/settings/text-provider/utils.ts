import { LLMConfig } from "@/types/llm_config";
import {
  LLMProviderOption,
  LLM_PROVIDERS,
} from "@/utils/providerConstants";
import { TextProviderField, TextProviderInputChange } from "./types";

const PROVIDER_MODEL_FIELDS: Record<string, TextProviderField> = {
  openai: "OPENAI_MODEL",
  deepseek: "DEEPSEEK_MODEL",
  bigmodel: "BIGMODEL_MODEL",
  minimax: "MINIMAX_MODEL",
  google: "GOOGLE_MODEL",
  vertex: "VERTEX_MODEL",
  azure: "AZURE_OPENAI_MODEL",
  bedrock: "BEDROCK_MODEL",
  openrouter: "OPENROUTER_MODEL",
  fireworks: "FIREWORKS_MODEL",
  together: "TOGETHER_MODEL",
  cerebras: "CEREBRAS_MODEL",
  litellm: "LITELLM_MODEL",
  lmstudio: "LMSTUDIO_MODEL",
  anthropic: "ANTHROPIC_MODEL",
  ollama: "OLLAMA_MODEL",
  custom: "CUSTOM_MODEL",
  codex: "CODEX_MODEL",
};

const PROVIDER_API_KEY_FIELDS: Record<string, TextProviderField> = {
  openai: "OPENAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  bigmodel: "BIGMODEL_API_KEY",
  minimax: "MINIMAX_API_KEY",
  google: "GOOGLE_API_KEY",
  vertex: "VERTEX_API_KEY",
  azure: "AZURE_OPENAI_API_KEY",
  bedrock: "BEDROCK_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  fireworks: "FIREWORKS_API_KEY",
  together: "TOGETHER_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  litellm: "LITELLM_API_KEY",
  lmstudio: "LMSTUDIO_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  custom: "CUSTOM_LLM_API_KEY",
};

const PROVIDER_API_KEY_LABELS: Record<string, string> = {
  custom: "Custom LLM API Key",
  deepseek: "DeepSeek API Key",
  bigmodel: "BigModel API Key",
  minimax: "MiniMax API Key",
  vertex: "Vertex API Key",
  azure: "Azure OpenAI API Key",
  bedrock: "Bedrock API Key (optional)",
  openrouter: "OpenRouter API Key",
  fireworks: "Fireworks API Key",
  together: "Together API Key",
  cerebras: "Cerebras API Key",
  litellm: "LiteLLM API key (optional)",
  lmstudio: "LM Studio API key (optional)",
};

const PROVIDER_DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-4.1",
  deepseek: "deepseek-chat",
  bigmodel: "glm-4.5-flash",
  minimax: "MiniMax-M2.7",
  google: "models/gemini-2.5-flash",
  anthropic: "claude-sonnet-4-20250514",
  openrouter: "openai/gpt-4o",
  fireworks: "accounts/fireworks/models/llama-v3p1-8b-instruct",
  together: "openai/gpt-oss-20b",
  cerebras: "llama-3.3-70b",
  litellm: "gpt-4.1",
  lmstudio: "openai/gpt-oss-20b",
};

const API_KEY_REQUIRED_PROVIDERS = new Set([
  "openai",
  "deepseek",
  "bigmodel",
  "minimax",
  "google",
  "anthropic",
  "openrouter",
  "fireworks",
  "together",
  "cerebras",
]);

export const MANUAL_MODEL_PROVIDERS = new Set([
  "vertex",
  "azure",
  "bedrock",
]);

const AUTO_MODEL_DISABLED_PROVIDERS = new Set([
  ...MANUAL_MODEL_PROVIDERS,
  "codex",
  "ollama",
]);

export const getSelectedProvider = (llmConfig: LLMConfig) =>
  llmConfig.LLM || "openai";

export const getProviderMeta = (
  provider: string
): LLMProviderOption | undefined => LLM_PROVIDERS[provider];

export const getProviderModelField = (provider: string) =>
  PROVIDER_MODEL_FIELDS[provider] || "";

export const getProviderApiKeyField = (provider: string) =>
  PROVIDER_API_KEY_FIELDS[provider] || "";

export const getProviderApiKeyLabel = (provider: string) =>
  PROVIDER_API_KEY_LABELS[provider] || `${provider} API Key`;

export const getProviderModelLabel = (
  provider: string,
  providerMeta?: LLMProviderOption
) => providerMeta?.label || provider;

export const getConfigString = (
  llmConfig: LLMConfig,
  field: string
): string => {
  if (!field) {
    return "";
  }

  const value = (llmConfig as Record<string, unknown>)[field];
  return typeof value === "string" ? value : "";
};

export const canFetchProviderModels = ({
  selectedProvider,
  currentApiKey,
  currentCustomUrl,
  currentLitellmUrl,
}: {
  selectedProvider: string;
  currentApiKey: string;
  currentCustomUrl: string;
  currentLitellmUrl: string;
}) => {
  if (MANUAL_MODEL_PROVIDERS.has(selectedProvider)) {
    return false;
  }

  if (API_KEY_REQUIRED_PROVIDERS.has(selectedProvider)) {
    return !!currentApiKey;
  }

  if (selectedProvider === "custom") {
    return !!currentCustomUrl;
  }

  if (selectedProvider === "litellm") {
    return !!currentLitellmUrl;
  }

  return true;
};

export const shouldUseAutoModelLookup = (selectedProvider: string) =>
  !AUTO_MODEL_DISABLED_PROVIDERS.has(selectedProvider);

export const getOpenAiCompatibleUrl = ({
  selectedProvider,
  selectedProviderMeta,
  currentCustomUrl,
  currentDeepseekBaseUrl,
  currentBigModelBaseUrl,
  currentMiniMaxBaseUrl,
  currentLitellmUrl,
  currentLmStudioUrl,
  currentFireworksUrl,
  currentTogetherUrl,
}: {
  selectedProvider: string;
  selectedProviderMeta?: LLMProviderOption;
  currentCustomUrl: string;
  currentDeepseekBaseUrl: string;
  currentBigModelBaseUrl: string;
  currentMiniMaxBaseUrl: string;
  currentLitellmUrl: string;
  currentLmStudioUrl: string;
  currentFireworksUrl: string;
  currentTogetherUrl: string;
}) => {
  if (selectedProvider === "custom") {
    return currentCustomUrl;
  }

  if (selectedProvider === "deepseek") {
    return currentDeepseekBaseUrl || selectedProviderMeta?.url || "";
  }

  if (selectedProvider === "bigmodel") {
    return currentBigModelBaseUrl || selectedProviderMeta?.url || "";
  }

  if (selectedProvider === "minimax") {
    return currentMiniMaxBaseUrl || selectedProviderMeta?.url || "";
  }

  if (selectedProvider === "litellm") {
    return currentLitellmUrl;
  }

  if (selectedProvider === "lmstudio") {
    return currentLmStudioUrl || selectedProviderMeta?.url || "";
  }

  if (selectedProvider === "fireworks") {
    return currentFireworksUrl || selectedProviderMeta?.url || "";
  }

  if (selectedProvider === "together") {
    return currentTogetherUrl || selectedProviderMeta?.url || "";
  }

  return selectedProviderMeta?.url || "";
};

export const pickPreferredModel = (
  selectedProvider: string,
  modelValues: string[]
) => {
  const preferredDefault = PROVIDER_DEFAULT_MODELS[selectedProvider];
  if (preferredDefault && modelValues.includes(preferredDefault)) {
    return preferredDefault;
  }

  return modelValues[0] || "";
};

export const applyConfigPatch = (
  onInputChange: TextProviderInputChange,
  patch: Record<string, unknown>
) => {
  for (const [field, value] of Object.entries(patch)) {
    if (value !== undefined) {
      onInputChange(value as string, field);
    }
  }
};
