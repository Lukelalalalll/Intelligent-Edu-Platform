import type { AIConfigResponse } from "@/features/ai-config/api/aiConfigApi";
import type { LLMConfig } from "@/types/llm_config";

export type PresentonSelectableProvider = "openai" | "deepseek";

const STORAGE_KEY = "presenton_provider_override";

function isProvider(value: unknown): value is PresentonSelectableProvider {
  return value === "openai" || value === "deepseek";
}

export function getConfiguredPresentonProviders(
  aiConfig: AIConfigResponse | null | undefined
): PresentonSelectableProvider[] {
  const providers: PresentonSelectableProvider[] = [];
  if (aiConfig?.openai?.api_key_set) {
    providers.push("openai");
  }
  if (aiConfig?.deepseek?.api_key_set) {
    providers.push("deepseek");
  }
  return providers;
}

export function readStoredPresentonProviderOverride():
  | PresentonSelectableProvider
  | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.sessionStorage.getItem(STORAGE_KEY);
  return isProvider(value) ? value : null;
}

export function writeStoredPresentonProviderOverride(
  provider: PresentonSelectableProvider
): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(STORAGE_KEY, provider);
}

export function clearStoredPresentonProviderOverride(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(STORAGE_KEY);
}

export function resolvePresentonProviderOverride(
  aiConfig: AIConfigResponse | null | undefined
): PresentonSelectableProvider | null {
  const configured = getConfiguredPresentonProviders(aiConfig);
  if (configured.length === 0) {
    clearStoredPresentonProviderOverride();
    return null;
  }

  const stored = readStoredPresentonProviderOverride();
  if (stored && configured.includes(stored)) {
    return stored;
  }

  const fallback = configured[0];
  writeStoredPresentonProviderOverride(fallback);
  return fallback;
}

export function applyPresentonProviderOverride(
  hostConfig: LLMConfig,
  provider: PresentonSelectableProvider | null
): LLMConfig {
  if (!provider) {
    return { ...hostConfig };
  }

  return {
    ...hostConfig,
    LLM: provider,
  };
}

export function getPresentonProviderRequestValue():
  | PresentonSelectableProvider
  | null {
  const stored = readStoredPresentonProviderOverride();
  return stored ?? null;
}

export function appendPresentonProviderParam(url: string): string {
  const provider = getPresentonProviderRequestValue();
  if (!provider) {
    return url;
  }

  const resolved = new URL(
    url,
    typeof window !== "undefined" ? window.location.origin : "http://localhost"
  );
  resolved.searchParams.set("presenton_provider", provider);
  return resolved.toString();
}
