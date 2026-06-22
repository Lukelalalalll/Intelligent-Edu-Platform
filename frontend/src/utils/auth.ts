export function isTruthyAuthValue(value?: string | null): boolean {
  const raw = value?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function getDisableAuthValue(): string | undefined {
  const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};
  return viteEnv.VITE_DISABLE_AUTH || viteEnv.DISABLE_AUTH;
}

export function isAuthDisabled(): boolean {
  return isTruthyAuthValue(getDisableAuthValue());
}
