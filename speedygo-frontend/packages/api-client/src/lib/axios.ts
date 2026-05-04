import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { ApiError } from '@speedygo/types';

export type TokenGetter = () => string | null;

let tokenGetter: TokenGetter = () => null;
let onUnauthorized: (() => void) | null = null;
let refreshTokenGetter: (() => string | null) | null = null;
let onTokenRefreshed: ((accessToken: string, refreshToken: string) => void) | null = null;
let isRefreshing = false;
let refreshSubscribers: { resolve: (token: string) => void; reject: (err: unknown) => void }[] = [];

export function setTokenGetter(fn: TokenGetter) {
  tokenGetter = fn;
}

export function setOnUnauthorized(fn: () => void) {
  onUnauthorized = fn;
}

export function setRefreshTokenGetter(fn: () => string | null) {
  refreshTokenGetter = fn;
}

export function setOnTokenRefreshed(fn: (accessToken: string, refreshToken: string) => void) {
  onTokenRefreshed = fn;
}

const API_URL = typeof process !== 'undefined'
  ? (process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:8080')
  : 'http://localhost:8080';

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Request: attach JWT
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenGetter();
  if (token && config.headers) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

function subscribeTokenRefresh(resolve: (token: string) => void, reject: (err: unknown) => void) {
  refreshSubscribers.push({ resolve, reject });
}

function onRefreshed(token: string) {
  refreshSubscribers.forEach(({ resolve }) => resolve(token));
  refreshSubscribers = [];
}

function onRefreshFailed(err: unknown) {
  refreshSubscribers.forEach(({ reject }) => reject(err));
  refreshSubscribers = [];
}

// Response: handle 401 → attempt token refresh, then call onUnauthorized
apiClient.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<ApiError>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      // Don't try to refresh on auth endpoints themselves
      const url = originalRequest.url ?? '';
      if (url.includes('/auth/refresh') || url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/logout')) {
        if (onUnauthorized) onUnauthorized();
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // Queue this request until token is refreshed (or refresh fails)
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh(
            (newToken: string) => {
              if (originalRequest.headers) {
                originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
              }
              resolve(apiClient(originalRequest));
            },
            (refreshError: unknown) => {
              reject(refreshError);
            }
          );
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const rt = refreshTokenGetter?.();
      if (!rt) {
        isRefreshing = false;
        onRefreshFailed(error);
        if (onUnauthorized) onUnauthorized();
        return Promise.reject(error);
      }

      try {
        // Send refresh token both in body (backward compat) and via HttpOnly cookie (withCredentials).
        // The backend accepts either source.
        const { data } = await axios.post(`${API_URL}/auth/refresh`, { refresh_token: rt }, {
          headers: { 'Content-Type': 'application/json' },
          withCredentials: true,
        });
        const newAccessToken = data.access_token;
        const newRefreshToken = data.refresh_token;
        if (onTokenRefreshed) onTokenRefreshed(newAccessToken, newRefreshToken);
        isRefreshing = false;
        onRefreshed(newAccessToken);
        if (originalRequest.headers) {
          originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;
        }
        return apiClient(originalRequest);
      } catch (refreshError) {
        isRefreshing = false;
        onRefreshFailed(refreshError);
        if (onUnauthorized) onUnauthorized();
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export function getApiError(error: unknown): string {
  if (axios.isAxiosError(error) && error.response?.data) {
    const data = error.response.data as ApiError;
    return data.message ?? 'An unexpected error occurred';
  }
  return 'An unexpected error occurred';
}

