'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { bookingService, paymentService } from '@speedygo/api-client';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useAuthStore } from '@/store/authStore';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PK ?? '');

function PaymentForm({ bookingId, clientSecret }: { bookingId: number; clientSecret: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup poll on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handlePay = async () => {
    if (!stripe || !elements) return;
    setPaying(true);
    setError('');
    const result = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });
    if (result.error) {
      setError(result.error.message ?? 'Payment failed');
      setPaying(false);
      return;
    }
    // Poll booking status for up to 30s
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const b = await bookingService.getById(bookingId);
        if (b.payment_status === 'ESCROWED' || b.payment_status === 'CAPTURED') {
          clearInterval(pollRef.current!);
          router.push(`/bookings/${bookingId}?payment=success`);
        } else if (attempts >= 10) {
          clearInterval(pollRef.current!);
          router.push(`/bookings/${bookingId}?payment=pending`);
        }
      } catch {
        if (attempts >= 10) {
          clearInterval(pollRef.current!);
          router.push(`/bookings/${bookingId}?payment=pending`);
        }
      }
    }, 3000);
  };

  return (
    <div className="space-y-4">
      <PaymentElement />
      {error && (
        <div className="bg-error/10 border border-error/20 rounded-lg px-4 py-3 text-error text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">error</span>
          {error}
        </div>
      )}
      <button
        onClick={handlePay}
        disabled={paying || !stripe}
        className="w-full btn-3d disabled:opacity-50 text-white font-bold py-4 rounded-xl transition text-base flex items-center justify-center gap-2"
      >
        {paying ? (
          <>
            <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
            Processing…
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-[18px]">lock</span>
            Pay Now
          </>
        )}
      </button>
    </div>
  );
}

export default function PaymentPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const bookingId = Number(params.bookingId);

  const { data: booking } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => bookingService.getById(bookingId),
    enabled: !Number.isNaN(bookingId),
  });

  const initMut = useMutation({
    mutationFn: () => paymentService.initiate({
      booking_id: bookingId,
      amount_paise: booking?.final_price ?? booking?.estimated_price ?? 0,
      customer_id: user?.id ?? 0,
      transporter_id: booking?.transporter_id ?? 0,
    }),
  });

  const initiatedRef = useRef(false);

  useEffect(() => {
    if (booking?.payment_status === 'UNPAID' && !initiatedRef.current) {
      initiatedRef.current = true;
      initMut.mutate();
    }
  }, [booking?.id, booking?.payment_status]);

  return (
    <div className="space-y-6 max-w-lg mx-auto animate-blur-fade-up">
      {Number.isNaN(bookingId) && (
        <div className="text-center py-16 text-outline">Invalid booking ID</div>
      )}
      {!Number.isNaN(bookingId) && (
        <>
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="text-outline hover:text-on-surface transition">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h2 className="text-headline-md font-bold text-on-surface">Payment</h2>
          </div>

          {booking && (
            <div className="glass-panel rounded-2xl p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-tertiary/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
              <div className="relative">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-label-caps text-on-surface-variant uppercase tracking-widest">Booking #{bookingId}</p>
                    <p className="text-xs text-on-surface-variant mt-1 truncate max-w-[200px]">{booking.pickup_address}</p>
                    <p className="text-xs text-outline">→ {booking.drop_address}</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-tertiary/10 border border-tertiary/20 flex items-center justify-center">
                    <span className="material-symbols-outlined text-tertiary">payments</span>
                  </div>
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-extrabold text-on-surface tracking-tight">
                    ₹{((booking.final_price ?? booking.estimated_price ?? 0) / 100).toLocaleString('en-IN')}
                  </span>
                </div>
                {booking.distance_km && (
                  <p className="text-xs text-on-surface-variant mt-2">{booking.distance_km.toFixed(1)} km</p>
                )}
              </div>
            </div>
          )}

          <div className="glass-panel rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-primary">credit_card</span>
              <h3 className="text-body-lg text-on-surface font-semibold">Payment Method</h3>
            </div>

            {initMut.isPending && (
              <div className="flex justify-center py-8">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
              </div>
            )}

            {initMut.data?.client_secret && (
              <Elements stripe={stripePromise} options={{
                clientSecret: initMut.data.client_secret,
                appearance: {
                  theme: 'night',
                  variables: {
                    colorPrimary: '#4d8eff',
                    colorBackground: '#1d2022',
                    colorText: '#e0e3e5',
                    colorDanger: '#ffb4ab',
                    borderRadius: '8px',
                  },
                },
              }}>
                <PaymentForm bookingId={bookingId} clientSecret={initMut.data.client_secret} />
              </Elements>
            )}

            {initMut.isError && (
              <div className="bg-error/10 border border-error/20 rounded-lg px-4 py-3 text-error text-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">error</span>
                Could not initialize payment. Please try again.
              </div>
            )}
          </div>

          {/* Security Note */}
          <div className="flex items-center gap-3 px-4 py-3 text-xs text-outline">
            <span className="material-symbols-outlined text-[16px] text-tertiary">verified_user</span>
            <span>All payments are secured with Stripe encryption. Funds held in escrow until delivery confirmation.</span>
          </div>
        </>
      )}
    </div>
  );
}
