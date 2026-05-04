'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bookingService, vehicleService, bidService, getApiError } from '@speedygo/api-client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Booking, Vehicle } from '@speedygo/types';
import { motion } from 'framer-motion';

export default function JobsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [radius, setRadius] = useState(25);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition((p) =>
      setUserLoc({ lat: p.coords.latitude, lng: p.coords.longitude })
    );
  }, []);

  const { data: allVehicles } = useQuery({ queryKey: ['my-vehicles'], queryFn: vehicleService.listMy });
  const vehicles = allVehicles?.filter((v: Vehicle) => v.approval_status === 'APPROVED');

  const { data: nearby, isLoading } = useQuery({
    queryKey: ['nearby-jobs', userLoc?.lat, userLoc?.lng, radius],
    queryFn: () => bookingService.getNearby({ lat: userLoc!.lat, lng: userLoc!.lng, radius }),
    enabled: !!userLoc,
    refetchInterval: 15_000,
  });

  const acceptMut = useMutation({
    mutationFn: ({ bookingId, vehicleId }: { bookingId: number; vehicleId: number }) =>
      bookingService.accept(bookingId, vehicleId),
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: ['nearby-jobs'] });
      router.push(`/active/${b.id}`);
    },
    onError: (err) => setAcceptError(getApiError(err)),
  });

  const [acceptError, setAcceptError] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState<number | null>(null);

  useEffect(() => {
    if (vehicles?.length) setSelectedVehicle(vehicles[0]?.id ?? null);
  }, [vehicles]);

  return (
    <div className="space-y-6 animate-blur-fade-up">
      {/* Header */}
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-headline-lg font-bold text-white">Job Board</h2>
          <p className="text-on-surface-variant">{nearby?.count ?? 0} available nearby</p>
        </div>
      </header>

      {/* Radius & Vehicle */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-panel rounded-xl p-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-on-surface-variant">Search radius</span>
            <span className="font-medium text-tertiary">{radius} km</span>
          </div>
          <input type="range" min={5} max={200} value={radius} onChange={(e) => setRadius(Number(e.target.value))}
            className="w-full accent-tertiary" />
        </div>
        {vehicles && vehicles.length > 0 && (
          <div className="glass-panel rounded-xl p-4">
            <label className="text-sm font-medium text-on-surface-variant mb-2 block">Active Vehicle</label>
            <select value={selectedVehicle ?? ''} onChange={(e) => setSelectedVehicle(Number(e.target.value))}
              className="w-full glass-input rounded-lg px-3 py-2 text-sm text-on-surface">
              {vehicles.map((v: Vehicle) => (
                <option key={v.id} value={v.id}>{v.type} — {v.registration_no}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {!userLoc && (
        <div className="glass-card rounded-xl p-4 text-amber-400 text-sm border border-amber-500/20">
          <span className="material-symbols-outlined text-[16px] mr-2 align-middle">location_off</span>
          Enable location to see nearby jobs
        </div>
      )}

      {acceptError && (
        <div className="bg-error/10 border border-error/20 rounded-lg px-4 py-3 text-error text-sm">
          {acceptError}
          <button onClick={() => setAcceptError('')} className="ml-2 text-error/70 underline text-xs">Dismiss</button>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-surface-container rounded-xl animate-pulse" />)}
        </div>
      )}

      {nearby?.data?.length === 0 && (
        <div className="text-center py-12 text-outline">No jobs nearby. Try increasing radius.</div>
      )}

      <div className="space-y-3 stagger-children">
        {nearby?.data?.map((b: Booking) => (
          <motion.div key={b.id} whileHover={{ scale: 1.01 }}
            className="glass-card rounded-xl p-4 space-y-3 hover:border-primary/30 transition-all">
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0 mr-3 space-y-1">
                <div className="flex gap-3">
                  <div className="flex flex-col items-center mt-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-tertiary shadow-[0_0_8px_rgba(76,215,246,0.8)]" />
                    <div className="w-0.5 h-6 bg-outline-variant/30 my-0.5" />
                    <div className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_8px_rgba(173,198,255,0.8)]" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="text-sm font-medium text-on-surface truncate">{b.pickup_address}</div>
                    <div className="text-sm text-on-surface-variant truncate">{b.drop_address}</div>
                  </div>
                </div>
                <div className="flex gap-3 text-xs text-outline mt-2 pl-6">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">straighten</span>{b.distance_km?.toFixed(1)} km
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">scale</span>{b.goods_weight_kg} kg
                  </span>
                  {b.goods_fragile && <span>🫙 Fragile</span>}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold text-white">
                  ₹{((b.final_price ?? b.estimated_price ?? 0) / 100).toLocaleString('en-IN')}
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-label-caps ${
                  b.status === 'BIDDING' ? 'bg-secondary/10 text-secondary border border-secondary/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}>
                  {b.status}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              {b.status === 'PENDING' && selectedVehicle && (
                <button
                  onClick={() => acceptMut.mutate({ bookingId: b.id, vehicleId: selectedVehicle })}
                  disabled={acceptMut.isPending}
                  className="flex-1 btn-3d disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg transition"
                >
                  Accept Job
                </button>
              )}
              {b.status === 'BIDDING' && (
                <button
                  onClick={() => router.push(`/jobs/${b.id}`)}
                  className="flex-1 bg-gradient-to-b from-secondary to-secondary-container text-white text-sm font-semibold py-2.5 rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_3px_0_#2d2a5b] hover:translate-y-[1px] active:translate-y-[2px] active:shadow-none transition-all"
                >
                  Place Bid
                </button>
              )}
              <button
                onClick={() => router.push(`/jobs/${b.id}`)}
                className="border border-outline-variant/30 text-on-surface text-sm font-medium px-4 py-2.5 rounded-lg hover:border-primary/50 hover:bg-white/5 transition"
              >
                Details
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
