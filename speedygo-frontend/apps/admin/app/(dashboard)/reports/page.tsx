'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService, getApiError } from '@speedygo/api-client';
import { Report, ReportResolution, ReportType } from '@speedygo/types';
import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';

const RESOLUTIONS: ReportResolution[] = ['WARNING', 'SUSPEND_7D', 'SUSPEND_30D', 'PERMABAN', 'DISMISSED'];

type ReportTab = 'all' | 'ban-queue';

export default function ReportsPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [reportTab, setReportTab] = useState<ReportTab>('all');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Report | null>(null);
  const [resolution, setResolution] = useState<ReportResolution>('WARNING');
  const [adminNote, setAdminNote] = useState('');
  const [error, setError] = useState('');

  // Filters
  const [filterType, setFilterType] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterReportedId, setFilterReportedId] = useState<string>('');

  // Ban queue
  const [banPassword, setBanPassword] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-reports', offset, filterType, filterCategory, filterStatus, filterReportedId],
    queryFn: () => adminService.getReportsFiltered({
      limit: 20,
      offset,
      type: filterType || undefined,
      category: filterCategory || undefined,
      status: filterStatus || undefined,
      reported_id: filterReportedId ? parseInt(filterReportedId) : undefined,
    }),
    enabled: reportTab === 'all',
  });

  const { data: banQueue, isLoading: banLoading } = useQuery({
    queryKey: ['admin-ban-queue'],
    queryFn: () => adminService.getBanQueue({ limit: 50 }),
    enabled: reportTab === 'ban-queue',
  });

  const resolveMut = useMutation({
    mutationFn: () => adminService.resolveReport(selected!.id, { resolution, admin_note: adminNote }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-reports'] }); qc.invalidateQueries({ queryKey: ['admin-ban-queue'] }); setSelected(null); setAdminNote(''); },
    onError: (err) => setError(getApiError(err)),
  });

  const banApproveMut = useMutation({
    mutationFn: (userId: number) => adminService.approveBan(userId, banPassword),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-ban-queue'] }); setBanPassword(''); },
    onError: (err) => setError(getApiError(err)),
  });

  const transporterCategories = ['RECKLESS_DRIVING', 'DAMAGED_GOODS', 'LATE_ARRIVAL', 'HARASSMENT', 'EXTRA_PAYMENT_DEMAND', 'NO_SHOW', 'FAKE_GPS', 'VEHICLE_MISMATCH', 'INTOXICATED_DRIVER', 'OVERCHARGED'];
  const customerCategories = ['WRONG_ADDRESS', 'UNDECLARED_EXTRA_GOODS', 'ABUSIVE_BEHAVIOR', 'REFUSED_PAYMENT', 'FAKE_BOOKING', 'ILLEGAL_GOODS', 'CUSTOMER_NO_SHOW', 'PROPERTY_DAMAGE', 'EXTORTION_THREAT', 'REPEATED_CANCELLATION'];

  return (
    <div className="space-y-6 animate-blur-fade-up">
      <header>
        <h1 className="text-headline-lg font-bold text-white">Reports & Moderation</h1>
        <p className="text-on-surface-variant">User reports, moderation queue, and ban approvals</p>
      </header>

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setReportTab('all')}
          className={`px-5 py-2.5 rounded-full text-label-caps text-[11px] flex items-center gap-2 transition-all ${
            reportTab === 'all' ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-surface-container border border-white/5 text-on-surface-variant hover:bg-white/5'
          }`}>
          <span className="material-symbols-outlined text-[16px]">description</span>
          All Reports
        </button>
        <button onClick={() => setReportTab('ban-queue')}
          className={`px-5 py-2.5 rounded-full text-label-caps text-[11px] flex items-center gap-2 transition-all ${
            reportTab === 'ban-queue' ? 'bg-error/20 text-error border border-error/30' : 'bg-surface-container border border-white/5 text-on-surface-variant hover:bg-white/5'
          }`}>
          <span className="material-symbols-outlined text-[16px]">gavel</span>
          Ban Approval Queue
          {banQueue?.data?.length ? <span className="bg-error/20 text-error px-1.5 py-0.5 rounded text-[9px]">{banQueue.data.length}</span> : null}
        </button>
      </div>

      {/* ═══ All Reports ═══ */}
      {reportTab === 'all' && (
        <>
          {/* Filters */}
          <div className="glass-panel rounded-xl p-4">
            <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
              <select value={filterType} onChange={(e) => { setFilterType(e.target.value); setOffset(0); setFilterCategory(''); }}
                className="glass-input rounded-lg px-3 py-2.5 text-sm text-on-surface">
                <option value="">All Types</option>
                <option value="CUSTOMER_REPORT">Reports on Customers</option>
                <option value="TRANSPORTER_REPORT">Reports on Transporters</option>
              </select>
              <select value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setOffset(0); }}
                className="glass-input rounded-lg px-3 py-2.5 text-sm text-on-surface">
                <option value="">All Categories</option>
                {(filterType === 'TRANSPORTER_REPORT' ? transporterCategories : filterType === 'CUSTOMER_REPORT' ? customerCategories : [...transporterCategories, ...customerCategories])
                  .map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
              <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setOffset(0); }}
                className="glass-input rounded-lg px-3 py-2.5 text-sm text-on-surface">
                <option value="">All Status</option>
                <option value="PENDING">Pending</option>
                <option value="RESOLVED">Resolved</option>
              </select>
              <input value={filterReportedId} onChange={(e) => { setFilterReportedId(e.target.value); setOffset(0); }}
                placeholder="Reported User ID"
                className="glass-input rounded-lg px-3 py-2.5 text-sm text-on-surface placeholder:text-outline w-40" />
              {(filterType || filterCategory || filterStatus || filterReportedId) && (
                <button onClick={() => { setFilterType(''); setFilterCategory(''); setFilterStatus(''); setFilterReportedId(''); setOffset(0); }}
                  className="text-xs text-tertiary hover:text-white transition-colors flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">clear_all</span> Clear
                </button>
              )}
            </div>
          </div>

          {/* Info box about auto-ban logic */}
          <div className="glass-panel rounded-xl p-4 border-l-2 border-l-amber-400/50 flex items-start gap-3">
            <span className="material-symbols-outlined text-amber-400 text-[20px] mt-0.5">info</span>
            <div className="text-sm text-on-surface-variant">
              <strong className="text-on-surface">Auto-moderation:</strong> When a user receives 4+ reports from different people, they get a <span className="text-amber-400 font-medium">warning email</span>.
              After 2 more reports (6+ total), the account is <span className="text-error font-medium">flagged for ban</span> — requires admin approval below.
            </div>
          </div>

          {/* Reports Table */}
          <div className="glass-panel rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left px-4 py-3 font-label-caps text-on-surface-variant">Category</th>
                    <th className="text-left px-4 py-3 font-label-caps text-on-surface-variant">Type</th>
                    <th className="text-left px-4 py-3 font-label-caps text-on-surface-variant">Reported</th>
                    <th className="text-left px-4 py-3 font-label-caps text-on-surface-variant">Booking</th>
                    <th className="text-left px-4 py-3 font-label-caps text-on-surface-variant">Status</th>
                    <th className="text-left px-4 py-3 font-label-caps text-on-surface-variant">AI Score</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && [...Array(5)].map((_, i) => (
                    <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-4 bg-surface-container rounded animate-pulse" /></td></tr>
                  ))}
                  {(data?.data as Report[])?.map((r) => (
                    <tr key={r.id} className="border-b border-white/5 hover:bg-white/5 transition">
                      <td className="px-4 py-3 font-medium text-on-surface text-xs">{r.category.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-3 text-xs">
                        <span className={`px-2 py-0.5 rounded ${r.type === 'TRANSPORTER_REPORT' ? 'bg-secondary/10 text-secondary border border-secondary/20' : 'bg-primary/10 text-primary border border-primary/20'}`}>
                          {r.type === 'TRANSPORTER_REPORT' ? 'On Transporter' : 'On Customer'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-on-surface-variant">#{r.reported_id}</td>
                      <td className="px-4 py-3 text-xs text-on-surface-variant">#{r.booking_id}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-label-caps ${
                          r.status === 'PENDING' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-tertiary/10 text-tertiary border border-tertiary/20'
                        }`}>{r.status}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-on-surface-variant">
                        {r.ai_severity != null ? (
                          <span className={r.ai_severity >= 0.85 ? 'text-error font-bold' : r.ai_severity >= 0.5 ? 'text-amber-400' : ''}>{r.ai_severity.toFixed(2)}</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {r.status === 'PENDING' && (
                          <button onClick={() => { setSelected(r); setError(''); }}
                            className="btn-3d text-white text-xs px-3 py-1.5 rounded-lg font-medium">Resolve</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data && data.total > 20 && (
              <div className="flex justify-between px-4 py-3 border-t border-white/10">
                <span className="text-xs text-outline">{offset + 1}–{Math.min(offset + 20, data.total)} of {data.total}</span>
                <div className="flex gap-2">
                  <button onClick={() => setOffset(Math.max(0, offset - 20))} disabled={offset === 0} className="text-sm text-primary disabled:text-outline font-medium">← Prev</button>
                  <button onClick={() => setOffset(offset + 20)} disabled={offset + 20 >= data.total} className="text-sm text-primary disabled:text-outline font-medium">Next →</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══ Ban Approval Queue ═══ */}
      {reportTab === 'ban-queue' && (
        <div className="space-y-4">
          <div className="glass-panel rounded-xl p-4 border-l-2 border-l-error/50">
            <p className="text-sm text-on-surface-variant">
              Users below have received <strong className="text-error">6+ reports</strong> from different people and a warning email was already sent.
              Admin approval is required to proceed with the ban.
            </p>
          </div>

          {banLoading && <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-surface-container rounded-xl animate-pulse" />)}</div>}

          {!banLoading && (!banQueue?.data || banQueue.data.length === 0) && (
            <div className="text-center py-16 text-outline glass-panel rounded-xl">
              <span className="material-symbols-outlined text-6xl text-tertiary/40 mb-4 block" style={{ fontVariationSettings: "'FILL' 1" }}>verified_user</span>
              <p>No accounts pending ban approval</p>
            </div>
          )}

          {error && reportTab === 'ban-queue' && <p className="text-error text-sm bg-error/10 p-3 rounded-lg">{error}</p>}

          {banQueue?.data?.map((item: any) => (
            <div key={item.user_id} className="glass-card rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 border-l-2 border-l-error/50">
              <div className="w-12 h-12 rounded-full bg-error/10 border border-error/20 flex items-center justify-center font-bold text-error flex-shrink-0">
                {item.user?.full_name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="flex-1">
                <div className="font-medium text-on-surface">{item.user?.full_name}</div>
                <div className="text-xs text-on-surface-variant">{item.user?.email} · ID: {item.user_id}</div>
                <div className="flex items-center gap-3 mt-2 text-xs">
                  <span className="bg-error/10 text-error px-2 py-0.5 rounded border border-error/20">
                    {item.report_count} reports
                  </span>
                  {item.warning_sent && (
                    <span className="bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20">
                      Warning sent
                    </span>
                  )}
                  <span className="text-on-surface-variant">Role: {item.user?.role}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <input value={banPassword} onChange={(e) => setBanPassword(e.target.value)}
                  type="password" placeholder="Admin password"
                  className="glass-input rounded-lg px-3 py-2 text-sm text-on-surface placeholder:text-outline w-40" />
                <button onClick={() => banApproveMut.mutate(item.user_id)} disabled={!banPassword || banApproveMut.isPending}
                  className="bg-gradient-to-b from-red-500 to-red-700 text-white font-semibold px-4 py-2 rounded-lg text-sm shadow-[0_2px_0_#7f1d1d] disabled:opacity-50">
                  {banApproveMut.isPending ? 'Banning…' : 'Approve Ban'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Resolve modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-on-surface">Resolve Report</h2>
            <div className="text-sm space-y-1">
              <div><span className="text-outline">Category:</span> <strong className="text-on-surface">{selected.category.replace(/_/g, ' ')}</strong></div>
              <div><span className="text-outline">Type:</span> <span className="text-on-surface-variant">{selected.type === 'TRANSPORTER_REPORT' ? 'Against Transporter' : 'Against Customer'}</span></div>
              <div><span className="text-outline">Reported User:</span> <span className="text-on-surface">#{selected.reported_id}</span></div>
              {selected.description && <div className="text-on-surface-variant bg-surface-container p-2 rounded-lg mt-2">{selected.description}</div>}
            </div>
            <div>
              <label className="block text-label-caps text-on-surface-variant mb-2">Resolution</label>
              <select value={resolution} onChange={(e) => setResolution(e.target.value as ReportResolution)}
                className="w-full glass-input rounded-lg px-3 py-2.5 text-sm text-on-surface">
                {RESOLUTIONS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <textarea value={adminNote} onChange={(e) => setAdminNote(e.target.value)}
              placeholder="Admin note…" rows={3}
              className="w-full glass-input rounded-lg px-4 py-2.5 text-sm text-on-surface placeholder:text-outline" />
            {error && <p className="text-error text-sm">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => setSelected(null)} className="flex-1 border border-outline-variant text-on-surface py-2.5 rounded-lg text-sm bg-surface-container">Cancel</button>
              <button onClick={() => resolveMut.mutate()} disabled={resolveMut.isPending}
                className="flex-1 btn-3d text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50">
                {resolveMut.isPending ? 'Resolving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
