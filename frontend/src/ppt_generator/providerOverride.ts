import type { AIConfigResponse } from "@/features/ai-config/api/aiConfigApi";
import type { LLMConfig } from "@/types/llm_config";

export type PptGeneratorSelectableProvider = "openai" | "deepseek";

const STORAGE_KEY = "ppt_generator_provider_override";

function isProvider(value: unknown): value is PptGeneratorSelectableProvider {
  return value === "openai" || value === "deepseek";
}

export function getConfiguredPptGeneratorProviders(
  aiConfig: AIConfigResponse | null | undefined
): PptGeneratorSelectableProvider[] {
  const providers: PptGeneratorSelectableProvider[] = [];
  if (aiConfig?.openai?.api_key_set) {
    providers.push("openai");
  }
  if (aiConfig?.deepseek?.api_key_set) {
    providers.push("deepseek");
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
  aiConfig: AIConfigResponse | null | undefined
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
    LLM: provider,
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

