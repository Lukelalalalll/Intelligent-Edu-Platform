// frontend/src/api/client.ts
import axios, { type AxiosError, type InternalAxiosRequestConfig, type AxiosResponse } from 'axios';
import { log } from '../utils/logger';
import { networkBus } from '../hooks/useNetworkStatus';

const client = axios.create({
  baseURL: (import.meta.env.VITE_API_ROOT || 'http://localhost:5009') + '/api',
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

    // Detect network-level failure (no HTTP response at all)
    if (!error.response && (error.message?.includes('Network Error') || error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED')) {
      networkBus.reportNetworkError();
    }

    if (status === 401 && !isLoginRequest) {
      localStorage.removeItem('user');
      if (window.location.pathname !== LOGIN_PATH) {
        window.location.replace(buildLoginRedirect());
      }
    }
    return Promise.reject(error);
  }
);

export default client;