import { apiClient } from '../lib/axios';
import {
  Booking, CreateBookingRequest, BookingEstimateRequest, BookingEstimateResponse,
  UpdateBookingStatusRequest, PhotoUploadRequest, PaginatedResponse, OkResponse,
} from '@speedygo/types';

export const bookingService = {
  estimate: (data: BookingEstimateRequest) =>
    apiClient.post<BookingEstimateResponse>('/bookings/estimate', data).then(r => r.data),

  create: (data: CreateBookingRequest) =>
    apiClient.post<Booking>('/bookings/', data).then(r => r.data),

  list: (params?: { limit?: number; offset?: number }) =>
    apiClient.get<PaginatedResponse<Booking>>('/bookings/my', { params }).then(r => r.data),

  getById: (id: number) =>
    apiClient.get<Booking>(`/bookings/${id}`).then(r => r.data),

  updateStatus: (id: number, data: UpdateBookingStatusRequest) =>
    apiClient.put<Booking>(`/bookings/${id}/status`, data).then(r => r.data),

  accept: (id: number, vehicleId: number) =>
    apiClient.put<Booking>(`/bookings/${id}/accept`, { vehicle_id: vehicleId }).then(r => r.data),

  uploadPhotos: (id: number, data: PhotoUploadRequest) =>
    apiClient.post(`/bookings/${id}/photos`, data).then(r => r.data),

  getNearby: (params: { lat: number; lng: number; radius?: number; limit?: number }) =>
    apiClient.get<{ data: Booking[]; count: number }>('/bookings/nearby', { params }).then(r => r.data),

  sendOtp: (id: number) =>
    apiClient.post<OkResponse>(`/bookings/${id}/send-otp`).then(r => r.data),

  verifyOtp: (id: number, otp: string) =>
    apiClient.post<{ ok: boolean; booking: Booking }>(`/bookings/${id}/verify-otp`, { otp }).then(r => r.data),

  rate: (id: number, rating: number) =>
    apiClient.post(`/bookings/${id}/rate`, { rating }).then(r => r.data),

  flagMismatch: (id: number, note: string) =>
    apiClient.put(`/bookings/${id}/mismatch`, { note }).then(r => r.data),

  verifyPickupOtp: (id: number, otp: string) =>
    apiClient.post<Booking>(`/bookings/${id}/verify-pickup-otp`, { otp }).then(r => r.data),

  complete: (id: number) =>
    apiClient.post<Booking>(`/bookings/${id}/complete`).then(r => r.data),

  setAvailability: (available: boolean) =>
    apiClient.put<{ ok: boolean; available: boolean }>('/bookings/availability', { available }).then(r => r.data),
};

