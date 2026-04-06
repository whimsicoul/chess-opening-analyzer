import axios from 'axios';

const apiUrl = import.meta.env.VITE_API_URL;
if (!apiUrl) {
  console.error(
    '[api.js] VITE_API_URL is not defined. ' +
    'Create frontend/.env with VITE_API_URL=<backend URL> and rebuild.'
  );
}

const api = axios.create({
  baseURL: apiUrl,
});

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('chess_token') || sessionStorage.getItem('chess_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401, clear token and redirect to login (but not for the login request itself)
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isAuthEndpoint = err.config?.url?.includes('/auth/login') || err.config?.url?.includes('/auth/register');
    if (err.response?.status === 401 && !isAuthEndpoint) {
      localStorage.removeItem('chess_token');
      sessionStorage.removeItem('chess_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
