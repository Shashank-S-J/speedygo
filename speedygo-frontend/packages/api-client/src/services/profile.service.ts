import { apiClient } from '../lib/axios';
import { User, OkResponse } from '@speedygo/types';

export const profileService = {
  getProfile: () => apiClient.get<User>('/users/me/profile').then(r => r.data),

  updateProfile: (data: Partial<Pick<User, 'full_name' | 'phone' | 'profile_photo'> & { fcm_token?: string; avatar_config?: any }>) =>
    apiClient.put<User>('/users/me/profile', data).then(r => r.data),

  changePassword: (data: { current_password: string; new_password: string }) =>
    apiClient.put<OkResponse>('/users/me/password', data).then(r => r.data),

  getDashboard: () => apiClient.get('/users/me/dashboard').then(r => r.data),

  /** Upload profile photo from File (camera/gallery) or base64 data URL */
  uploadPhoto: (fileOrBase64: File | string) => {
    if (typeof fileOrBase64 === 'string') {
      // Base64 data URL
      return apiClient.post<{ ok: boolean; url: string; user: User }>(
        '/users/me/photo',
        { photo: fileOrBase64 }
      ).then(r => r.data);
    }
    // File upload via FormData
    const formData = new FormData();
    formData.append('photo', fileOrBase64);
    return apiClient.post<{ ok: boolean; url: string; user: User }>(
      '/users/me/photo',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    ).then(r => r.data);
  },
};

