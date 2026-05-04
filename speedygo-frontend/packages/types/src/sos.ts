export interface SOSAlert {
  id: string;
  user_id: number;
  booking_id: number;
  lat: number;
  lng: number;
  status: 'ACTIVE' | 'RESOLVED' | 'FALSE_ALARM';
  note?: string;
  created_at: string;
  resolved_at?: string;
}

export interface EmergencyContact {
  id?: number;
  name: string;
  phone: string;
  email?: string;
}

export interface SOSTriggerRequest {
  booking_id: number;
  lat: number;
  lng: number;
}

