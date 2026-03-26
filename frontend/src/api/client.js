// frontend/src/api/client.js
import axios from 'axios';

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

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const requestUrl = String(error?.config?.url || '');
    const isLoginRequest = requestUrl.includes('/login');

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