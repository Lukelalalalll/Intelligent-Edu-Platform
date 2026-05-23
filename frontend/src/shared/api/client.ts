// frontend/src/api/client.ts
import axios, { type AxiosError, type InternalAxiosRequestConfig, type AxiosResponse } from 'axios';
import toast from 'react-hot-toast';
import { log } from '../utils/logger';
import { useAuthStore } from '../store/useAuthStore';
import { networkBus } from '../hooks/useNetworkStatus';

export const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);

export const resolveApiRoot = (): string => {
  const raw = String(import.meta.env.VITE_API_ROOT || 'http://localhost:5009').trim();
  try {
    const parsed = new URL(raw);
    const browserHost = window.location.hostname;

    // Keep loopback host aligned with current page host so auth cookies stay same-site.
    if (LOOPBACK_HOSTS.has(parsed.hostname) && LOOPBACK_HOSTS.has(browserHost) && parsed.hostname !== browserHost) {
      parsed.hostname = browserHost;
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return raw.replace(/\/$/, '');
  }
};

const client = axios.create({
  baseURL: `${resolveApiRoot()}/api`,
  withCredentials: true,
});

const LOGIN_PATH = '/login';

const buildLoginRedirect = (): string => {
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (currentPath.startsWith(LOGIN_PATH)) {
    return LOGIN_PATH;
  }
  return `${LOGIN_PATH}?next=${encodeURIComponent(currentPath)}`;
};

client.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (!navigator.onLine) {
      networkBus.reportNetworkError();
      toast.error('No internet connection. Please check your network and try again.');
      return Promise.reject(new Error('No internet connection.'));
    }
    const method = String(config?.method || 'GET').toUpperCase();
    const url = String(config?.url || '');
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

client.interceptors.response.use(
  (response: AxiosResponse) => {
    const method = String(response?.config?.method || 'GET').toUpperCase();
    const url = String(response?.config?.url || '');
    const status = response?.status;
    log.info('api', 'Request completed', { method, url, status });
    networkBus.reportOnline();
    return response;
  },
  (error: AxiosError) => {
    const status = error?.response?.status;
    const requestUrl = String(error?.config?.url || '');
    const isLoginRequest = requestUrl.includes('/login');

    log.error('api', 'Request failed', {
      method: String(error?.config?.method || 'GET').toUpperCase(),
      url: requestUrl,
      status: status || null,
      message: error?.message,
    });

    if (status === 401 && !isLoginRequest) {
      useAuthStore.getState().logout();
      if (window.location.pathname !== LOGIN_PATH) {
        window.location.replace(buildLoginRedirect());
      }
    }
    return Promise.reject(error);
  }
);

export default client;