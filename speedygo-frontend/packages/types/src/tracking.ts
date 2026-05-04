export interface LocationUpdate {
  vehicle_id: number;
  lat: number;
  lng: number;
  speed_kmh?: number;
  heading?: number;
  timestamp: number;
}

export interface GPSPublishPayload {
  lat: number;
  lng: number;
  speed_kmh?: number;
  heading?: number;
  timestamp: number;
}

export interface UpdateLocationRequest {
  lat: number;
  lng: number;
  accuracy_m?: number;
  speed_kmh?: number;
  heading?: number;
  source?: string;
}

export interface ETAResponse {
  booking_id: number;
  eta_minutes: number;
  eta_text: string;
  distance_km: number;
  destination: 'pickup' | 'delivery';
  vehicle_lat: number;
  vehicle_lng: number;
  destination_lat: number;
  destination_lng: number;
  updated_at: string;
}

