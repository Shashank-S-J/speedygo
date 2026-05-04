'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService, getApiError } from '@speedygo/api-client';
import { Pricing, VehicleType } from '@speedygo/types';
import { useState } from 'react';

const VEHICLE_TYPES: VehicleType[] = ['AUTO_RICKSHAW', 'TEMPO', 'MINI_TRUCK', 'TRUCK', 'TRAILER'];
const VEHICLE_LABELS: Record<string, string> = { AUTO_RICKSHAW: '🛺 Auto', TEMPO: '🚐 Tempo', MINI_TRUCK: '🚛 Mini Truck', TRUCK: '🚚 Truck', TRAILER: '🚛 Trailer' };

export default function PricingPage() {
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [editType, setEditType] = useState<string | null>(null);
  const [form, setForm] = useState({ base_price_paise: 0, price_per_km_paise: 0, loading_charges_paise: 0, surge_multiplier: 1, min_distance_km: 1 });

  const { data: pricing } = useQuery({ queryKey: ['admin-pricing'], queryFn: adminService.getPricing });

  const saveMut = useMutation({
    mutationFn: () => adminService.upsertPricing({ vehicle_type: editType! as VehicleType, ...form }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-pricing'] }); setEditType(null); setError(''); },
    onError: (err) => setError(getApiError(err)),
  });

  const startEdit = (type: string) => {
    const existing = pricing?.find((p: Pricing) => p.vehicle_type === type);
    if (existing) {
      setForm({ base_price_paise: existing.base_price_paise, price_per_km_paise: existing.price_per_km_paise, loading_charges_paise: existing.loading_charges_paise, surge_multiplier: existing.surge_multiplier, min_distance_km: existing.min_distance_km });
    } else {
      setForm({ base_price_paise: 5000, price_per_km_paise: 1500, loading_charges_paise: 2000, surge_multiplier: 1, min_distance_km: 1 });
    }
    setEditType(type);
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Pricing Management</h1>
        <p className="text-sm text-gray-400">Set base price, per km rate, and loading charges per vehicle type</p>
      </header>

      {error && <p className="text-red-400 text-sm bg-red-900/20 px-4 py-2 rounded-lg">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {VEHICLE_TYPES.map((type) => {
          const p = pricing?.find((pr: Pricing) => pr.vehicle_type === type);
          return (
            <div key={type} className="bg-gray-800/50 border border-gray-700 rounded-xl p-5 space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-white">{VEHICLE_LABELS[type]}</h3>
                <button onClick={() => startEdit(type)} className="text-blue-400 text-xs hover:text-blue-300">Edit</button>
              </div>
              {p ? (
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-gray-400">Base</span><span className="text-white">₹{(p.base_price_paise / 100).toFixed(0)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Per km</span><span className="text-white">₹{(p.price_per_km_paise / 100).toFixed(0)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Loading</span><span className="text-white">₹{(p.loading_charges_paise / 100).toFixed(0)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Surge</span><span className="text-white">{p.surge_multiplier}x</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Min dist</span><span className="text-white">{p.min_distance_km} km</span></div>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">Not configured</p>
              )}
            </div>
          );
        })}
      </div>

      {editType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Edit Pricing: {VEHICLE_LABELS[editType]}</h3>
              <button onClick={() => setEditType(null)} className="text-gray-400 hover:text-white text-2xl">&times;</button>
            </div>
            {[
              { key: 'base_price_paise', label: 'Base Price (paise)', help: '₹' + (form.base_price_paise / 100).toFixed(2) },
              { key: 'price_per_km_paise', label: 'Price Per Km (paise)', help: '₹' + (form.price_per_km_paise / 100).toFixed(2) + '/km' },
              { key: 'loading_charges_paise', label: 'Loading Charges (paise)', help: '₹' + (form.loading_charges_paise / 100).toFixed(2) },
              { key: 'surge_multiplier', label: 'Surge Multiplier', help: '' },
              { key: 'min_distance_km', label: 'Min Distance (km)', help: '' },
            ].map((f) => (
              <div key={f.key}>
                <label className="block text-xs text-gray-400 mb-1">{f.label}</label>
                <input
                  type="number"
                  value={(form as any)[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: Number(e.target.value) })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                />
                {f.help && <span className="text-xs text-gray-500">{f.help}</span>}
              </div>
            ))}
            <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-50">
              {saveMut.isPending ? 'Saving...' : 'Save Pricing'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


