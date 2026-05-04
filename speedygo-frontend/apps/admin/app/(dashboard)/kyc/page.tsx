'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService, getApiError } from '@speedygo/api-client';
import { KYCQueueItem } from '@speedygo/types';
import { useState } from 'react';
import { motion } from 'framer-motion';

type Tab = 'pending' | 'approved' | 'rejected';

export default function KYCPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('pending');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<KYCQueueItem | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const { data: pendingData, isLoading: pendingLoading, isError: pendingError, refetch } = useQuery({
    queryKey: ['admin-kyc', offset],
    queryFn: () => adminService.getKycQueue({ limit: 20, offset }),
    enabled: tab === 'pending',
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['admin-kyc-history', tab, offset],
    queryFn: () => adminService.getKycHistory({ status: tab === 'approved' ? 'VERIFIED' : 'REJECTED', limit: 20, offset }),
    enabled: tab !== 'pending',
  });

  const reviewMut = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      adminService.reviewKyc(id, { approved, admin_note: note }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-kyc'] }); qc.invalidateQueries({ queryKey: ['admin-kyc-history'] }); setSelected(null); setNote(''); },
    onError: (err) => setError(getApiError(err)),
  });

  const data = tab === 'pending' ? pendingData : historyData;
  const isLoading = tab === 'pending' ? pendingLoading : historyLoading;
  const items = (data?.data as KYCQueueItem[]) ?? [];

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'pending', label: 'Pending', icon: 'hourglass_top' },
    { key: 'approved', label: 'Approved', icon: 'check_circle' },
    { key: 'rejected', label: 'Rejected', icon: 'cancel' },
  ];

  return (
    <div className="space-y-6 animate-blur-fade-up">
      <header>
        <h1 className="text-headline-lg font-bold text-white">Vehicle KYC Approvals</h1>
        <p className="text-on-surface-variant">Review and approve user verification documents</p>
      </header>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => { setTab(t.key); setOffset(0); }}
            className={`px-5 py-2.5 rounded-full text-label-caps text-[11px] flex items-center gap-2 transition-all whitespace-nowrap ${
              tab === t.key
                ? 'bg-primary/20 text-primary border border-primary/30 shadow-[0_0_15px_rgba(173,198,255,0.2)]'
                : 'bg-surface-container border border-white/5 text-on-surface-variant hover:text-on-surface hover:bg-white/5'
            }`}>
            <span className="material-symbols-outlined text-[16px]" style={tab === t.key ? { fontVariationSettings: "'FILL' 1" } : undefined}>{t.icon}</span>
            {t.label}
            {t.key === 'pending' && pendingData?.total != null && (
              <span className="bg-tertiary/20 text-tertiary px-1.5 py-0.5 rounded text-[9px] ml-1">{pendingData.total}</span>
            )}
          </button>
        ))}
      </div>

      {isLoading && <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-surface-container rounded-xl animate-pulse" />)}</div>}

      {tab === 'pending' && pendingError && (
        <div className="glass-panel rounded-xl p-4 text-error text-sm flex justify-between items-center border-l-2 border-l-error">
          <span>Failed to load KYC queue.</span>
          <button onClick={() => refetch()} className="text-tertiary font-medium underline text-xs">Retry</button>
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="text-center py-16 text-outline glass-panel rounded-xl">
          <span className="material-symbols-outlined text-6xl text-tertiary/40 mb-4 block" style={{ fontVariationSettings: "'FILL' 1" }}>
            {tab === 'pending' ? 'check_circle' : tab === 'approved' ? 'verified' : 'block'}
          </span>
          <p>{tab === 'pending' ? 'No pending KYC submissions' : tab === 'approved' ? 'No approved submissions yet' : 'No rejected submissions yet'}</p>
        </div>
      )}

      <div className="space-y-3 stagger-children">
        {items.map((item) => (
          <motion.div key={item.id} whileHover={{ scale: 1.005 }}
            className={`glass-card rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 transition-all ${
              tab === 'approved' ? 'border-l-2 border-l-tertiary/50' : tab === 'rejected' ? 'border-l-2 border-l-error/50 opacity-80' : 'hover:border-primary/30'
            }`}>
            <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-primary flex-shrink-0">
              {item.user?.full_name?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-on-surface">{item.user?.full_name}</div>
              <div className="text-xs text-on-surface-variant">{item.user?.email}</div>
              <div className="flex gap-2 mt-1 text-xs flex-wrap">
                {item.aadhaar_number && <span className="bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20">Aadhaar</span>}
                {item.pan_number && <span className="bg-tertiary/10 text-tertiary px-2 py-0.5 rounded border border-tertiary/20">PAN</span>}
                {item.dl_number && <span className="bg-secondary/10 text-secondary px-2 py-0.5 rounded border border-secondary/20">DL</span>}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className={`text-xs px-2.5 py-1 rounded-full font-label-caps mb-2 inline-block ${
                item.status === 'PROCESSING' || item.status === 'PENDING' || item.status === 'MANUAL_REVIEW'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : item.status === 'VERIFIED'
                  ? 'bg-tertiary/10 text-tertiary border border-tertiary/20'
                  : item.status === 'REJECTED'
                  ? 'bg-error/10 text-error border border-error/20'
                  : 'bg-outline/10 text-outline border border-outline/20'
              }`}>{item.status}</div>
              {item.ai_risk_score != null && (
                <div className="text-xs text-outline">AI Risk: {item.ai_risk_score.toFixed(2)}</div>
              )}
              {item.admin_note && (
                <div className="text-xs text-on-surface-variant mt-1 max-w-[200px] truncate" title={item.admin_note}>
                  Note: {item.admin_note}
                </div>
              )}
            </div>
            {tab === 'pending' ? (
              <button onClick={() => setSelected(item)}
                className="btn-3d text-white text-sm font-medium px-4 py-2 rounded-lg flex-shrink-0">
                Review
              </button>
            ) : (
              <button onClick={() => setSelected(item)}
                className="text-outline hover:text-on-surface border border-white/10 px-3 py-2 rounded-lg text-xs transition-colors flex-shrink-0">
                Details
              </button>
            )}
          </motion.div>
        ))}
      </div>

      {/* Pagination */}
      {data && data.total > 20 && (
        <div className="flex justify-between items-center px-2">
          <span className="text-xs text-outline">{offset + 1}–{Math.min(offset + 20, data.total)} of {data.total}</span>
          <div className="flex gap-2">
            <button onClick={() => setOffset(Math.max(0, offset - 20))} disabled={offset === 0}
              className="text-sm text-primary disabled:text-outline font-medium">← Prev</button>
            <button onClick={() => setOffset(offset + 20)} disabled={offset + 20 >= data.total}
              className="text-sm text-primary disabled:text-outline font-medium">Next →</button>
          </div>
        </div>
      )}

      {/* Review / Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between">
              <h2 className="text-lg font-bold text-on-surface">
                {tab === 'pending' ? 'Review KYC' : 'KYC Details'} — {selected.user?.full_name}
              </h2>
              <button onClick={() => { setSelected(null); setError(''); }} className="text-outline hover:text-on-surface text-2xl leading-none">×</button>
            </div>

            <div className="space-y-2 text-sm">
              {selected.aadhaar_number && <div><span className="text-outline">Aadhaar:</span> <span className="text-on-surface">{selected.aadhaar_number}</span> {selected.aadhaar_verified && <span className="text-tertiary text-xs ml-1">✓ Verified</span>}</div>}
              {selected.pan_number && <div><span className="text-outline">PAN:</span> <span className="text-on-surface">{selected.pan_number}</span> {selected.pan_verified && <span className="text-tertiary text-xs ml-1">✓ Verified</span>}</div>}
              {selected.dl_number && <div><span className="text-outline">DL:</span> <span className="text-on-surface">{selected.dl_number}</span> {selected.dl_verified && <span className="text-tertiary text-xs ml-1">✓ Verified</span>}</div>}
              {selected.ai_risk_score != null && (
                <div className="flex items-center gap-2">
                  <span className="text-outline">AI Risk Score:</span>
                  <span className={`font-medium ${selected.ai_risk_score >= 0.7 ? 'text-error' : selected.ai_risk_score >= 0.4 ? 'text-amber-400' : 'text-tertiary'}`}>
                    {selected.ai_risk_score.toFixed(2)}
                  </span>
                </div>
              )}
              {selected.ai_flags && selected.ai_flags.length > 0 && (
                <div>
                  <span className="text-outline">AI Flags:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selected.ai_flags.map((f, i) => (
                      <span key={i} className="bg-error/10 text-error px-2 py-0.5 rounded text-xs border border-error/20">{f}</span>
                    ))}
                  </div>
                </div>
              )}
              {selected.doc_urls?.length > 0 && (
                <div>
                  <div className="text-outline mb-2">Documents:</div>
                  <div className="grid grid-cols-2 gap-2">
                    {selected.doc_urls.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                        className="block bg-surface-container rounded-lg border border-white/5 p-2 hover:border-primary/30 transition-colors">
                        <div className="text-primary text-xs truncate">{url.split('/').pop()}</div>
                        <span className="text-[10px] text-outline">Click to view</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {selected.admin_note && tab !== 'pending' && (
                <div className="bg-surface-container rounded-lg p-3 border border-white/5">
                  <span className="text-outline text-xs">Admin Note:</span>
                  <p className="text-on-surface text-sm mt-1">{selected.admin_note}</p>
                </div>
              )}
              {selected.verified_at && (
                <div className="text-xs text-outline">
                  {tab === 'approved' ? 'Approved' : 'Reviewed'} at: {new Date(selected.verified_at).toLocaleString()}
                </div>
              )}
            </div>

            {tab === 'pending' && (
              <>
                <textarea value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="Admin note (required for rejection)…" rows={3}
                  className="w-full glass-input rounded-lg px-4 py-2.5 text-sm text-on-surface placeholder:text-outline" />
                {error && <p className="text-error text-sm">{error}</p>}
                <div className="flex gap-3">
                  <button onClick={() => reviewMut.mutate({ id: selected.id, approved: false })} disabled={reviewMut.isPending}
                    className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-b from-red-500 to-red-700 text-white font-semibold py-2.5 rounded-lg shadow-[0_2px_0_#7f1d1d] transition">
                    <span className="material-symbols-outlined text-[18px]">cancel</span> Reject
                  </button>
                  <button onClick={() => reviewMut.mutate({ id: selected.id, approved: true })} disabled={reviewMut.isPending}
                    className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-b from-tertiary to-tertiary-container text-on-tertiary font-semibold py-2.5 rounded-lg shadow-[0_2px_0_#003640] transition">
                    <span className="material-symbols-outlined text-[18px]">check_circle</span> Approve
                  </button>
                </div>
              </>
            )}

            {tab !== 'pending' && (
              <button onClick={() => { setSelected(null); setError(''); }}
                className="w-full border border-outline-variant text-on-surface py-2.5 rounded-lg text-sm bg-surface-container">
                Close
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
