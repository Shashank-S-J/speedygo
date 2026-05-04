import { apiClient } from '../lib/axios';
import { Vehicle, CreateVehicleRequest, UpdateVehicleRequest, Pricing } from '@speedygo/types';

export const vehicleService = {
  create: (data: CreateVehicleRequest) =>
    apiClient.post<Vehicle>('/vehicles/', data).then(r => r.data),

  listMy: () => apiClient.get<Vehicle[]>('/vehicles/my').then(r => r.data),

  getById: (id: number) => apiClient.get<Vehicle>(`/vehicles/${id}`).then(r => r.data),

  update: (id: number, data: UpdateVehicleRequest) =>
    apiClient.put<Vehicle>(`/vehicles/${id}`, data).then(r => r.data),

  delete: (id: number) =>
    apiClient.delete(`/vehicles/${id}`).then(r => r.data),

  getNearby: (params: { lat: number; lng: number; radius?: number; type?: string; limit?: number }) =>
    apiClient.get<{ data: Vehicle[]; count: number }>('/vehicles/nearby', { params }).then(r => r.data),

  search: (params: { q?: string; type?: string; limit?: number; offset?: number }) =>
    apiClient.get<{ data: Vehicle[] }>('/vehicles/search', { params }).then(r => r.data),

  updateLocation: (id: number, lat: number, lng: number) =>
    apiClient.put(`/vehicles/${id}/location`, { lat, lng }).then(r => r.data),

  getPricing: () => apiClient.get<Pricing[]>('/pricing').then(r => r.data),
};
