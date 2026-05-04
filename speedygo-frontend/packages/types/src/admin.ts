import { User } from './auth';
import { Report, ReportResolution } from './report';
import { KYCSubmission } from './kyc';
import { Vehicle } from './vehicle';

export interface AdminDashboard {
  users: {
    total_users: number;
    total_customers: number;
    total_transporters: number;
    total_admins: number;
    active_users: number;
    suspended_users: number;
    banned_users: number;
    pending_kyc: number;
    new_users_today: number;
    new_users_this_week: number;
  };
  bookings: {
    total_bookings: number;
    active_bookings: number;
    completed_today: number;
    completed_this_week: number;
    cancelled_today: number;
    disputed_active: number;
    avg_distance_km: number;
    avg_price_paise: number;
  };
  revenue: {
    total_revenue_paise: number;
    total_revenue_formatted: string;
    today_revenue_paise: number;
    this_week_paise: number;
    this_month_paise: number;
    pending_escrow_paise: number;
    total_refunds_paise: number;
    monthly_revenue: Array<{ month: string; amount_paise: number; booking_count: number }>;
  };
  safety: {
    active_sos_alerts: number;
    pending_reports: number;
    auto_suspensions_30d: number;
    flagged_messages_24h: number;
  };
  recent_audit_logs: AuditLog[];
}

export interface AuditLog {
  id: string;
  admin_id: number;
  action: string;
  target_type: string;
  target_id: number;
  reason?: string;
  created_at: string;
}

export interface UpdateUserStatusRequest {
  action: 'enable' | 'disable';
  reason?: string;
  duration?: '7d' | '30d' | 'permanent';
}

export interface UserDetail extends User {
  booking_stats?: {
    total: number;
    completed: number;
    cancelled: number;
    disputed: number;
  };
  vehicles?: Vehicle[];
  reports_against?: Report[];
  reports_filed?: Report[];
  recent_audit?: AuditLog[];
}

export interface KYCQueueItem extends KYCSubmission {
  user: User;
}

export interface ReviewKYCRequest {
  approved: boolean;
  admin_note?: string;
}

export interface ResolveReportRequest {
  resolution: ReportResolution;
  admin_note?: string;
}

export interface ResolveSOSRequest {
  status: 'RESOLVED' | 'FALSE_ALARM';
  note?: string;
}

export interface AdminAIQueryRequest {
  query: string;
  type?: 'search' | 'analyze' | 'insight';
}

export interface AdminAIQueryResponse {
  type: 'search' | 'response';
  content?: string;
  params?: Record<string, unknown>;
}

