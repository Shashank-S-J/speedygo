import { apiClient } from '../lib/axios';
import {
  MapConfig, GeocodeResult, RouteResponse, ETAResponse,
  NearbyTransporter, BookingRouteResponse, UpdateLocationRequest,
} from '@speedygo/types';

export const mapService = {
  getConfig: () => apiClient.get<MapConfig>('/map/config').then(r => r.data),

  geocode: (q: string) =>
    apiClient.get<{ results: GeocodeResult[]; count: number }>('/map/geocode', { params: { q } }).then(r => r.data),

  reverseGeocode: (lat: number, lng: number) =>
    apiClient.get<GeocodeResult>('/map/reverse-geocode', { params: { lat, lng } }).then(r => r.data),

  getRoute: (data: {
    origin: { lat: number; lng: number };
    destination: { lat: number; lng: number };
    waypoints?: Array<{ lat: number; lng: number }>;
  }) => apiClient.post<RouteResponse>('/map/route', data).then(r => r.data),

  getEta: (bookingId: number) =>
    apiClient.get<ETAResponse>(`/map/eta/${bookingId}`).then(r => r.data),

  getNearbyTransporters: (params: { lat: number; lng: number; radius?: number }) =>
    apiClient.get<{ transporters: NearbyTransporter[]; count: number; search_radius_km: number }>(
      '/map/transporters/nearby', { params }
    ).then(r => r.data),

  getBookingRoute: (bookingId: number) =>
    apiClient.get<BookingRouteResponse>(`/map/booking/${bookingId}/route`).then(r => r.data),

  updateLocation: (data: UpdateLocationRequest) =>
    apiClient.put('/map/location', data).then(r => r.data),

  recordLocationPermission: (data: {
    granted: boolean; precise: boolean; background: boolean; platform: string; device_id?: string;
  }) => apiClient.post('/map/location/permission', data).then(r => r.data),

  getAdminActiveBookings: () =>
    apiClient.get('/map/admin/active-bookings').then(r => r.data),
};

