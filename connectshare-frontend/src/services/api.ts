import axios from 'axios';
import { useAuthStore } from '../store/auth.store';

// Base URL is just the origin — all paths must include /api/v1/
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

// ── Main intercepted Axios instance ──────────────────────────────────────────
export const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,  // send httpOnly cookie on every request
  headers: { 'Content-Type': 'application/json' },
});

// ── Plain (non-intercepted) instance — used ONLY for token refresh ────────────
// This prevents the refresh call from triggering the response interceptor again.
const plainAxios = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
});

// ── Request interceptor — attach access token ─────────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor — handle 401 with queuing ───────────────────────────
let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((p) => {
    if (error) {
      p.reject(error);
    } else {
      p.resolve(token!);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Skip retry for refresh endpoint itself (avoids meta-loop)
    const isRefreshRoute = originalRequest?.url?.includes('/api/v1/auth/refresh');
    const isLoginRoute   = originalRequest?.url?.includes('/api/v1/auth/login');

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isRefreshRoute &&
      !isLoginRoute
    ) {
      // Queue concurrent requests while a refresh is in-flight
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers['Authorization'] = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await plainAxios.post('/api/v1/auth/refresh');
        const newToken: string = data.data.accessToken;

        // Persist new token
        useAuthStore.getState().setAccessToken(newToken);
        api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;

        processQueue(null, newToken);
        originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
