import axios, { type AxiosError, type InternalAxiosRequestConfig, type AxiosResponse } from 'axios';
import toast from 'react-hot-toast';
import { log } from '../utils/logger';
import { useAuthStore, type User } from '../store/useAuthStore';
import { networkBus } from '../hooks/useNetworkStatus';
import { LOOPBACK_HOSTS, resolveApiRoot } from './root';

export { LOOPBACK_HOSTS, resolveApiRoot };

const client = axios.create({
  baseURL: `${resolveApiRoot()}/api`,
  withCredentials: true,
});

const LOGIN_PATH = '/login';
const REFRESH_PATH = '/refresh';
const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';
let refreshPromise: Promise<void> | null = null;

/** Request config marker used to prevent repeated refresh retries for one request. */
type RetryableRequestConfig = InternalAxiosRequestConfig & { _retryAfterRefresh?: boolean };

const readCookie = (name: string): string => {
  if (typeof document === 'undefined') {
    return '';
  }
  const cookie = document.cookie
    .split('; ')
    .find((item) => item.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.split('=').slice(1).join('=')) : '';
};

const buildLoginRedirect = (): string => {
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (currentPath.startsWith(LOGIN_PATH)) {
    return LOGIN_PATH;
  }
  return `${LOGIN_PATH}?next=${encodeURIComponent(currentPath)}`;
};

const redirectToLogin = (): void => {
  useAuthStore.getState().logout();
  if (window.location.pathname !== LOGIN_PATH) {
    window.location.replace(buildLoginRedirect());
  }
};

/**
 * Refreshes the auth session once and shares the in-flight refresh across failed requests.
 */
const refreshAuthSession = async (): Promise<void> => {
  if (!refreshPromise) {
    refreshPromise = client
      .post(REFRESH_PATH, undefined, { headers: { 'X-Skip-Auth-Retry': '1' } })
      .then((response) => {
        const userData = (response as { data?: { user?: unknown } })?.data?.user;
        if (userData) {
          useAuthStore.getState().login(userData as User, {
            validatedAt: Date.now(),
          });
        }
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

// Attach CSRF credentials and fail fast while the browser reports offline.
client.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (!navigator.onLine) {
      networkBus.reportNetworkError();
      toast.error('No internet connection. Please check your network and try again.');
      return Promise.reject(new Error('No internet connection.'));
    }
    const method = String(config?.method || 'GET').toUpperCase();
    const url = String(config?.url || '');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const csrfToken = readCookie(CSRF_COOKIE_NAME);
      if (csrfToken) {
        config.headers.set(CSRF_HEADER_NAME, csrfToken);
      }
    }
    log.info('api', 'Request started', { method, url });
    return config;
  },
  (error: AxiosError) => {
    log.error('api', 'Request setup failed', {
      message: error?.message,
    });
    return Promise.reject(error);
  }
);

// Retry one 401 response after refreshing the session, then fall back to login redirect.
client.interceptors.response.use(
  (response: AxiosResponse) => {
    const method = String(response?.config?.method || 'GET').toUpperCase();
    const url = String(response?.config?.url || '');
    const status = response?.status;
    log.info('api', 'Request completed', { method, url, status });
    networkBus.reportOnline();
    return response;
  },
  async (error: AxiosError) => {
    const status = error?.response?.status;
    const requestConfig = (error?.config || {}) as RetryableRequestConfig;
    const requestUrl = String(requestConfig?.url || '');
    const isLoginRequest = requestUrl.includes('/login');
    const isSessionRequest = requestUrl.includes('/session');
    const isRefreshRequest = requestUrl.includes(REFRESH_PATH);
    const skipRetry = String(requestConfig?.headers?.['X-Skip-Auth-Retry'] || '') === '1';

    log.error('api', 'Request failed', {
      method: String(requestConfig?.method || 'GET').toUpperCase(),
      url: requestUrl,
      status: status || null,
      message: error?.message,
    });

    if (status === 401 && !isLoginRequest && !isRefreshRequest && !skipRetry && !requestConfig._retryAfterRefresh) {
      try {
        await refreshAuthSession();
        requestConfig._retryAfterRefresh = true;
        return client(requestConfig);
      } catch {
        if (!isSessionRequest) {
          redirectToLogin();
        }
      }
    } else if (status === 401 && (isRefreshRequest || (isSessionRequest && skipRetry))) {
      redirectToLogin();
    }
    return Promise.reject(error);
  }
);

export default client;
