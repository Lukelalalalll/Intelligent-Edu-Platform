import { useAuthStore, type User } from "@/shared/store/useAuthStore";
import { getPptGeneratorProviderRequestValue } from "@/ppt_generator/providerOverride";

const LOGIN_PATH = "/login";
const REFRESH_PATH = "/api/refresh";
const SESSION_PATH = "/api/session";
const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "X-CSRF-Token";
const FALLBACK_ORIGIN = "http://localhost";

let refreshPromise: Promise<void> | null = null;

type PptGeneratorFetchOptions = RequestInit & {
  skipAuthRetry?: boolean;
};

const readCookie = (name: string): string => {
  if (typeof document === "undefined") {
    return "";
  }

  const entry = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${name}=`));

  return entry ? decodeURIComponent(entry.split("=").slice(1).join("=")) : "";
};

const getOrigin = (): string => {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  return FALLBACK_ORIGIN;
};

const toUrl = (input: RequestInfo | URL): URL => {
  if (input instanceof URL) {
    return new URL(input.toString(), getOrigin());
  }

  if (typeof Request !== "undefined" && input instanceof Request) {
    return new URL(input.url, getOrigin());
  }

  return new URL(String(input), getOrigin());
};

const getMethod = (input: RequestInfo | URL, init?: RequestInit): string => {
  if (init?.method) {
    return String(init.method).toUpperCase();
  }

  if (typeof Request !== "undefined" && input instanceof Request) {
    return String(input.method || "GET").toUpperCase();
  }

  return "GET";
};

const buildHeaders = (
  method: string,
  headersInit?: HeadersInit
): Headers => {
  const headers = new Headers(headersInit);
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken && !headers.has(CSRF_HEADER_NAME)) {
      headers.set(CSRF_HEADER_NAME, csrfToken);
    }
  }
  const provider = getPptGeneratorProviderRequestValue();
  if (provider && !headers.has("X-Ppt-Generator-LLM-Provider")) {
    headers.set("X-Ppt-Generator-LLM-Provider", provider);
  }
  return headers;
};

const buildLoginRedirect = (): string => {
  if (typeof window === "undefined") {
    return LOGIN_PATH;
  }

  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (currentPath.startsWith(LOGIN_PATH)) {
    return LOGIN_PATH;
  }

  return `${LOGIN_PATH}?next=${encodeURIComponent(currentPath)}`;
};

const redirectToLogin = (): void => {
  useAuthStore.getState().logout();

  if (typeof window === "undefined") {
    return;
  }

  if (window.location.pathname !== LOGIN_PATH) {
    window.location.replace(buildLoginRedirect());
  }
};

const refreshAuthSession = async (): Promise<void> => {
  if (!refreshPromise) {
    const headers = buildHeaders("POST");
    headers.set("X-Skip-Auth-Retry", "1");

    refreshPromise = fetch(REFRESH_PATH, {
      method: "POST",
      headers,
      credentials: "include",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Auth refresh failed with status ${response.status}`);
        }

        try {
          const payload = (await response.clone().json()) as { user?: User };
          if (payload?.user) {
            useAuthStore.getState().login(payload.user, {
              validatedAt: Date.now(),
            });
          }
        } catch {
          // Best effort only. Some refresh responses may omit a JSON payload.
        }
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
};

export const pptGeneratorFetch = async (
  input: RequestInfo | URL,
  init: PptGeneratorFetchOptions = {}
): Promise<Response> => {
  const { skipAuthRetry = false, ...requestInit } = init;
  const method = getMethod(input, requestInit);
  const requestUrl = toUrl(input);
  const isLoginRequest = requestUrl.pathname.startsWith(LOGIN_PATH);
  const isRefreshRequest = requestUrl.pathname === REFRESH_PATH;
  const isSessionRequest = requestUrl.pathname === SESSION_PATH;

  const execute = async (): Promise<Response> => {
    return fetch(input, {
      ...requestInit,
      headers: buildHeaders(method, requestInit.headers),
      credentials: requestInit.credentials ?? "include",
    });
  };

  const response = await execute();
  if (
    response.status === 401 &&
    !skipAuthRetry &&
    !isLoginRequest &&
    !isRefreshRequest
  ) {
    try {
      await refreshAuthSession();
      return await execute();
    } catch {
      redirectToLogin();
    }
  } else if (
    response.status === 401 &&
    (isRefreshRequest || (isSessionRequest && skipAuthRetry))
  ) {
    redirectToLogin();
  }

  return response;
};

export const ensurePptGeneratorSession = async (): Promise<void> => {
  const response = await pptGeneratorFetch(SESSION_PATH, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to validate session (${response.status})`);
  }
};


