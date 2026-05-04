'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService, getApiError } from '@speedygo/api-client';
import { SOSAlert } from '@speedygo/types';
import { useState } from 'react';
import { motion } from 'framer-motion';

export default function SOSPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<SOSAlert | null>(null);
  const [status, setStatus] = useState<'RESOLVED' | 'FALSE_ALARM'>('RESOLVED');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-sos'],
    queryFn: () => adminService.getActiveSos({ limit: 50 }),
    refetchInterval: 10_000,
  });

  const resolveMut = useMutation({
    mutationFn: () => adminService.resolveSos(selected!.id, { status, note }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-sos'] }); setSelected(null); setNote(''); },
    onError: (err) => setError(getApiError(err)),
  });

  return (
    <div className="space-y-6 animate-blur-fade-up">
      <header className="flex items-center gap-3">
        <h1 className="text-headline-lg font-bold text-white">SOS Alerts</h1>
        {(data?.total ?? 0) > 0 && (
          <span className="bg-red-500/20 text-red-400 text-sm font-bold px-3 py-1 rounded-full border border-red-500/30 animate-pulse">
            {data?.total} Active
          </span>
        )}
      </header>

      {isLoading && <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-surface-container rounded-xl animate-pulse" />)}</div>}

      {data?.data.length === 0 && (
        <div className="text-center py-16 text-outline glass-panel rounded-xl">
          <span className="material-symbols-outlined text-6xl text-tertiary/40 mb-4 block" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          <p>No active SOS alerts</p>
        </div>
      )}

      <div className="space-y-3 stagger-children">
        {(data?.data as SOSAlert[])?.map((alert) => (
          <motion.div key={alert.id} whileHover={{ scale: 1.005 }}
            className="bg-red-900/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-red-400 text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>emergency</span>
            </div>
            <div className="flex-1">
              <div className="font-semibold text-red-400">Booking #{alert.booking_id}</div>
              <div className="text-sm text-on-surface-variant flex items-center gap-1 mt-0.5">
                <span className="material-symbols-outlined text-[14px]">location_on</span>{alert.lat.toFixed(4)}, {alert.lng.toFixed(4)}
              </div>
              <div className="text-xs text-outline mt-1">{new Date(alert.created_at).toLocaleString()}</div>
            </div>
            <button onClick={() => { setSelected(alert); setError(''); }}
              className="bg-gradient-to-b from-red-500 to-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-[0_2px_0_#7f1d1d]">
              Resolve
            </button>
          </motion.div>
        ))}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-on-surface">Resolve SOS Alert</h2>
            <div className="text-sm text-on-surface-variant">Booking #{selected.booking_id} · {selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}</div>
            <div>
              <label className="block text-label-caps text-on-surface-variant mb-2">Outcome</label>
              <div className="flex gap-3">
                {(['RESOLVED', 'FALSE_ALARM'] as const).map((s) => (
                  <button key={s} onClick={() => setStatus(s)}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition ${
                      status === s ? 'btn-3d text-white' : 'border-outline-variant/30 text-on-surface-variant hover:bg-white/5'
                    }`}>
                    {s.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Resolution note…" rows={3}
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
