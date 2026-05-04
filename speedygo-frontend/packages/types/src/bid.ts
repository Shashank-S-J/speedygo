export type BidStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

export interface Bid {
  id: number;
  booking_id: number;
  transporter_id: number;
  vehicle_id: number;
  amount_paise: number;
  note?: string;
  estimated_time_min?: number;
  status: BidStatus;
  created_at: string;
}

export interface PlaceBidRequest {
  vehicle_id: number;
  amount_paise: number;
  note?: string;
  estimated_time_min?: number;
}

