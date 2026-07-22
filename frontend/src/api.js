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

// On 401, clear token and redirect to login — but only when a session actually
// expired mid-use. A guest with no token hitting a 401 (e.g. a gated write
// endpoint reached despite frontend guards) never had a session to lose, so
// they're left on the page to let the caller show its own "sign in" state.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isAuthEndpoint = err.config?.url?.includes('/auth/login') || err.config?.url?.includes('/auth/register');
    const hadToken = !!(localStorage.getItem('chess_token') || sessionStorage.getItem('chess_token'));
    if (err.response?.status === 401 && !isAuthEndpoint && hadToken) {
      localStorage.removeItem('chess_token');
      sessionStorage.removeItem('chess_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
