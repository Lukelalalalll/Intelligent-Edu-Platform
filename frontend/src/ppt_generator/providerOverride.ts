import type { AIConfigResponse } from "@/features/ai-config/api/aiConfigApi";
import type { LLMConfig } from "@/types/llm_config";

export type PptGeneratorSelectableProvider = "openai" | "claude" | "deepseek" | "bigmodel" | "minimax";
export type PptGeneratorSelectableMultimodalProvider = "openai" | "bigmodel" | "minimax";
type ProviderAvailabilityConfig = Pick<AIConfigResponse, "openai" | "claude" | "deepseek" | "bigmodel" | "minimax">;
type MultimodalAvailabilityConfig = Pick<AIConfigResponse, "multimodal">;

const STORAGE_KEY = "ppt_generator_provider_override";
const MULTIMODAL_STORAGE_KEY = "ppt_generator_multimodal_provider_override";

function isProvider(value: unknown): value is PptGeneratorSelectableProvider {
  return value === "openai" || value === "claude" || value === "deepseek" || value === "bigmodel" || value === "minimax";
}

function isMultimodalProvider(
  value: unknown
): value is PptGeneratorSelectableMultimodalProvider {
  return value === "openai" || value === "bigmodel" || value === "minimax";
}

export function getConfiguredPptGeneratorProviders(
  aiConfig: ProviderAvailabilityConfig | null | undefined
): PptGeneratorSelectableProvider[] {
  const providers: PptGeneratorSelectableProvider[] = [];
  if (aiConfig?.openai?.api_key_set) {
    providers.push("openai");
  }
  if (aiConfig?.claude?.api_key_set) {
    providers.push("claude");
  }
  if (aiConfig?.deepseek?.api_key_set) {
    providers.push("deepseek");
  }
  if (aiConfig?.bigmodel?.api_key_set) {
    providers.push("bigmodel");
  }
  if (aiConfig?.minimax?.api_key_set) {
    providers.push("minimax");
  }
  return providers;
}

export function readStoredPptGeneratorProviderOverride():
  | PptGeneratorSelectableProvider
  | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.sessionStorage.getItem(STORAGE_KEY);
  return isProvider(value) ? value : null;
}

export function writeStoredPptGeneratorProviderOverride(
  provider: PptGeneratorSelectableProvider
): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(STORAGE_KEY, provider);
}

export function clearStoredPptGeneratorProviderOverride(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(STORAGE_KEY);
}

export function resolvePptGeneratorProviderOverride(
  aiConfig: ProviderAvailabilityConfig | null | undefined
): PptGeneratorSelectableProvider | null {
  const configured = getConfiguredPptGeneratorProviders(aiConfig);
  if (configured.length === 0) {
    clearStoredPptGeneratorProviderOverride();
    return null;
  }

  const stored = readStoredPptGeneratorProviderOverride();
  if (stored && configured.includes(stored)) {
    return stored;
  }

  const fallback = configured[0];
  writeStoredPptGeneratorProviderOverride(fallback);
  return fallback;
}

export function applyPptGeneratorProviderOverride(
  hostConfig: LLMConfig,
  provider: PptGeneratorSelectableProvider | null
): LLMConfig {
  if (!provider) {
    return { ...hostConfig };
  }

  return {
    ...hostConfig,
    LLM: provider === "claude" ? "anthropic" : provider,
  };
}

export function getPptGeneratorProviderRequestValue():
  | PptGeneratorSelectableProvider
  | null {
  const stored = readStoredPptGeneratorProviderOverride();
  return stored ?? null;
}

export function appendPptGeneratorProviderParam(url: string): string {
  const provider = getPptGeneratorProviderRequestValue();
  if (!provider) {
    return url;
  }

  const resolved = new URL(
    url,
    typeof window !== "undefined" ? window.location.origin : "http://localhost"
  );
  resolved.searchParams.set("ppt_generator_provider", provider);
  return resolved.toString();
}

export function getConfiguredPptGeneratorMultimodalProviders(
  aiConfig: MultimodalAvailabilityConfig | null | undefined
): PptGeneratorSelectableMultimodalProvider[] {
  const providers: PptGeneratorSelectableMultimodalProvider[] = [];
  if (aiConfig?.multimodal?.openai?.api_key_set) {
    providers.push("openai");
  }
  if (aiConfig?.multimodal?.bigmodel?.api_key_set) {
    providers.push("bigmodel");
  }
  if (aiConfig?.multimodal?.minimax?.api_key_set) {
    providers.push("minimax");
  }
  return providers;
}

export function readStoredPptGeneratorMultimodalProviderOverride():
  | PptGeneratorSelectableMultimodalProvider
  | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.sessionStorage.getItem(MULTIMODAL_STORAGE_KEY);
  return isMultimodalProvider(value) ? value : null;
}

export function writeStoredPptGeneratorMultimodalProviderOverride(
  provider: PptGeneratorSelectableMultimodalProvider
): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(MULTIMODAL_STORAGE_KEY, provider);
}

export function clearStoredPptGeneratorMultimodalProviderOverride(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(MULTIMODAL_STORAGE_KEY);
}

export function resolvePptGeneratorMultimodalProviderOverride(
  aiConfig: MultimodalAvailabilityConfig | null | undefined
): PptGeneratorSelectableMultimodalProvider | null {
  const configured = getConfiguredPptGeneratorMultimodalProviders(aiConfig);
  if (configured.length === 0) {
    clearStoredPptGeneratorMultimodalProviderOverride();
    return null;
  }

  const stored = readStoredPptGeneratorMultimodalProviderOverride();
  if (stored && configured.includes(stored)) {
    return stored;
  }

  const fallback = configured[0];
  writeStoredPptGeneratorMultimodalProviderOverride(fallback);
  return fallback;
}

export function getPptGeneratorMultimodalHeaders(
  provider: PptGeneratorSelectableMultimodalProvider | null
): Record<string, string> {
  if (!provider) {
    return {};
  }

  return {
    "X-Ppt-Generator-Capability": "multimodal",
    "X-Ppt-Generator-Multimodal-Provider": provider,
  };
}
