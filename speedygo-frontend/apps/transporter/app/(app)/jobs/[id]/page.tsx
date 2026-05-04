'use client';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bookingService, bidService, vehicleService, getApiError } from '@speedygo/api-client';
import { useState } from 'react';
import { Vehicle } from '@speedygo/types';

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const id = Number(params.id);
  const [bidAmount, setBidAmount] = useState('');
  const [bidNote, setBidNote] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState<number | null>(null);
  const [bidError, setBidError] = useState('');

  const { data: booking } = useQuery({ queryKey: ['booking', id], queryFn: () => bookingService.getById(id), enabled: !Number.isNaN(id) });
  const { data: allVehicles } = useQuery({ queryKey: ['my-vehicles'], queryFn: vehicleService.listMy });
  const vehicles = allVehicles?.filter((v: Vehicle) => v.approval_status === 'APPROVED');

  const placeBidMut = useMutation({
    mutationFn: () => bidService.place(id, {
      vehicle_id: selectedVehicle!,
      amount_paise: Math.round(Number.parseFloat(bidAmount) * 100),
      note: bidNote || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['booking', id] }); setBidAmount(''); setBidNote(''); },
    onError: (err) => setBidError(getApiError(err)),
  });

  const [acceptError, setAcceptError] = useState('');

  const acceptMut = useMutation({
    mutationFn: () => bookingService.accept(id, selectedVehicle!),
    onSuccess: (b) => router.push(`/active/${b.id}`),
    onError: (err) => setAcceptError(getApiError(err)),
  });

  if (Number.isNaN(id)) return <div className="text-center py-16 text-outline">Invalid job ID</div>;

  if (!booking) return <div className="flex justify-center py-16"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>;

  const estimateRs = (booking.estimated_price ?? 0) / 100;
  const minBid = estimateRs * 0.5;
  const maxBid = estimateRs * 2;

  return (
    <div className="space-y-4 pb-6 animate-blur-fade-up">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-outline hover:text-on-surface transition">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-lg font-bold text-on-surface">Job #{id}</h2>
        <span className={`ml-auto text-xs px-2.5 py-1 rounded-full font-label-caps ${
          booking.status === 'BIDDING' ? 'bg-secondary/10 text-secondary border border-secondary/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
        }`}>{booking.status}</span>
      </div>

      <div className="glass-card rounded-xl p-4 space-y-3">
        <div className="flex gap-3">
          <div className="flex flex-col items-center mt-0.5">
            <div className="w-3 h-3 rounded-full bg-tertiary shadow-[0_0_8px_rgba(76,215,246,0.8)]" />
            <div className="w-0.5 h-6 bg-outline-variant/30 my-0.5" />
            <div className="w-3 h-3 rounded-full bg-primary shadow-[0_0_8px_rgba(173,198,255,0.8)]" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="text-sm font-medium text-on-surface">{booking.pickup_address}</div>
            <div className="text-sm text-on-surface-variant">{booking.drop_address}</div>
          </div>
        </div>
        <div className="flex gap-4 text-xs text-outline mt-2 pl-6">
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">straighten</span>{booking.distance_km?.toFixed(1)} km
          </span>
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">scale</span>{booking.goods_weight_kg} kg
          </span>
          {booking.goods_fragile && <span>🫙 Fragile</span>}
          <span className="text-on-surface font-semibold">₹{estimateRs.toLocaleString('en-IN')} est.</span>
        </div>
        {booking.goods_description && <p className="text-xs text-on-surface-variant pl-6">{booking.goods_description}</p>}
      </div>

      {/* Vehicle selector */}
      {vehicles && vehicles.length > 0 && (
        <div className="glass-panel rounded-xl p-4">
          <label htmlFor="vehicle-select" className="block text-label-caps text-on-surface-variant mb-2">Select Vehicle</label>
          <select id="vehicle-select" value={selectedVehicle ?? ''} onChange={(e) => setSelectedVehicle(Number(e.target.value))}
            className="w-full glass-input rounded-lg px-3 py-2.5 text-sm text-on-surface">
            <option value="">— Select —</option>
            {vehicles.map((v: Vehicle) => (
              <option key={v.id} value={v.id}>{v.type} — {v.registration_no} ({v.max_weight_kg} kg)</option>
            ))}
          </select>
        </div>
      )}

      {/* Direct accept (PENDING) */}
      {booking.status === 'PENDING' && (
        <>
          {acceptError && (
            <div className="bg-error/10 border border-error/20 rounded-lg px-4 py-3 text-error text-sm">
              {acceptError}
              <button onClick={() => setAcceptError('')} className="ml-2 text-error/70 underline text-xs">Dismiss</button>
            </div>
          )}
          <button
            onClick={() => acceptMut.mutate()}
            disabled={!selectedVehicle || acceptMut.isPending}
            className="w-full btn-3d disabled:opacity-50 text-white font-bold py-3 rounded-xl transition"
          >
            {acceptMut.isPending ? 'Accepting…' : 'Accept Job'}
          </button>
        </>
      )}

      {/* Bid form (BIDDING) */}
      {booking.status === 'BIDDING' && (
        <div className="glass-panel rounded-xl p-4 space-y-3 border-secondary/20">
          <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-[18px]">gavel</span> Place a Bid
          </h3>
          <p className="text-xs text-on-surface-variant">Valid range: ₹{minBid.toFixed(0)} – ₹{maxBid.toFixed(0)}</p>
          <input
            value={bidAmount}
            onChange={(e) => setBidAmount(e.target.value)}
            type="number"
            placeholder="Your bid amount (₹)"
            className="w-full glass-input rounded-lg px-4 py-2.5 text-sm text-on-surface placeholder:text-outline"
          />
          <input
            value={bidNote}
            onChange={(e) => setBidNote(e.target.value)}
            placeholder="Note (optional)"
            className="w-full glass-input rounded-lg px-4 py-2.5 text-sm text-on-surface placeholder:text-outline"
          />
          {bidError && <p className="text-error text-xs">{bidError}</p>}
          <button
            onClick={() => placeBidMut.mutate()}
            disabled={!bidAmount || !selectedVehicle || placeBidMut.isPending}
            className="w-full bg-gradient-to-b from-secondary to-secondary-container disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_3px_0_#2d2a5b] hover:translate-y-[1px] active:translate-y-[2px] active:shadow-none transition-all"
          >
            {placeBidMut.isPending ? 'Placing bid…' : 'Place Bid'}
          </button>
        </div>
      )}
    </div>
  );
}

