'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { sosService, bookingService, getApiError } from '@speedygo/api-client';
import { Booking } from '@speedygo/types';

export default function TransporterSOSPage() {
  const router = useRouter();
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null);
  const [loadingBooking, setLoadingBooking] = useState(true);
  const [pressing, setPressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [triggered, setTriggered] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  useEffect(() => {
    bookingService.list({ limit: 10, offset: 0 }).then((res) => {
      const active = res.data.find((b: Booking) =>
        ['ACCEPTED', 'PICKING_UP', 'IN_TRANSIT'].includes(b.status)
      );
      setActiveBooking(active ?? null);
    }).catch(() => {}).finally(() => setLoadingBooking(false));
  }, []);

  const handlePressStart = () => {
    setPressing(true); setProgress(0); startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const p = Math.min((elapsed / 2000) * 100, 100);
      setProgress(p);
      if (elapsed >= 2000) { clearInterval(timerRef.current!); setPressing(false); setConfirming(true); }
    }, 50);
  };

  const handlePressEnd = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setPressing(false); setProgress(0);
  };

  const confirmTrigger = async () => {
    if (!activeBooking) { setError('No active booking.'); return; }
    setConfirming(false);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        await sosService.trigger({ booking_id: activeBooking.id, lat: pos.coords.latitude, lng: pos.coords.longitude });
        setTriggered(true);
      } catch (err) { setError(getApiError(err)); }
    }, () => setError('Location access required for SOS'));
  };

  if (triggered) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4 animate-blur-fade-up">
      <div className="w-20 h-20 bg-red-900/30 border border-red-500/30 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(255,180,171,0.3)]">
        <span className="material-symbols-outlined text-[40px] text-red-400" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
      </div>
      <h2 className="text-2xl font-bold text-on-surface">SOS Triggered</h2>
      <p className="text-on-surface-variant text-sm">Emergency services and admins have been notified.</p>
      <button onClick={() => router.back()} className="text-primary font-medium">← Go Back</button>
    </div>
  );

  if (confirming) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4 px-4 animate-blur-fade-up">
      <div className="w-20 h-20 bg-red-900/30 border border-red-500/30 rounded-full flex items-center justify-center">
        <span className="material-symbols-outlined text-[40px] text-red-400" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
      </div>
      <h2 className="text-2xl font-bold text-red-400">Trigger SOS?</h2>
      <p className="text-on-surface-variant text-sm">This will alert all admins and your emergency contacts.</p>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <div className="flex gap-3 w-full max-w-xs">
        <button onClick={() => setConfirming(false)}
          className="flex-1 border border-outline-variant text-on-surface font-semibold py-3 rounded-xl bg-surface-container">Cancel</button>
        <button onClick={confirmTrigger}
          className="flex-1 bg-gradient-to-b from-red-400 to-red-700 text-white font-semibold py-3 rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_4px_0_#7f1d1d] hover:translate-y-[1px] active:translate-y-[3px] active:shadow-none transition-all">Confirm SOS</button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-8 px-4 animate-blur-fade-up">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_rgba(255,180,171,0.5)]" />
        <h1 className="text-headline-md text-on-surface">Emergency Hub</h1>
      </div>

      {loadingBooking ? (
        <div className="animate-spin w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full" />
      ) : !activeBooking ? (
        <div className="glass-card rounded-xl p-4 text-amber-400 text-sm max-w-xs border border-amber-500/20">
          ⚠️ No active booking. SOS requires an active trip.
        </div>
      ) : (
        <>
          <div className="text-sm text-on-surface-variant">Active trip: #{activeBooking.id} ({activeBooking.status})</div>
          <div className="relative">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-48 h-48 rounded-full border border-red-500/20 animate-ping" style={{ animationDuration: '3s' }} />
            </div>
            <button onPointerDown={handlePressStart} onPointerUp={handlePressEnd} onPointerLeave={handlePressEnd}
              aria-label="Hold for 2 seconds to trigger SOS"
              className="relative w-40 h-40 rounded-full bg-gradient-to-b from-red-400 to-red-700 text-white flex flex-col items-center justify-center shadow-[inset_0_2px_4px_rgba(255,255,255,0.4),inset_0_-8px_16px_rgba(105,0,5,0.8),0_10px_30px_rgba(147,0,10,0.5)] active:translate-y-2 active:shadow-[inset_0_2px_4px_rgba(255,255,255,0.4),inset_0_-2px_4px_rgba(105,0,5,0.8)] transition-all duration-150 select-none border border-white/20"
              style={{ background: pressing ? `conic-gradient(#dc2626 ${progress * 3.6}deg, #991b1b ${progress * 3.6}deg)` : undefined }}>
              <span className="material-symbols-outlined text-[48px]" style={{ fontVariationSettings: "'FILL' 1" }}>sos</span>
            </button>
          </div>
          <p className="text-on-surface-variant text-sm">Hold the button for 2 seconds</p>
        </>
      )}
      <p className="text-xs text-outline">Only use in genuine emergencies.</p>
    </div>
  );
}
