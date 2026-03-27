// frontend/src/api/client.js
import axios from 'axios';
import { log } from '../utils/logger';

const client = axios.create({
  baseURL: 'http://localhost:5009/api',
  withCredentials: true,
});

const LOGIN_PATH = '/login';

const buildLoginRedirect = () => {
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (currentPath.startsWith(LOGIN_PATH)) {
    return LOGIN_PATH;
  }
  return `${LOGIN_PATH}?next=${encodeURIComponent(currentPath)}`;
};

client.interceptors.request.use(
  (config) => {
    const method = String(config?.method || 'GET').toUpperCase();
    const url = String(config?.url || '');
    log.info('api', 'Request started', { method, url });
    return config;
  },
  (error) => {
    log.error('api', 'Request setup failed', {
      message: error?.message,
    });
    return Promise.reject(error);
  }
);

client.interceptors.response.use(
  (response) => {
    const method = String(response?.config?.method || 'GET').toUpperCase();
    const url = String(response?.config?.url || '');
    const status = response?.status;
    log.info('api', 'Request completed', { method, url, status });
    return response;
  },
  (error) => {
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
      localStorage.removeItem('user');
      if (window.location.pathname !== LOGIN_PATH) {
        window.location.replace(buildLoginRedirect());
      }
    }
    return Promise.reject(error);
  }
);

export default client;