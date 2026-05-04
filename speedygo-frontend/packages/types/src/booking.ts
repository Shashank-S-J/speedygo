export type BookingStatus =
  | 'PENDING'
  | 'BIDDING'
  | 'ACCEPTED'
  | 'PICKING_UP'
  | 'IN_TRANSIT'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DISPUTED';

export type PaymentStatus =
  | 'UNPAID'
  | 'PENDING'
  | 'CAPTURED'
  | 'ESCROWED'
  | 'RELEASED'
  | 'REFUNDED'
  | 'FAILED';

export interface Waypoint {
  lat: number;
  lng: number;
  address: string;
  contact?: string;
  description?: string;
}

export interface Booking {
  id: number;
  customer_id: number;
  transporter_id?: number;
  vehicle_id?: number;
  status: BookingStatus;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string;
  pickup_contact?: string;
  drop_lat: number;
  drop_lng: number;
  drop_address: string;
  drop_contact?: string;
  goods_description?: string;
  goods_weight_kg: number;
  goods_fragile: boolean;
  distance_km?: number;
  estimated_price?: number;
  final_price?: number;
  currency: string;
  bidding_enabled: boolean;
  bidding_deadline?: string;
  payment_status: PaymentStatus;
  scheduled_at?: string;
  cancel_reason?: string;
  waypoints?: Waypoint[];
  customer_rating?: number;
  transporter_rating?: number;
  pickup_otp?: string;
  created_at: string;
  picked_up_at?: string;
  delivered_at?: string;
  // Populated relations
  transporter?: {
    id: number;
    full_name: string;
    phone: string;
    avg_rating?: number;
    total_ratings?: number;
    profile_photo?: string;
  };
  vehicle?: {
    id: number;
    type: string;
    registration_no: string;
    make?: string;
    model?: string;
  };
  customer?: {
    id: number;
    full_name: string;
    phone: string;
    avg_rating?: number;
  };
}

export interface BookingEstimateRequest {
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string;
  drop_lat: number;
  drop_lng: number;
  drop_address: string;
  goods_weight_kg: number;
  goods_fragile?: boolean;
  waypoints?: Waypoint[];
}

export interface BookingEstimateResponse {
  estimated_price_paise: number;
  estimated_distance_km: number;
  currency: string;
  surge_multiplier: number;
}

export interface CreateBookingRequest {
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string;
  pickup_contact?: string;
  drop_lat: number;
  drop_lng: number;
  drop_address: string;
  drop_contact?: string;
  goods_description?: string;
  goods_weight_kg: number;
  goods_fragile?: boolean;
  scheduled_at?: string;
  bidding_enabled?: boolean;
  waypoints?: Waypoint[];
}

export interface UpdateBookingStatusRequest {
  status: BookingStatus;
  cancel_reason?: string;
}

export type PhotoStage = 'pickup' | 'delivery';

export interface PhotoUploadRequest {
  stage: PhotoStage;
  urls: string[];
}

