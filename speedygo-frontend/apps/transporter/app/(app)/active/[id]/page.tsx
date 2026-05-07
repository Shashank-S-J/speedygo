'use client';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bookingService, getApiError } from '@speedygo/api-client';
import { useEffect, useRef, useState } from 'react';
import { GPSPublishClient } from '@speedygo/ws-client';
import { useGPSStore } from '@/store/gpsStore';
import { useAuthStore } from '@/store/authStore';
import { Booking } from '@speedygo/types';
import Link from 'next/link';
import { motion } from 'framer-motion';

const STATUS_ACTIONS: Record<string, { label: string; next: Booking['status']; icon: string }> = {
  ACCEPTED: { label: 'Start Pickup', next: 'PICKING_UP', icon: 'play_arrow' },
  PICKING_UP: { label: 'Verify OTP & Start Transit', next: 'IN_TRANSIT', icon: 'local_shipping' },
  IN_TRANSIT: { label: 'Mark Delivered', next: 'COMPLETED', icon: 'check_circle' },
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function ActiveTripPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const id = Number(params.id);
  const gpsClient = useRef<GPSPublishClient | null>(null);
  const { setPublishing, setWsConnected } = useGPSStore();
  const [mutError, setMutError] = useState('');
  const [mutSuccess, setMutSuccess] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showMismatchModal, setShowMismatchModal] = useState(false);
  const [mismatchNote, setMismatchNote] = useState('');
  const [pickupOtp, setPickupOtp] = useState('');
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number } | null>(null);
  const [liveDistKm, setLiveDistKm] = useState<number | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const { data: booking } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => bookingService.getById(id),
    enabled: !Number.isNaN(id),
    refetchInterval: 10_000,
  });

  // GPS publishing for live tracking
  useEffect(() => {
    if (!booking?.vehicle_id) return;
    if (!['ACCEPTED', 'PICKING_UP', 'IN_TRANSIT'].includes(booking.status)) return;
    const token = useAuthStore.getState().accessToken ?? '';
    const client = new GPSPublishClient(booking.vehicle_id, token);
    gpsClient.current = client;
    client.onStatus(setWsConnected);
    client.startPublishing(4000);
    setPublishing(true, booking.vehicle_id);
    return () => { client.stop(); setPublishing(false); };
  }, [booking?.vehicle_id, booking?.status]);

  // Live distance calculation
  useEffect(() => {
    if (!booking || !['PICKING_UP', 'IN_TRANSIT'].includes(booking.status)) return;
    const wid = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setCurrentPos({ lat, lng });
        const destLat = booking.status === 'PICKING_UP' ? booking.pickup_lat : booking.drop_lat;
        const destLng = booking.status === 'PICKING_UP' ? booking.pickup_lng : booking.drop_lng;
        setLiveDistKm(haversineKm(lat, lng, destLat, destLng));
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    watchIdRef.current = wid;
    return () => navigator.geolocation.clearWatch(wid);
  }, [booking?.status, booking?.pickup_lat, booking?.drop_lat]);

  const statusMut = useMutation({
    mutationFn: (data: { status: Booking['status']; cancel_reason?: string }) => bookingService.updateStatus(id, data),
    onSuccess: (data) => {
      qc.setQueryData(['booking', id], data);
      if (data.status === 'CANCELLED') { setShowCancelModal(false); setCancelReason(''); }
    },
    onError: (err) => setMutError(getApiError(err)),
  });

  const mismatchMut = useMutation({
    mutationFn: (note: string) => bookingService.flagMismatch(id, note),
    onSuccess: () => { setMutSuccess('Mismatch flagged. Admin notified.'); setShowMismatchModal(false); setMismatchNote(''); },
    onError: (err) => setMutError(getApiError(err)),
  });

  const otpMut = useMutation({
    mutationFn: (otp: string) => bookingService.verifyPickupOtp(id, otp),
    onSuccess: (data) => { qc.setQueryData(['booking', id], data); setShowOtpInput(false); setPickupOtp(''); setMutSuccess('OTP verified! Transit started.'); },
    onError: (err) => { setMutError(getApiError(err)); },
  });

  const completeMut = useMutation({
    mutationFn: () => bookingService.complete(id),
    onSuccess: (data) => { qc.setQueryData(['booking', id], data); setMutSuccess('Booking completed! Redirecting to payment…'); },
    onError: (err) => setMutError(getApiError(err)),
  });

  const [rating, setRating] = useState(0);
  const rateMut = useMutation({
    mutationFn: (r: number) => bookingService.rate(id, r),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['booking', id] }),
    onError: (err) => setMutError(getApiError(err)),
  });

  const openNavigation = (lat: number, lng: number) => {
    const dest = `${lat},${lng}`;
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = `google.navigation:q=${dest}`;
      setTimeout(() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}`, '_blank'), 500);
    } else {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}`, '_blank');
    }
  };

  if (Number.isNaN(id)) return <div className="text-center py-16 text-outline">Invalid trip ID</div>;
  if (!booking) return (
    <div className="space-y-4">
      {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-surface-container rounded-xl animate-pulse" />)}
    </div>
  );

  const action = STATUS_ACTIONS[booking.status];

  return (
    <div className="space-y-4 pb-6 animate-blur-fade-up">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-outline hover:text-on-surface transition">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-lg font-bold text-on-surface">Active Trip #{id}</h2>
        <span className="ml-auto text-xs px-2.5 py-1 rounded-full font-label-caps bg-primary/10 text-primary border border-primary/20">
          {booking.status.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Customer Details (visible after acceptance) */}
      {booking.customer && ['ACCEPTED', 'PICKING_UP', 'IN_TRANSIT', 'COMPLETED'].includes(booking.status) && (
        <div className="glass-card rounded-xl p-4 border-tertiary/20">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-tertiary/20 flex items-center justify-center text-tertiary font-bold">
              {booking.customer.full_name?.[0]?.toUpperCase() ?? 'C'}
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-on-surface">{booking.customer.full_name}</div>
              <div className="text-xs text-on-surface-variant flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">call</span>
                <a href={`tel:${booking.customer.phone}`} className="text-tertiary">{booking.customer.phone}</a>
              </div>
            </div>
            {booking.customer.avg_rating && (
              <div className="flex items-center gap-1 bg-yellow-500/10 px-2 py-1 rounded-full">
                <span className="material-symbols-outlined text-yellow-400 text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                <span className="text-xs font-bold text-yellow-400">{booking.customer.avg_rating.toFixed(1)}</span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-surface-container-lowest/50 rounded-lg px-3 py-2">
              <span className="text-on-surface-variant">Distance</span>
              <div className="font-bold text-on-surface">{booking.distance_km?.toFixed(1) ?? '–'} km</div>
            </div>
            <div className="bg-surface-container-lowest/50 rounded-lg px-3 py-2">
              <span className="text-on-surface-variant">Price</span>
              <div className="font-bold text-on-surface">₹{((booking.final_price ?? booking.estimated_price ?? 0) / 100).toLocaleString('en-IN')}</div>
            </div>
          </div>
        </div>
      )}

      {/* Route */}
      <div className="glass-card rounded-xl p-4 space-y-3">
        <div className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="w-3 h-3 rounded-full bg-tertiary shadow-[0_0_8px_rgba(76,215,246,0.8)] mt-0.5" />
            <div className="w-0.5 h-8 bg-outline-variant/30 my-1" />
            <div className="w-3 h-3 rounded-full bg-primary shadow-[0_0_8px_rgba(173,198,255,0.8)]" />
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <div className="text-xs text-on-surface-variant font-label-caps">PICKUP</div>
              <div className="text-sm font-medium text-on-surface">{booking.pickup_address}</div>
              {booking.pickup_contact && <div className="text-xs text-tertiary">{booking.pickup_contact}</div>}
            </div>
            <div>
              <div className="text-xs text-on-surface-variant font-label-caps">DROP</div>
              <div className="text-sm font-medium text-on-surface">{booking.drop_address}</div>
              {booking.drop_contact && <div className="text-xs text-tertiary">{booking.drop_contact}</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Live Distance & GPS */}
      <div className="glass-card rounded-xl p-3 flex items-center gap-3">
        <span className="material-symbols-outlined text-tertiary text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>my_location</span>
        <span className="text-sm text-on-surface-variant">GPS active</span>
        <div className="ml-auto flex items-center gap-3">
          {liveDistKm !== null && (
            <span className="text-sm font-bold text-tertiary">
              {liveDistKm < 1 ? `${(liveDistKm * 1000).toFixed(0)} m` : `${liveDistKm.toFixed(1)} km`}
              <span className="text-xs font-normal text-on-surface-variant ml-1">
                to {booking.status === 'PICKING_UP' ? 'pickup' : 'drop'}
              </span>
            </span>
          )}
          <div className="w-2 h-2 bg-tertiary rounded-full animate-glow-pulse" />
        </div>
      </div>

      {mutError && (
        <div className="bg-error/10 border border-error/20 rounded-lg px-4 py-3 text-error text-sm">
          {mutError}<button onClick={() => setMutError('')} className="ml-2 text-error/70 underline text-xs">Dismiss</button>
        </div>
      )}
      {mutSuccess && (
        <div className="bg-tertiary/10 border border-tertiary/20 rounded-lg px-4 py-3 text-tertiary text-sm">
          {mutSuccess}<button onClick={() => setMutSuccess('')} className="ml-2 text-tertiary/70 underline text-xs">Dismiss</button>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2">
        {/* Navigate to Pickup (when going to pick up goods) */}
        {booking.status === 'PICKING_UP' && (
          <button onClick={() => openNavigation(booking.pickup_lat, booking.pickup_lng)}
            className="flex items-center justify-center gap-2 w-full bg-gradient-to-b from-emerald-500 to-emerald-700 text-white font-semibold py-3 rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_3px_0_#064e3b] hover:translate-y-[1px] active:translate-y-[2px] transition-all">
            <span className="material-symbols-outlined text-[18px]">navigation</span> Navigate to Pickup
          </button>
        )}

        {/* Navigate to Destination (during transit) */}
        {booking.status === 'IN_TRANSIT' && (
          <button onClick={() => openNavigation(booking.drop_lat, booking.drop_lng)}
            className="flex items-center justify-center gap-2 w-full bg-gradient-to-b from-emerald-500 to-emerald-700 text-white font-semibold py-3 rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_3px_0_#064e3b] hover:translate-y-[1px] active:translate-y-[2px] transition-all">
            <span className="material-symbols-outlined text-[18px]">navigation</span> Navigate to Destination
          </button>
        )}

        <Link href={`/chat/${id}`}
          className="flex items-center justify-center gap-2 w-full glass-card text-on-surface font-semibold py-3 rounded-xl hover:border-primary/30 transition">
          <span className="material-symbols-outlined text-[18px]">chat</span> Chat with Customer
        </Link>

        <Link href={`/active/${id}/photos`}
          className="flex items-center justify-center gap-2 w-full glass-card text-on-surface font-semibold py-3 rounded-xl hover:border-primary/30 transition">
          <span className="material-symbols-outlined text-[18px]">photo_camera</span> Upload Photos
        </Link>

        {['ACCEPTED', 'PICKING_UP'].includes(booking.status) && (
          <button onClick={() => setShowMismatchModal(true)} disabled={mismatchMut.isPending}
            className="flex items-center justify-center gap-2 w-full glass-card border-amber-500/20 text-amber-400 font-semibold py-3 rounded-xl hover:border-amber-500/40 transition">
            <span className="material-symbols-outlined text-[18px]">flag</span> {mismatchMut.isPending ? 'Flagging…' : 'Flag Goods Mismatch'}
          </button>
        )}

        {['ACCEPTED', 'PICKING_UP', 'IN_TRANSIT', 'COMPLETED'].includes(booking.status) && (
          <Link href={`/active/${id}/report`}
            className="flex items-center justify-center gap-2 w-full glass-card border-error/20 text-error font-semibold py-3 rounded-xl hover:border-error/40 transition">
            <span className="material-symbols-outlined text-[18px]">warning</span> Report Customer
          </Link>
        )}

        {/* Payment redirect after completion */}
        {booking.status === 'COMPLETED' && booking.payment_status !== 'RELEASED' && (
          <Link href={`/active/${id}/payment`}
            className="flex items-center justify-center gap-2 w-full bg-gradient-to-b from-primary to-primary-container text-on-primary font-bold py-4 rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_4px_0_#002e6a] hover:translate-y-[1px] active:translate-y-[3px] transition-all">
            <span className="material-symbols-outlined text-[18px]">payments</span> Collect Payment
          </Link>
        )}

        {/* Rate customer */}
        {booking.status === 'COMPLETED' && !booking.customer_rating && (
          <div className="glass-card rounded-xl border-tertiary/20 p-4">
            <h3 className="text-sm font-semibold text-on-surface mb-2">Rate the customer</h3>
            <div className="flex gap-2 mb-3">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setRating(n)}>
                  <span className={`material-symbols-outlined text-[28px] ${n <= rating ? 'text-tertiary' : 'text-outline-variant'}`}
                    style={{ fontVariationSettings: n <= rating ? "'FILL' 1" : "'FILL' 0" }}>star</span>
                </button>
              ))}
            </div>
            <button onClick={() => rateMut.mutate(rating)} disabled={rating === 0 || rateMut.isPending}
              className="btn-3d disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
              Submit Rating
            </button>
          </div>
        )}

        {/* Status action: OTP for PICKING_UP */}
        {action && booking.status === 'PICKING_UP' && !showOtpInput && (
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowOtpInput(true)}
            className="w-full bg-gradient-to-b from-tertiary to-tertiary-container text-on-tertiary font-bold py-4 rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_4px_0_#003640] hover:translate-y-[1px] active:translate-y-[3px] active:shadow-none transition-all text-base flex items-center justify-center gap-2">
            <span className="material-symbols-outlined">pin</span> Enter Customer OTP
          </motion.button>
        )}

        {/* OTP Input */}
        {showOtpInput && booking.status === 'PICKING_UP' && (
          <div className="glass-card rounded-xl p-4 space-y-3 border border-tertiary/30">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-tertiary">pin</span>
              <h3 className="text-on-surface font-semibold">Verify Pickup OTP</h3>
            </div>
            <p className="text-xs text-on-surface-variant">Ask the customer for their 4-digit verification code</p>
            <input value={pickupOtp} onChange={(e) => setPickupOtp(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="Enter 4-digit OTP" maxLength={4}
              className="w-full glass-input rounded-lg px-4 py-3 text-center text-2xl tracking-[0.5em] font-bold text-on-surface placeholder:text-sm placeholder:tracking-normal" />
            <div className="flex gap-3">
              <button onClick={() => { setShowOtpInput(false); setPickupOtp(''); }}
                className="flex-1 border border-outline-variant text-on-surface py-2.5 rounded-lg text-sm font-medium bg-surface-container">Cancel</button>
              <button onClick={() => pickupOtp.length === 4 && otpMut.mutate(pickupOtp)}
                disabled={pickupOtp.length !== 4 || otpMut.isPending}
                className="flex-1 btn-3d disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-semibold">
                {otpMut.isPending ? 'Verifying…' : 'Verify & Start Transit'}
              </button>
            </div>
          </div>
        )}

        {/* Status action: ACCEPTED or IN_TRANSIT */}
        {action && booking.status !== 'PICKING_UP' && (
          <motion.button whileTap={{ scale: 0.97 }}
            onClick={() => {
              if (action.next === 'COMPLETED') { completeMut.mutate(); return; }
              statusMut.mutate({ status: action.next });
            }}
            disabled={statusMut.isPending || completeMut.isPending}
            className="w-full bg-gradient-to-b from-tertiary to-tertiary-container text-on-tertiary font-bold py-4 rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_4px_0_#003640] hover:translate-y-[1px] active:translate-y-[3px] active:shadow-none transition-all text-base flex items-center justify-center gap-2">
            <span className="material-symbols-outlined">{action.icon}</span>
            {statusMut.isPending || completeMut.isPending ? 'Updating…' : action.label}
          </motion.button>
        )}

        {['ACCEPTED', 'PICKING_UP'].includes(booking.status) && (
          <button onClick={() => setShowCancelModal(true)}
            className="w-full text-sm text-outline hover:text-error py-2 transition">Cancel Trip</button>
        )}
      </div>

      {/* Cancel modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-lg font-bold text-on-surface">Cancel Trip</h3>
            <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason for cancellation…" rows={3}
              className="w-full glass-input rounded-lg px-4 py-2.5 text-sm text-on-surface placeholder:text-outline" />
            <div className="flex gap-3">
              <button onClick={() => { setShowCancelModal(false); setCancelReason(''); }}
                className="flex-1 border border-outline-variant text-on-surface py-2.5 rounded-lg text-sm font-medium bg-surface-container">Back</button>
              <button onClick={() => cancelReason.trim() && statusMut.mutate({ status: 'CANCELLED', cancel_reason: cancelReason.trim() })}
                disabled={!cancelReason.trim() || statusMut.isPending}
                className="flex-1 bg-gradient-to-b from-red-500 to-red-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_2px_0_#7f1d1d]">
                {statusMut.isPending ? 'Cancelling…' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mismatch modal */}
      {showMismatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-lg font-bold text-on-surface">Flag Goods Mismatch</h3>
            <textarea value={mismatchNote} onChange={(e) => setMismatchNote(e.target.value)}
              placeholder="Describe the mismatch…" rows={3}
              className="w-full glass-input rounded-lg px-4 py-2.5 text-sm text-on-surface placeholder:text-outline" />
            <div className="flex gap-3">
              <button onClick={() => { setShowMismatchModal(false); setMismatchNote(''); }}
                className="flex-1 border border-outline-variant text-on-surface py-2.5 rounded-lg text-sm font-medium bg-surface-container">Cancel</button>
              <button onClick={() => mismatchNote.trim() && mismatchMut.mutate(mismatchNote.trim())}
                disabled={!mismatchNote.trim() || mismatchMut.isPending}
                className="flex-1 bg-gradient-to-b from-amber-500 to-amber-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-semibold">
                {mismatchMut.isPending ? 'Flagging…' : 'Submit Flag'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
