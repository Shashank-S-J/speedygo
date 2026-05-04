'use client';

import { useQuery } from '@tanstack/react-query';
import { bookingService } from '@speedygo/api-client';
import Link from 'next/link';
import { Booking } from '@speedygo/types';

export default function WalletPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['bookings-wallet', 0],
    queryFn: () => bookingService.list({ limit: 50, offset: 0 }),
  });

  const bookings = data?.data ?? [];
  const paid = bookings.filter((b: Booking) => b.payment_status === 'ESCROWED' || b.payment_status === 'RELEASED' || b.payment_status === 'CAPTURED');
  const pending = bookings.filter((b: Booking) => b.payment_status === 'UNPAID' && ['ACCEPTED', 'PICKING_UP'].includes(b.status));
  const totalSpent = paid.reduce((sum: number, b: Booking) => sum + (b.final_price ?? b.estimated_price ?? 0), 0);

  return (
    <div className="space-y-8 animate-blur-fade-up">
      <header>
        <h1 className="text-headline-lg font-bold text-white tracking-tight">Wallet & Payments</h1>
        <p className="text-on-surface-variant">Track your spending and pending payments.</p>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-panel rounded-2xl p-6">
          <div className="text-label-caps text-on-surface-variant mb-1">Total Spent</div>
          <div className="text-2xl font-bold text-on-surface">₹{(totalSpent / 100).toLocaleString('en-IN')}</div>
        </div>
        <div className="glass-panel rounded-2xl p-6">
          <div className="text-label-caps text-on-surface-variant mb-1">Completed Payments</div>
          <div className="text-2xl font-bold text-tertiary">{paid.length}</div>
        </div>
        <div className="glass-panel rounded-2xl p-6">
          <div className="text-label-caps text-on-surface-variant mb-1">Pending Payments</div>
          <div className="text-2xl font-bold text-amber-400">{pending.length}</div>
        </div>
      </div>

      {/* Pending Payments */}
      {pending.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-on-surface mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-400 text-[20px]">pending</span>
            Pending Payments
          </h2>
          <div className="space-y-3">
            {pending.map((b: Booking) => (
              <Link key={b.id} href={`/payments/${b.id}`}
                className="glass-card rounded-xl p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors block">
                <div>
                  <div className="text-sm font-medium text-on-surface truncate max-w-[200px]">{b.pickup_address}</div>
                  <div className="text-xs text-outline">→ {b.drop_address}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-on-surface">
                    ₹{((b.final_price ?? b.estimated_price ?? 0) / 100).toLocaleString('en-IN')}
                  </div>
                  <span className="text-xs text-amber-400 font-medium">Pay Now →</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Payment History */}
      <section>
        <h2 className="text-lg font-semibold text-on-surface mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-tertiary text-[20px]">receipt_long</span>
          Payment History
        </h2>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-16 glass-panel rounded-xl animate-pulse" />)}
          </div>
        ) : paid.length === 0 ? (
          <div className="text-center py-12 text-on-surface-variant">
            <span className="material-symbols-outlined text-4xl text-outline-variant/40 block mb-2">account_balance_wallet</span>
            <p>No payment history yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {paid.map((b: Booking) => (
              <Link key={b.id} href={`/bookings/${b.id}`}
                className="glass-card rounded-xl p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors block">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-tertiary/10 border border-tertiary/20 flex items-center justify-center">
                    <span className="material-symbols-outlined text-tertiary text-[18px]">check_circle</span>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-on-surface truncate max-w-[180px] sm:max-w-none">{b.drop_address}</div>
                    <div className="text-xs text-outline">{new Date(b.created_at).toLocaleDateString()}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-base font-bold text-on-surface">
                    -₹{((b.final_price ?? b.estimated_price ?? 0) / 100).toLocaleString('en-IN')}
                  </div>
                  <div className="text-[10px] text-tertiary font-medium uppercase">{b.payment_status}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

