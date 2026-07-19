/** Interprets common environment flag values as enabled auth bypasses. */
export function isTruthyAuthValue(value?: string | null): boolean {
  const raw = value?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/** Reads the auth-disable flag from Vite-compatible runtime env values. */
export function getDisableAuthValue(): string | undefined {
  const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | boolean | undefined> }).env || {};
  if (
    viteEnv.PROD === true ||
    viteEnv.MODE === "production" ||
    viteEnv.VITE_APP_ENV === "production" ||
    viteEnv.NEXT_PUBLIC_APP_ENV === "production"
  ) {
    return undefined;
  }
  const value = viteEnv.VITE_DISABLE_AUTH || viteEnv.DISABLE_AUTH;
  return typeof value === "string" ? value : undefined;
}

/** Returns true when frontend auth guards should treat the app as already authenticated. */
export function isAuthDisabled(): boolean {
  return isTruthyAuthValue(getDisableAuthValue());
}
