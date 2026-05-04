'use client';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { bookingService } from '@speedygo/api-client';
import { useState } from 'react';

export default function PaymentPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [method, setMethod] = useState<'cash' | 'online' | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const { data: booking } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => bookingService.getById(id),
    enabled: !Number.isNaN(id),
  });

  if (!booking) return <div className="space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-surface-container rounded-xl animate-pulse" />)}</div>;

  const amount = ((booking.final_price ?? booking.estimated_price ?? 0) / 100).toLocaleString('en-IN');

  return (
    <div className="space-y-6 animate-blur-fade-up max-w-md mx-auto">
      <button onClick={() => router.back()} className="text-outline hover:text-on-surface transition flex items-center gap-2">
        <span className="material-symbols-outlined">arrow_back</span> Back
      </button>

      <div className="glass-panel rounded-2xl p-6 text-center">
        <span className="material-symbols-outlined text-tertiary text-[48px] mb-3 block">payments</span>
        <h2 className="text-headline-md text-on-surface">Collect Payment</h2>
        <p className="text-3xl font-black text-white mt-3">₹{amount}</p>
        <p className="text-xs text-on-surface-variant mt-1">Trip #{id} · {booking.distance_km?.toFixed(1)} km</p>
      </div>

      {!confirmed ? (
        <>
          <div className="space-y-3">
            <p className="text-sm text-on-surface-variant font-medium">Payment Method</p>
            <button onClick={() => setMethod('cash')}
              className={`w-full glass-card rounded-xl p-4 flex items-center gap-4 transition-all ${method === 'cash' ? 'border-tertiary/50 bg-tertiary/5' : 'hover:border-primary/30'}`}>
              <span className="material-symbols-outlined text-tertiary text-[28px]">payments</span>
              <div className="text-left">
                <div className="font-semibold text-on-surface">Cash</div>
                <div className="text-xs text-on-surface-variant">Collect cash from customer</div>
              </div>
              {method === 'cash' && <span className="material-symbols-outlined text-tertiary ml-auto" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>}
            </button>
            <button onClick={() => setMethod('online')}
              className={`w-full glass-card rounded-xl p-4 flex items-center gap-4 transition-all ${method === 'online' ? 'border-tertiary/50 bg-tertiary/5' : 'hover:border-primary/30'}`}>
              <span className="material-symbols-outlined text-primary text-[28px]">credit_card</span>
              <div className="text-left">
                <div className="font-semibold text-on-surface">Online Payment</div>
                <div className="text-xs text-on-surface-variant">Customer pays via UPI/Card</div>
              </div>
              {method === 'online' && <span className="material-symbols-outlined text-tertiary ml-auto" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>}
            </button>
          </div>

          <button onClick={() => setConfirmed(true)} disabled={!method}
            className="w-full btn-3d disabled:opacity-50 text-white font-bold py-4 rounded-xl text-base">
            Confirm ₹{amount} Received
          </button>
        </>
      ) : (
        <div className="glass-panel rounded-2xl p-6 text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-tertiary/20 rounded-full flex items-center justify-center">
            <span className="material-symbols-outlined text-tertiary text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          </div>
          <h3 className="text-lg font-bold text-on-surface">Payment Confirmed!</h3>
          <p className="text-sm text-on-surface-variant">₹{amount} collected via {method}</p>
          <button onClick={() => router.push(`/active/${id}`)}
            className="btn-3d text-white px-8 py-3 rounded-xl text-sm font-bold">
            Back to Trip
          </button>
        </div>
      )}
    </div>
  );
}

