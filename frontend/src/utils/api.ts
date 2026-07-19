function isAbsoluteHttpUrl(path: string): boolean {
  return /^https?:\/\//i.test(path);
}

function withLeadingSlash(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function getConfiguredFastApiUrl(): string | null {
  const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | boolean | undefined> }).env || {};
  const configured =
    viteEnv.VITE_FAST_API_URL ||
    viteEnv.VITE_NEXT_PUBLIC_FAST_API ||
    viteEnv.NEXT_PUBLIC_FAST_API;
  if (typeof configured === "string" && configured.trim()) {
    return configured;
  }

  return null;
}

function isProductionBuild(): boolean {
  const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | boolean | undefined> }).env || {};
  return (
    viteEnv.PROD === true ||
    viteEnv.MODE === "production" ||
    viteEnv.VITE_APP_ENV === "production" ||
    viteEnv.NEXT_PUBLIC_APP_ENV === "production"
  );
}

function isLocalhostAllowedOrigin(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

function getFastApiUrlFromQuery(): string | null {
  if (typeof window === "undefined") return null;
  if (isProductionBuild()) return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("fastapiUrl");
    if (!value) return null;

    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    if (!isLocalhostAllowedOrigin(parsed)) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function shouldUseDirectFastApiOriginInBrowser(): boolean {
  return !!getFastApiUrlFromQuery();
}

function resolveBackendPathForRuntime(path: string): string {
  const normalizedPath = withLeadingSlash(path);

  // Keep browser requests same-origin unless a query override explicitly targets FastAPI.
  if (
    typeof window !== "undefined" &&
    !shouldUseDirectFastApiOriginInBrowser()
  ) {
    return normalizedPath;
  }

  return `${getFastAPIUrl()}${normalizedPath}`;
}

/**
 * Resolves the FastAPI origin for the current runtime.
 * Browser requests normally stay same-origin so nginx can proxy `/api/v1`.
 */
export function getFastAPIUrl(): string {
  const queryFastApiUrl = getFastApiUrlFromQuery();
  if (queryFastApiUrl) {
    return queryFastApiUrl;
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return getConfiguredFastApiUrl() || "http://127.0.0.1:5009";
}

/**
 * Resolves an API path to the URL form expected by the active runtime.
 * Non-FastAPI paths are left relative so local app routes and static paths keep working.
 */
export function getApiUrl(path: string): string {
  if (isAbsoluteHttpUrl(path)) {
    return path;
  }

  const normalizedPath = withLeadingSlash(path);
  const isFastApiEndpoint = normalizedPath.startsWith("/api/v1/");
  if (!isFastApiEndpoint) {
    return normalizedPath;
  }

  if (typeof window === "undefined" && !getConfiguredFastApiUrl()) {
    return normalizedPath;
  }

  return resolveBackendPathForRuntime(normalizedPath);
}

/**
 * Returns an absolute URL even when getApiUrl resolves to a same-origin path.
 * This is required before using URL APIs that reject single-argument relative paths.
 */
export function buildAbsoluteApiRequestUrl(
  path: string,
  baseForRelative: string = typeof window !== "undefined" &&
  window.location?.origin
    ? window.location.origin
    : "http://127.0.0.1:3000"
): string {
  const resolved = getApiUrl(path);
  if (isAbsoluteHttpUrl(resolved)) {
    return resolved;
  }
  return new URL(resolved, baseForRelative).toString();
}

function hasBackendAssetPrefix(path: string): boolean {
  return path.startsWith("/static/") || path.startsWith("/app_data/");
}

function toBackendServedPath(rawPath: string): string {
  const normalized = rawPath.replace(/\\/g, "/");

  // Preserve bundled assets emitted by the Next-compatible PPT generator shim.
  if (normalized.startsWith("/_next/static/")) {
    return normalized;
  }

  const appDataIdx = normalized.indexOf("/app_data/");
  if (appDataIdx !== -1) {
    return normalized.slice(appDataIdx);
  }

  const staticIdx = normalized.indexOf("/static/");
  if (staticIdx !== -1) {
    return normalized.slice(staticIdx);
  }

  const imagesIdx = normalized.lastIndexOf("/images/");
  if (imagesIdx !== -1) {
    return `/app_data${normalized.slice(imagesIdx)}`;
  }

  const uploadsIdx = normalized.lastIndexOf("/uploads/");
  if (uploadsIdx !== -1) {
    return `/app_data${normalized.slice(uploadsIdx)}`;
  }

  const fontsIdx = normalized.lastIndexOf("/fonts/");
  if (fontsIdx !== -1) {
    return `/app_data${normalized.slice(fontsIdx)}`;
  }

  return normalized;
}

function splitPathAndSuffix(value: string): { path: string; suffix: string } {
  const hashIdx = value.indexOf("#");
  const queryIdx = value.indexOf("?");
  const firstSuffixIdx =
    hashIdx === -1
      ? queryIdx
      : queryIdx === -1
        ? hashIdx
        : Math.min(queryIdx, hashIdx);

  if (firstSuffixIdx === -1) {
    return { path: value, suffix: "" };
  }

  return {
    path: value.slice(0, firstSuffixIdx),
    suffix: value.slice(firstSuffixIdx),
  };
}

/**
 * Resolves backend-served asset paths to the runtime-appropriate backend URL.
 * Data, blob, and unrelated absolute URLs pass through untouched.
 */
export function resolveBackendAssetUrl(path?: string): string {
  if (!path) return "";

  const trimmedPath = path.trim();
  if (!trimmedPath) return "";

  if (trimmedPath.startsWith("data:") || trimmedPath.startsWith("blob:")) {
    return trimmedPath;
  }

  if (trimmedPath.startsWith("file:")) {
    try {
      const parsed = new URL(trimmedPath);
      const servedPath = toBackendServedPath(decodeURIComponent(parsed.pathname));
      if (hasBackendAssetPrefix(servedPath)) {
        return resolveBackendPathForRuntime(servedPath);
      }
      return trimmedPath;
    } catch {
      return trimmedPath;
    }
  }

  if (isAbsoluteHttpUrl(trimmedPath)) {
    try {
      const parsed = new URL(trimmedPath);
      const servedPath = toBackendServedPath(parsed.pathname);
      if (hasBackendAssetPrefix(servedPath)) {
        return resolveBackendPathForRuntime(
          `${servedPath}${parsed.search}${parsed.hash}`
        );
      }
      return trimmedPath;
    } catch {
      return trimmedPath;
    }
  }

  const { path: pathPart, suffix } = splitPathAndSuffix(trimmedPath);
  const servedPath = toBackendServedPath(withLeadingSlash(pathPart));
  if (hasBackendAssetPrefix(servedPath)) {
    return resolveBackendPathForRuntime(`${servedPath}${suffix}`);
  }

  return trimmedPath;
}

/** Backend asset payload shape accepted by shared asset URL helpers. */
export type BackendAssetLike = {
  file_url?: string | null;
  path?: string | null;
  url?: string | null;
};

/**
 * Extracts the first supported asset URL field from backend payload shapes.
 */
export function getBackendAssetSource(
  asset: BackendAssetLike | string | null | undefined
): string {
  if (typeof asset === "string") {
    return asset;
  }

  if (!asset) {
    return "";
  }

  return (asset.file_url || asset.path || asset.url || "").trim();
}

/**
 * Extracts and resolves an asset source from either a string or backend payload object.
 */
export function resolveBackendAssetSource(
  asset: BackendAssetLike | string | null | undefined
): string {
  return resolveBackendAssetUrl(getBackendAssetSource(asset));
}

/**
 * Recursively normalizes string values that may contain backend-served asset paths.
 */
export const normalizeBackendAssetUrls = <T,>(input: T): T => {
  if (Array.isArray(input)) {
    return input.map((item) => normalizeBackendAssetUrls(item)) as T;
  }

  if (input && typeof input === "object") {
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      input as Record<string, unknown>
    )) {
      normalized[key] =
        typeof value === "string"
          ? resolveBackendAssetUrl(value)
          : normalizeBackendAssetUrls(value);
    }
    return normalized as T;
  }

  return input;
};
