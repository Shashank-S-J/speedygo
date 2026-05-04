export type VehicleType = 'AUTO_RICKSHAW' | 'TEMPO' | 'MINI_TRUCK' | 'TRUCK' | 'TRAILER';

export type VehicleApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface Vehicle {
  id: number;
  owner_id: number;
  type: VehicleType;
  registration_no: string;
  make?: string;
  model?: string;
  year?: number;
  max_weight_kg: number;
  length_ft?: number;
  width_ft?: number;
  height_ft?: number;
  photos?: string[];
  insurance_expiry?: string;
  insurance_no?: string;
  insurance_provider?: string;
  approval_status: VehicleApprovalStatus;
  approval_note?: string;
  is_active: boolean;
  current_lat?: number;
  current_lng?: number;
  last_location_at?: string;
  trip_count?: number;
  created_at: string;
}

export interface CreateVehicleRequest {
  type: VehicleType;
  registration_no: string;
  make?: string;
  model?: string;
  year?: number;
  max_weight_kg: number;
  length_ft?: number;
  width_ft?: number;
  height_ft?: number;
  photos?: string[];
  insurance_expiry?: string;
  insurance_no?: string;
  insurance_provider?: string;
}

export interface UpdateVehicleRequest {
  make?: string;
  model?: string;
  year?: number;
  max_weight_kg?: number;
  insurance_expiry?: string;
  insurance_no?: string;
  insurance_provider?: string;
  photos?: string[];
}

export interface Pricing {
  id: number;
  vehicle_type: VehicleType;
  base_price_paise: number;
  price_per_km_paise: number;
  loading_charges_paise: number;
  surge_multiplier: number;
  min_distance_km: number;
}

export interface NearbyVehicle {
  id: number;
  type: VehicleType;
  registration_no: string;
  lat: number;
  lng: number;
  distance_km: number;
}
