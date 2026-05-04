export type KYCStatus = 'PENDING' | 'PROCESSING' | 'VERIFIED' | 'REJECTED' | 'INCONCLUSIVE' | 'MANUAL_REVIEW';

export interface KYCSubmission {
  id: string;
  user_id: number;
  status: KYCStatus;
  aadhaar_number?: string;
  pan_number?: string;
  dl_number?: string;
  doc_urls: string[];
  didit_session_id?: string;
  ai_risk_score: number;
  ai_flags?: string[];
  aadhaar_verified?: boolean;
  pan_verified?: boolean;
  dl_verified?: boolean;
  rc_verified?: boolean;
  admin_note?: string;
  verified_at?: string;
  created_at: string;
}

export interface KYCSubmitRequest {
  aadhaar_number?: string;
  pan_number?: string;
  dl_number?: string;
  doc_urls: string[];
}

