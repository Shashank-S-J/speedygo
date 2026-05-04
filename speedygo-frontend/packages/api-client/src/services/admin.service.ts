import { apiClient } from '../lib/axios';
import {
  AdminDashboard, UserDetail, UpdateUserStatusRequest, KYCQueueItem,
  ReviewKYCRequest, Report, ResolveReportRequest, SOSAlert, ResolveSOSRequest,
  AuditLog, PaginatedResponse, User, AdminAIQueryRequest, AdminAIQueryResponse,
  Vehicle, Pricing, VehicleType,
} from '@speedygo/types';

export const adminService = {
  // ...existing methods...
  getDashboard: () =>
    apiClient.get<AdminDashboard>('/admin/dashboard').then(r => r.data),

  searchUsers: (params: { q?: string; role?: string; limit?: number; offset?: number }) =>
    apiClient.get<PaginatedResponse<User>>('/admin/users/search', { params }).then(r => r.data),

  getUserDetail: (id: number) =>
    apiClient.get<UserDetail>(`/admin/users/${id}/detail`).then(r => r.data),

  updateUserStatus: (id: number, data: UpdateUserStatusRequest, adminPassword?: string) =>
    apiClient.put(`/admin/users/${id}/status`, data, {
      headers: adminPassword ? { 'X-Admin-Password': adminPassword } : {},
    }).then(r => r.data),

  updateUserRole: (id: number, role: string, adminPassword: string) =>
    apiClient.put(`/admin/users/${id}/role`, { role }, {
      headers: { 'X-Admin-Password': adminPassword },
    }).then(r => r.data),

  getKycQueue: (params?: { limit?: number; offset?: number }) =>
    apiClient.get<PaginatedResponse<KYCQueueItem>>('/admin/kyc/queue', { params }).then(r => r.data),

  reviewKyc: (id: string, data: ReviewKYCRequest) =>
    apiClient.put(`/admin/kyc/${id}/review`, data).then(r => r.data),

  getReports: (params?: { limit?: number; offset?: number }) =>
    apiClient.get<PaginatedResponse<Report>>('/admin/reports', { params }).then(r => r.data),

  resolveReport: (id: string, data: ResolveReportRequest) =>
    apiClient.put(`/admin/reports/${id}/resolve`, data).then(r => r.data),

  getActiveSos: (params?: { limit?: number; offset?: number }) =>
    apiClient.get<PaginatedResponse<SOSAlert>>('/admin/sos/active', { params }).then(r => r.data),

  resolveSos: (id: string, data: ResolveSOSRequest) =>
    apiClient.put(`/admin/sos/${id}/resolve`, data).then(r => r.data),

  aiQuery: (data: AdminAIQueryRequest) =>
    apiClient.post<AdminAIQueryResponse>('/admin/ai/query', data).then(r => r.data),

  getAuditLogs: (params?: { limit?: number; offset?: number; action?: string; target_type?: string }) =>
    apiClient.get<PaginatedResponse<AuditLog>>('/admin/audit-logs', { params }).then(r => r.data),

  // Vehicle approval
  getPendingVehicles: (params?: { limit?: number; offset?: number }) =>
    apiClient.get<PaginatedResponse<Vehicle>>('/admin/vehicles/pending', { params }).then(r => r.data),

  reviewVehicle: (id: number, action: 'approve' | 'reject', note?: string) =>
    apiClient.put<Vehicle>(`/admin/vehicles/${id}/review`, { action, note }).then(r => r.data),

  // Pricing
  getPricing: () => apiClient.get<Pricing[]>('/admin/pricing').then(r => r.data),

  upsertPricing: (data: Partial<Pricing> & { vehicle_type: VehicleType }) =>
    apiClient.put('/admin/pricing', data).then(r => r.data),

  // Admin management (SUPER_ADMIN only)
  createAdmin: (data: { email: string; phone: string; full_name: string; password: string }, adminPassword: string) =>
    apiClient.post<User>('/admin/admins', data, { headers: { 'X-Admin-Password': adminPassword } }).then(r => r.data),

  deleteAdmin: (id: number, adminPassword: string) =>
    apiClient.delete(`/admin/admins/${id}`, { headers: { 'X-Admin-Password': adminPassword } }).then(r => r.data),

  getAdmins: () =>
    apiClient.get<User[]>('/admin/admins').then(r => r.data),

  // KYC history (approved/rejected)
  getKycHistory: (params?: { status?: string; limit?: number; offset?: number }) =>
    apiClient.get<PaginatedResponse<KYCQueueItem>>('/admin/kyc/history', { params }).then(r => r.data),

  // Reports with filters
  getReportsFiltered: (params?: { limit?: number; offset?: number; type?: string; category?: string; status?: string; reported_id?: number; reporter_id?: number }) =>
    apiClient.get<PaginatedResponse<Report>>('/admin/reports', { params }).then(r => r.data),

  // Ban approval queue
  getBanQueue: (params?: { limit?: number; offset?: number }) =>
    apiClient.get<PaginatedResponse<{ user_id: number; user: User; report_count: number; warning_sent: boolean }>>('/admin/ban-queue', { params }).then(r => r.data),

  approveBan: (userId: number, adminPassword: string) =>
    apiClient.put(`/admin/ban-queue/${userId}/approve`, {}, { headers: { 'X-Admin-Password': adminPassword } }).then(r => r.data),

  // Dashboard extras
  getDailyBookings: (params?: { period?: string }) =>
    apiClient.get('/admin/dashboard/daily-bookings', { params }).then(r => r.data),

  getActiveTransporters: () =>
    apiClient.get('/admin/dashboard/active-transporters').then(r => r.data),

  getUserActivity: (params?: { period?: string }) =>
    apiClient.get('/admin/dashboard/user-activity', { params }).then(r => r.data),
};
