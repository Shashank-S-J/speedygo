export type ReportType = 'TRANSPORTER_REPORT' | 'CUSTOMER_REPORT';

export type TransporterReportCategory =
  | 'RECKLESS_DRIVING' | 'DAMAGED_GOODS' | 'LATE_ARRIVAL' | 'HARASSMENT'
  | 'EXTRA_PAYMENT_DEMAND' | 'NO_SHOW' | 'FAKE_GPS' | 'VEHICLE_MISMATCH'
  | 'INTOXICATED_DRIVER' | 'OVERCHARGED';

export type CustomerReportCategory =
  | 'WRONG_ADDRESS' | 'UNDECLARED_EXTRA_GOODS' | 'ABUSIVE_BEHAVIOR' | 'REFUSED_PAYMENT'
  | 'FAKE_BOOKING' | 'ILLEGAL_GOODS' | 'CUSTOMER_NO_SHOW' | 'PROPERTY_DAMAGE'
  | 'EXTORTION_THREAT' | 'REPEATED_CANCELLATION';

export type ReportCategory = TransporterReportCategory | CustomerReportCategory;

export type ReportResolution = 'WARNING' | 'SUSPEND_7D' | 'SUSPEND_30D' | 'PERMABAN' | 'DISMISSED';

export interface Report {
  id: string;
  reporter_id: number;
  reported_id: number;
  booking_id: number;
  type: ReportType;
  category: ReportCategory;
  description?: string;
  status: 'PENDING' | 'UNDER_REVIEW' | 'RESOLVED' | 'DISMISSED';
  resolution?: ReportResolution;
  admin_note?: string;
  ai_severity?: number;
  created_at: string;
  resolved_at?: string;
}

export interface CreateReportRequest {
  reported_id: number;
  booking_id: number;
  type: ReportType;
  category: ReportCategory;
  description?: string;
}

