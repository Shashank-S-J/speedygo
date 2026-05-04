'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService, getApiError } from '@speedygo/api-client';
import { Vehicle } from '@speedygo/types';
import { useState } from 'react';
import { motion } from 'framer-motion';

export default function VehiclesApprovalPage() {
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [noteMap, setNoteMap] = useState<Record<number, string>>({});
  const [tab, setTab] = useState<'pending' | 'history'>('pending');

  const { data } = useQuery({
    queryKey: ['admin-pending-vehicles'],
    queryFn: () => adminService.getPendingVehicles({ limit: 50 }),
  });
  const vehicles = data?.data ?? [];

  const reviewMut = useMutation({
    mutationFn: ({ id, action, note }: { id: number; action: 'approve' | 'reject'; note?: string }) =>
      adminService.reviewVehicle(id, action, note),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-pending-vehicles'] }); setError(''); },
    onError: (err) => setError(getApiError(err)),
  });

  return (
    <div className="space-y-6 animate-blur-fade-up">
      <header>
        <h1 className="text-headline-lg font-bold text-white">Vehicle KYC Approvals</h1>
        <p className="text-on-surface-variant">{vehicles.length} pending approval{vehicles.length !== 1 ? 's' : ''}</p>
      </header>

      {error && (
        <div className="glass-panel rounded-xl p-3 border-l-2 border-l-error flex items-center gap-2">
          <span className="material-symbols-outlined text-error text-[18px]">error</span>
          <p className="text-error text-sm">{error}</p>
        </div>
      )}

      {vehicles.length === 0 && (
        <div className="text-center py-16 text-outline glass-panel rounded-xl">
          <span className="material-symbols-outlined text-6xl text-tertiary/40 mb-4 block" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
          <p>No pending vehicle approvals</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 stagger-children">
        {vehicles.map((v: Vehicle) => (
          <motion.div key={v.id} whileHover={{ scale: 1.01 }}
            className="glass-card rounded-2xl overflow-hidden relative">
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-on-surface text-lg">{v.type.replace(/_/g, ' ')}</h3>
                  <p className="text-sm text-on-surface-variant">{v.registration_no}</p>
                  {v.make && <p className="text-xs text-outline mt-1">{v.make} {v.model} {v.year ? `(${v.year})` : ''}</p>}
                </div>
                <div className="p-2 rounded-lg bg-surface-container border border-white/5">
                  <span className="material-symbols-outlined text-primary">local_shipping</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center pb-2 border-b border-white/5">
                  <span className="text-sm text-on-surface-variant">Max Weight</span>
                  <span className="text-sm text-on-surface font-medium">{v.max_weight_kg} kg</span>
                </div>
                {v.insurance_expiry && (
                  <div className="flex justify-between items-center pb-2 border-b border-white/5">
                    <span className="text-sm text-on-surface-variant">Insurance Expiry</span>
                    <span className="text-sm text-on-surface">{new Date(v.insurance_expiry).toLocaleDateString()}</span>
                  </div>
                )}
                {v.insurance_no && (
                  <div className="flex justify-between items-center pb-2 border-b border-white/5">
                    <span className="text-sm text-on-surface-variant">Policy No.</span>
                    <span className="text-sm text-on-surface">{v.insurance_no}</span>
                  </div>
                )}
              </div>

              <input
                value={noteMap[v.id] ?? ''}
                onChange={(e) => setNoteMap({ ...noteMap, [v.id]: e.target.value })}
                placeholder="Note (optional)"
                className="w-full glass-input rounded-lg px-3 py-2 text-sm text-on-surface placeholder:text-outline"
              />

              <div className="flex gap-3">
                <button
                  onClick={() => reviewMut.mutate({ id: v.id, action: 'reject', note: noteMap[v.id] })}
                  disabled={reviewMut.isPending}
                  className="flex-1 py-2.5 rounded-lg border border-error/50 text-error hover:bg-error/10 text-label-caps transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span> Reject
                </button>
                <button
                  onClick={() => reviewMut.mutate({ id: v.id, action: 'approve', note: noteMap[v.id] })}
                  disabled={reviewMut.isPending}
                  className="flex-1 btn-3d rounded-lg text-white text-label-caps flex items-center justify-center gap-2 py-2.5 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">check_circle</span> Approve
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
