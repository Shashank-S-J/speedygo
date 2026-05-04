'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bookingService, bidService, sosService, getApiError } from '@speedygo/api-client';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { Booking, BookingStatus, Bid } from '@speedygo/types';

const STATUS_COLORS: Record<BookingStatus, string> = {
  PENDING: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  BIDDING: 'bg-secondary/10 text-secondary border border-secondary/20',
  ACCEPTED: 'bg-primary/10 text-primary border border-primary/20',
  PICKING_UP: 'bg-tertiary/10 text-tertiary border border-tertiary/20',
  IN_TRANSIT: 'bg-primary-container/10 text-primary-container border border-primary-container/20',
  COMPLETED: 'bg-tertiary/10 text-tertiary border border-tertiary/20',
  CANCELLED: 'bg-outline/10 text-outline border border-outline/20',
  DISPUTED: 'bg-error/10 text-error border border-error/20',
};

export default function BookingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const id = Number(params.id);
  const [mutError, setMutError] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showSOSConfirm, setShowSOSConfirm] = useState(false);

  const { data: booking, isLoading } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => bookingService.getById(id),
    enabled: !Number.isNaN(id),
    refetchInterval: (q) => {
      const status = (q.state.data as Booking | undefined)?.status;
      return status && ['ACCEPTED', 'PICKING_UP', 'IN_TRANSIT'].includes(status) ? 5000 : false;
    },
  });

  const { data: bids } = useQuery({
    queryKey: ['bids', id],
    queryFn: () => bidService.list(id),
    enabled: booking?.status === 'BIDDING',
    refetchInterval: 10000,
  });

  const cancelMut = useMutation({
    mutationFn: (reason: string) => bookingService.updateStatus(id, { status: 'CANCELLED', cancel_reason: reason }),
    onSuccess: (data) => { qc.setQueryData(['booking', id], data); setShowCancelModal(false); setCancelReason(''); },
    onError: (err) => setMutError(getApiError(err)),
  });

  const disputeMut = useMutation({
    mutationFn: () => bookingService.updateStatus(id, { status: 'DISPUTED' }),
    onSuccess: (data) => qc.setQueryData(['booking', id], data),
    onError: (err) => setMutError(getApiError(err)),
  });

  const acceptBidMut = useMutation({
    mutationFn: (bidId: number) => bidService.accept(bidId),
    onSuccess: (data) => { qc.setQueryData(['booking', id], data); qc.invalidateQueries({ queryKey: ['bids', id] }); },
    onError: (err) => setMutError(getApiError(err)),
  });

  const [rating, setRating] = useState(0);
  const rateMut = useMutation({
    mutationFn: (r: number) => bookingService.rate(id, r),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['booking', id] }),
    onError: (err) => setMutError(getApiError(err)),
  });

  const sosMut = useMutation({
    mutationFn: () => {
      return new Promise<ReturnType<typeof sosService.trigger>>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(sosService.trigger({ booking_id: id, lat: pos.coords.latitude, lng: pos.coords.longitude })),
          () => resolve(sosService.trigger({ booking_id: id, lat: 0, lng: 0 })),
          { enableHighAccuracy: true, timeout: 5000 }
        );
      });
    },
    onSuccess: () => setShowSOSConfirm(false),
    onError: (err) => setMutError(getApiError(err)),
  });

  // Navigate to Google Maps with destination
  const openGoogleMaps = () => {
    if (!booking) return;
    const dest = `${booking.drop_lat},${booking.drop_lng}`;
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = `google.navigation:q=${dest}`;
      setTimeout(() => { window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}`, '_blank'); }, 500);
    } else {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}`, '_blank');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-surface-container rounded-xl animate-pulse" />)}
      </div>
    );
  }

  if (Number.isNaN(id)) return <div className="text-center py-16 text-outline">Invalid booking ID</div>;
  if (!booking) return <div className="text-center py-16 text-outline">Booking not found</div>;

  const canCancel = ['PENDING', 'BIDDING', 'ACCEPTED', 'PICKING_UP'].includes(booking.status);
  const canDispute = ['IN_TRANSIT', 'COMPLETED'].includes(booking.status);
  const canRate = booking.status === 'COMPLETED' && !booking.transporter_rating;
  const canPay = ['ACCEPTED', 'PICKING_UP'].includes(booking.status) && booking.payment_status === 'UNPAID';
  const canChat = ['ACCEPTED', 'PICKING_UP', 'IN_TRANSIT'].includes(booking.status);
  const canTrack = ['PICKING_UP', 'IN_TRANSIT'].includes(booking.status);
  const canReport = ['COMPLETED', 'DISPUTED', 'IN_TRANSIT'].includes(booking.status) && booking.transporter_id;
  const canSOS = ['PICKING_UP', 'IN_TRANSIT'].includes(booking.status);
  const canNavigate = ['IN_TRANSIT'].includes(booking.status);
  const hasTransporter = booking.transporter_id && ['ACCEPTED', 'PICKING_UP', 'IN_TRANSIT', 'COMPLETED'].includes(booking.status);

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-outline hover:text-on-surface transition">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-lg font-bold text-on-surface">Booking #{booking.id}</h2>
        <span className={`ml-auto text-xs px-2.5 py-1 rounded-full font-label-caps ${STATUS_COLORS[booking.status]}`}>
          {booking.status}
        </span>
      </div>

      {/* OTP Display */}
      {booking.pickup_otp && ['ACCEPTED', 'PICKING_UP'].includes(booking.status) && (
        <div className="glass-card rounded-xl p-4 border border-tertiary/30">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-tertiary">pin</span>
            <div>
              <div className="text-xs text-on-surface-variant font-label-caps">VERIFICATION OTP</div>
              <div className="text-2xl font-black text-tertiary tracking-[0.3em]">{booking.pickup_otp}</div>
            </div>
          </div>
          <p className="text-xs text-on-surface-variant mt-2">Share this OTP with the transporter for pickup verification</p>
        </div>
      )}

      {/* Transporter Info */}
      {hasTransporter && booking.transporter && (
        <div className="glass-card rounded-xl p-4">
          <h3 className="text-sm font-semibold text-on-surface mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-primary">local_shipping</span>
            Transporter
          </h3>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-tertiary flex items-center justify-center text-white text-lg font-bold">
              {booking.transporter.full_name?.[0]?.toUpperCase() ?? 'T'}
            </div>
            <div className="flex-1">
              <div className="text-on-surface font-medium">{booking.transporter.full_name}</div>
              <div className="text-sm text-on-surface-variant">{booking.transporter.phone}</div>
              {booking.transporter.avg_rating && (
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="material-symbols-outlined text-amber-400 text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  <span className="text-xs text-amber-400">{booking.transporter.avg_rating.toFixed(1)}</span>
                </div>
              )}
            </div>
            <a href={`tel:${booking.transporter.phone}`}
              className="w-10 h-10 rounded-full bg-tertiary/10 border border-tertiary/30 flex items-center justify-center hover:bg-tertiary/20 transition">
              <span className="material-symbols-outlined text-tertiary text-[18px]">call</span>
            </a>
          </div>
          {booking.vehicle && (
            <div className="mt-3 bg-surface-container-lowest/50 rounded-lg px-3 py-2 flex items-center gap-2 text-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[16px]">directions_car</span>
              {booking.vehicle.registration_no} • {booking.vehicle.type}
            </div>
          )}
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
            </div>
            <div>
              <div className="text-xs text-on-surface-variant font-label-caps">DROP</div>
              <div className="text-sm font-medium text-on-surface">{booking.drop_address}</div>
            </div>
          </div>
        </div>
        {booking.distance_km && (
          <div className="text-xs text-on-surface-variant">{booking.distance_km.toFixed(1)} km</div>
        )}
      </div>

      {/* Goods */}
      <div className="glass-card rounded-xl p-4">
        <h3 className="text-sm font-semibold text-on-surface mb-2">Goods</h3>
        <div className="text-sm text-on-surface-variant space-y-1">
          {booking.goods_description && <div>{booking.goods_description}</div>}
          <div>{booking.goods_weight_kg} kg{booking.goods_fragile ? ' · 🫙 Fragile' : ''}</div>
        </div>
      </div>

      {/* Price */}
      <div className="glass-card rounded-xl p-4 flex justify-between items-center">
        <div>
          <div className="text-xs text-on-surface-variant font-label-caps">PRICE</div>
          <div className="text-xl font-bold text-on-surface">
            ₹{((booking.final_price ?? booking.estimated_price ?? 0) / 100).toLocaleString('en-IN')}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-on-surface-variant font-label-caps">PAYMENT</div>
          <div className={`text-sm font-medium ${
            booking.payment_status === 'ESCROWED' || booking.payment_status === 'RELEASED'
              ? 'text-tertiary' : booking.payment_status === 'UNPAID' ? 'text-outline' : 'text-primary'
          }`}>{booking.payment_status}</div>
        </div>
      </div>

      {/* Bids */}
      {booking.status === 'BIDDING' && bids && bids.length > 0 && (
        <div className="glass-card rounded-xl p-4">
          <h3 className="text-sm font-semibold text-on-surface mb-3">Bids ({bids.length})</h3>
          <div className="space-y-2">
            {(bids as Bid[]).sort((a, b) => a.amount_paise - b.amount_paise).map((bid) => (
              <div key={bid.id} className="flex items-center justify-between p-3 bg-surface-container-low rounded-lg border border-white/5">
                <div>
                  <div className="text-sm font-medium text-on-surface">
                    ₹{(bid.amount_paise / 100).toLocaleString('en-IN')}
                  </div>
                  {bid.note && <div className="text-xs text-on-surface-variant">{bid.note}</div>}
                  {bid.estimated_time_min && (
                    <div className="text-xs text-outline">~{bid.estimated_time_min} min</div>
                  )}
                </div>
                <button
                  onClick={() => acceptBidMut.mutate(bid.id)}
                  disabled={acceptBidMut.isPending}
                  className="btn-3d text-white text-xs font-medium px-3 py-1.5 rounded-lg transition"
                >
                  Accept
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rating */}
      {canRate && (
        <div className="glass-card rounded-xl border-tertiary/20 p-4">
          <h3 className="text-sm font-semibold text-on-surface mb-2">Rate the transporter</h3>
          <div className="flex gap-2 mb-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setRating(n)}>
                <span className={`material-symbols-outlined text-[28px] ${n <= rating ? 'text-tertiary' : 'text-outline-variant'}`}
                  style={{fontVariationSettings: n <= rating ? "'FILL' 1" : "'FILL' 0"}}>star</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => rateMut.mutate(rating)}
            disabled={rating === 0 || rateMut.isPending}
            className="btn-3d disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            Submit Rating
          </button>
        </div>
      )}

      {mutError && (
        <div className="bg-error/10 border border-error/20 rounded-lg px-4 py-3 text-error text-sm">
          {mutError}
          <button onClick={() => setMutError('')} className="ml-2 text-error/70 underline text-xs">Dismiss</button>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2">
        {canPay && (
          <Link
            href={`/payments/${booking.id}`}
            className="flex justify-center w-full bg-gradient-to-b from-tertiary to-tertiary-container text-on-tertiary font-semibold py-3 rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_4px_0_#003640] hover:translate-y-[1px] active:translate-y-[3px] active:shadow-none transition-all"
          >
            Pay Now — ₹{((booking.final_price ?? booking.estimated_price ?? 0) / 100).toLocaleString('en-IN')}
          </Link>
        )}
        {canTrack && (
          <Link
            href={`/bookings/${booking.id}/track`}
            className="flex items-center justify-center gap-2 w-full btn-3d text-white font-semibold py-3 rounded-xl"
          >
            <span className="material-symbols-outlined text-[18px]">my_location</span> Track Live
          </Link>
        )}
        {canNavigate && (
          <button
            onClick={openGoogleMaps}
            className="flex items-center justify-center gap-2 w-full bg-gradient-to-b from-emerald-500 to-emerald-700 text-white font-semibold py-3 rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_3px_0_#064e3b] hover:translate-y-[1px] active:translate-y-[2px] transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">navigation</span> Navigate in Google Maps
          </button>
        )}
        {canChat && (
          <Link
            href={`/bookings/${booking.id}/chat`}
            className="flex items-center justify-center gap-2 w-full bg-surface-container border border-outline-variant/30 hover:border-primary/50 text-on-surface font-semibold py-3 rounded-xl transition"
          >
            <span className="material-symbols-outlined text-[18px]">chat</span> Chat
          </Link>
        )}
        {canSOS && (
          <button
            onClick={() => setShowSOSConfirm(true)}
            className="flex items-center justify-center gap-2 w-full bg-red-600/10 border border-red-500/30 hover:bg-red-600/20 text-red-400 font-semibold py-3 rounded-xl transition"
          >
            <span className="material-symbols-outlined text-[18px]">emergency</span> SOS Emergency
          </button>
        )}
        {canDispute && (
          <button
            onClick={() => disputeMut.mutate()}
            className="flex items-center justify-center gap-2 w-full bg-surface-container border border-error/20 hover:border-error/50 text-error font-semibold py-3 rounded-xl transition"
          >
            <span className="material-symbols-outlined text-[18px]">warning</span> Dispute
          </button>
        )}
        {canReport && (
          <Link
            href={`/bookings/${booking.id}/report`}
            className="flex items-center justify-center gap-2 w-full bg-surface-container border border-error/20 hover:border-error/50 text-error font-semibold py-3 rounded-xl transition"
          >
            <span className="material-symbols-outlined text-[18px]">flag</span> Report Transporter
          </Link>
        )}
        {canCancel && (
          <button
            onClick={() => setShowCancelModal(true)}
            className="w-full text-sm text-outline hover:text-error py-2 transition"
          >
            Cancel Booking
          </button>
        )}
      </div>

      {/* Cancel modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-lg font-bold text-on-surface">Cancel Booking</h3>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason for cancellation…"
              rows={3}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-4 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-tertiary focus:border-tertiary shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] placeholder:text-outline"
            />
            <div className="flex gap-3">
              <button onClick={() => { setShowCancelModal(false); setCancelReason(''); }}
                className="flex-1 border border-outline-variant text-on-surface py-2.5 rounded-lg text-sm font-medium bg-surface-container hover:bg-surface-container-high transition">
                Keep Booking
              </button>
              <button
                onClick={() => cancelReason.trim() && cancelMut.mutate(cancelReason.trim())}
                disabled={!cancelReason.trim() || cancelMut.isPending}
                className="flex-1 bg-gradient-to-b from-red-500 to-red-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_2px_0_#7f1d1d] hover:translate-y-[1px] active:translate-y-[2px] active:shadow-none transition-all"
              >
                {cancelMut.isPending ? 'Cancelling…' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SOS Confirmation Modal */}
      {showSOSConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-red-400 text-2xl">emergency</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-on-surface">Emergency SOS</h3>
                <p className="text-xs text-on-surface-variant">This will alert your emergency contacts and support</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowSOSConfirm(false)}
                className="flex-1 border border-outline-variant text-on-surface py-2.5 rounded-lg text-sm font-medium bg-surface-container">
                Cancel
              </button>
              <button onClick={() => sosMut.mutate()} disabled={sosMut.isPending}
                className="flex-1 bg-gradient-to-b from-red-500 to-red-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-semibold">
                {sosMut.isPending ? 'Sending…' : 'Confirm SOS'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
