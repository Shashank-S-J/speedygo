'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vehicleService, getApiError } from '@speedygo/api-client';
import { Vehicle, VehicleType, UpdateVehicleRequest } from '@speedygo/types';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const VEHICLE_TYPES: VehicleType[] = ['AUTO_RICKSHAW', 'TEMPO', 'MINI_TRUCK', 'TRUCK', 'TRAILER'];
const VEHICLE_ICONS: Record<string, string> = { AUTO_RICKSHAW: '🛺', TEMPO: '🚐', MINI_TRUCK: '🚛', TRUCK: '🚚', TRAILER: '🚛' };

const STATUS_COLORS: Record<string, string> = {
  APPROVED: 'bg-tertiary/10 text-tertiary border-tertiary/20',
  PENDING: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  REJECTED: 'bg-error/10 text-error border-error/20',
};

export default function VehiclesPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ type: 'MINI_TRUCK' as VehicleType, registration_no: '', max_weight_kg: 750, make: '', model: '', year: 0, insurance_no: '', insurance_provider: '', insurance_expiry: '' });
  const [editForm, setEditForm] = useState<UpdateVehicleRequest>({});
  const [error, setError] = useState('');

  const { data: vehicles, refetch } = useQuery({ queryKey: ['my-vehicles'], queryFn: vehicleService.listMy });

  const createMut = useMutation({
    mutationFn: () => vehicleService.create({ ...form, year: form.year || undefined, insurance_no: form.insurance_no || undefined, insurance_provider: form.insurance_provider || undefined, insurance_expiry: form.insurance_expiry || undefined }),
    onSuccess: () => { setShowForm(false); refetch(); setForm({ type: 'MINI_TRUCK', registration_no: '', max_weight_kg: 750, make: '', model: '', year: 0, insurance_no: '', insurance_provider: '', insurance_expiry: '' }); setError(''); },
    onError: (err) => setError(getApiError(err)),
  });

  const updateMut = useMutation({
    mutationFn: (id: number) => vehicleService.update(id, editForm),
    onSuccess: () => { setEditingId(null); refetch(); setError(''); },
    onError: (err) => setError(getApiError(err)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => vehicleService.delete(id),
    onSuccess: () => { refetch(); },
    onError: (err) => setError(getApiError(err)),
  });

  const startEdit = (v: Vehicle) => {
    setEditingId(v.id);
    setEditForm({ make: v.make, model: v.model, year: v.year, max_weight_kg: v.max_weight_kg, insurance_no: v.insurance_no, insurance_provider: v.insurance_provider, insurance_expiry: v.insurance_expiry?.split('T')[0] });
  };

  return (
    <div className="space-y-6 animate-blur-fade-up">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-headline-lg font-bold text-white">My Vehicles</h2>
          <p className="text-on-surface-variant">{vehicles?.length ?? 0} registered (max 1)</p>
        </div>
        {(!vehicles || vehicles.length === 0) && (
          <button onClick={() => setShowForm(!showForm)}
            className="btn-3d text-white text-sm font-medium px-4 py-2.5 rounded-lg flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">add</span> Add Vehicle
          </button>
        )}
      </header>

      {vehicles && vehicles.length > 0 && !showForm && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 text-sm text-on-surface-variant flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[18px]">info</span>
          You can only have 1 vehicle at a time. Delete your current vehicle to register a new one. New vehicles require admin approval.
        </div>
      )}

      {error && <p className="text-error text-sm bg-error/10 px-4 py-2 rounded-lg">{error}</p>}

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="glass-panel rounded-xl p-6 space-y-4">
            <h3 className="text-on-surface font-semibold">Add Vehicle</h3>
            <p className="text-xs text-on-surface-variant">Vehicle will need admin approval before it can receive bookings.</p>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as VehicleType })}
              className="w-full glass-input rounded-lg px-3 py-2.5 text-sm text-on-surface">
              {VEHICLE_TYPES.map((t) => <option key={t} value={t}>{VEHICLE_ICONS[t]} {t.replace(/_/g, ' ')}</option>)}
            </select>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: 'registration_no', label: 'Registration No.', placeholder: 'KA01AB1234', type: 'text' },
                { key: 'make', label: 'Make', placeholder: 'Tata', type: 'text' },
                { key: 'model', label: 'Model', placeholder: 'Ace Gold', type: 'text' },
                { key: 'year', label: 'Year', placeholder: '2023', type: 'number' },
                { key: 'max_weight_kg', label: 'Max Weight (kg)', placeholder: '750', type: 'number' },
                { key: 'insurance_no', label: 'Insurance Policy No.', placeholder: 'POL-123456', type: 'text' },
                { key: 'insurance_provider', label: 'Insurance Provider', placeholder: 'ICICI Lombard', type: 'text' },
                { key: 'insurance_expiry', label: 'Insurance Expiry', placeholder: '', type: 'date' },
              ].map((f) => (
                <div key={f.key}>
                  <label className="block text-label-caps text-on-surface-variant mb-1">{f.label}</label>
                  <input type={f.type} value={(form as any)[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value })}
                    placeholder={f.placeholder} className="w-full glass-input rounded-lg px-4 py-2.5 text-sm text-on-surface placeholder:text-outline" />
                </div>
              ))}
            </div>
            <button onClick={() => createMut.mutate()} disabled={createMut.isPending}
              className="w-full btn-3d text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50">
              {createMut.isPending ? 'Saving…' : 'Submit for Approval'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {vehicles?.length === 0 && (
        <div className="text-center py-12 text-outline">
          <span className="material-symbols-outlined text-6xl text-outline-variant/40 mb-4 block">local_shipping</span>
          No vehicles yet. Add one above.
        </div>
      )}

      <div className="space-y-3 stagger-children">
        {vehicles?.map((v: Vehicle) => (
          <motion.div key={v.id} whileHover={{ scale: 1.005 }}
            className="glass-card rounded-xl p-4 hover:border-primary/30 transition-all">
            {editingId === v.id ? (
              <div className="space-y-3">
                <h4 className="text-on-surface font-semibold">Edit: {v.registration_no}</h4>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'make', label: 'Make', type: 'text' },
                    { key: 'model', label: 'Model', type: 'text' },
                    { key: 'year', label: 'Year', type: 'number' },
                    { key: 'max_weight_kg', label: 'Max Weight (kg)', type: 'number' },
                    { key: 'insurance_no', label: 'Policy No.', type: 'text' },
                    { key: 'insurance_provider', label: 'Provider', type: 'text' },
                    { key: 'insurance_expiry', label: 'Insurance Expiry', type: 'date' },
                  ].map((f) => (
                    <div key={f.key}>
                      <label className="text-xs text-on-surface-variant">{f.label}</label>
                      <input type={f.type} value={(editForm as any)[f.key] ?? ''} onChange={(e) => setEditForm({ ...editForm, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value })}
                        className="w-full glass-input rounded px-3 py-1.5 text-sm text-on-surface" />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => updateMut.mutate(v.id)} disabled={updateMut.isPending} className="btn-3d text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50">Save</button>
                  <button onClick={() => setEditingId(null)} className="px-4 py-2 rounded-lg border border-outline-variant/30 text-on-surface-variant text-sm">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-2xl">
                  {VEHICLE_ICONS[v.type] ?? '🚛'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-on-surface">{v.type.replace(/_/g, ' ')}</div>
                  <div className="text-sm text-on-surface-variant">{v.registration_no}</div>
                  {v.make && <div className="text-xs text-outline">{v.make} {v.model} {v.year ? `(${v.year})` : ''}</div>}
                  <div className="text-xs text-outline">Max: {v.max_weight_kg} kg</div>
                  {v.insurance_expiry && <div className="text-xs text-outline">Ins: {new Date(v.insurance_expiry).toLocaleDateString()}{v.insurance_provider ? ` · ${v.insurance_provider}` : ''}</div>}
                  {v.approval_note && v.approval_status === 'REJECTED' && (
                    <div className="text-xs text-error mt-1">Rejected: {v.approval_note}</div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-label-caps border ${STATUS_COLORS[v.approval_status] || STATUS_COLORS.PENDING}`}>
                    {v.approval_status}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => startEdit(v)} className="p-1.5 rounded-lg hover:bg-white/5" title="Edit">
                      <span className="material-symbols-outlined text-outline text-[18px]">edit</span>
                    </button>
                    <button onClick={() => { if (confirm('Delete this vehicle? You will need to register a new vehicle and get admin approval again before accepting bookings.')) deleteMut.mutate(v.id); }} className="p-1.5 rounded-lg hover:bg-error/10" title="Delete">
                      <span className="material-symbols-outlined text-error text-[18px]">delete</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
