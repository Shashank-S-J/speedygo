import { apiClient } from '../lib/axios';
import axios from 'axios';
import {
  AuthResponse, RegisterRequest, RegisterResponse, LoginRequest, OTPVerifyRequest, OkResponse,
} from '@speedygo/types';

const API_URL = typeof process !== 'undefined'
  ? (process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:8080')
  : 'http://localhost:8080';

export const authService = {
  register: (data: RegisterRequest) =>
    apiClient.post<RegisterResponse>('/auth/register', data).then(r => r.data),

  verifyOtp: (data: OTPVerifyRequest) =>
    apiClient.post<AuthResponse>('/auth/verify-otp', data).then(r => r.data),

  resendOtp: (email: string) =>
    apiClient.post<OkResponse>('/auth/resend-otp', { email }).then(r => r.data),

  login: (data: LoginRequest) =>
    apiClient.post<AuthResponse>('/auth/login', data).then(r => r.data),

  sendLoginOtp: (email: string) =>
    apiClient.post<OkResponse>('/auth/login-otp', { email }).then(r => r.data),

  refreshToken: (refreshToken: string) =>
    apiClient.post<AuthResponse>('/auth/refresh', { refresh_token: refreshToken }).then(r => r.data),

  // Logout uses raw axios to avoid the interceptor triggering a refresh loop
  // when the access token is expired. The endpoint accepts expired/missing tokens.
  // withCredentials sends the HttpOnly refresh_token cookie to the backend.
  logout: (refreshToken?: string) =>
    axios.post<{ ok: boolean }>(`${API_URL}/auth/logout`, { refresh_token: refreshToken }, {
      headers: { 'Content-Type': 'application/json' },
      withCredentials: true,
    }).then(r => r.data).catch(() => ({ ok: true })),

  forgotPassword: (email: string) =>
    apiClient.post<OkResponse>('/auth/forgot-password', { email }).then(r => r.data),

  resetPassword: (data: { email: string; otp: string; new_password: string }) =>
    apiClient.post<OkResponse>('/auth/reset-password', data).then(r => r.data),

  sendChangePasswordOtp: () =>
    apiClient.post<OkResponse>('/users/me/password/send-otp').then(r => r.data),

  changePasswordWithOtp: (data: { otp: string; new_password: string }) =>
    apiClient.put<OkResponse>('/users/me/password/verify-otp', data).then(r => r.data),
};
