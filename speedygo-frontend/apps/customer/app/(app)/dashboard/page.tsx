'use client';

import { useQuery } from '@tanstack/react-query';
import { profileService } from '@speedygo/api-client';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { data: dashboard, isError, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: profileService.getDashboard,
  });

  const stats = dashboard?.stats;
  const spending = dashboard?.spending;

  return (
    <div className="space-y-8 animate-blur-fade-up">
      {isError && (
        <div className="glass-panel rounded-xl p-4 text-error text-sm flex justify-between items-center border-l-2 border-l-error">
          <span>Failed to load dashboard data.</span>
          <button onClick={() => refetch()} className="text-tertiary font-medium underline text-xs">Retry</button>
        </div>
      )}

      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-headline-lg font-bold text-white">Overview</h2>
          <p className="text-on-surface-variant">
            {user?.status === 'PENDING_KYC' ? (
              <span className="text-tertiary font-medium flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">warning</span>
                Complete KYC to start booking —{' '}
                <Link href="/kyc" className="underline hover:text-white transition-colors">Verify now</Link>
              </span>
            ) : (
              'Real-time logistics intelligence'
            )}
          </p>
        </div>
        <div className="flex gap-4 w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline">search</span>
            <input
              className="w-full glass-input rounded-full py-2 pl-10 pr-4 text-sm text-white placeholder-outline transition-all"
              placeholder="Track shipment ID..."
              type="text"
            />
          </div>
          <button className="w-10 h-10 rounded-full glass-panel flex items-center justify-center text-tertiary hover:text-white transition-colors flex-shrink-0 relative">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>notifications</span>
            <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full shadow-[0_0_8px_rgba(255,180,171,0.8)]" />
          </button>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 stagger-children">
        {/* Active Bookings Card */}
        <section className="md:col-span-8 glass-panel rounded-2xl p-6 flex flex-col min-h-[400px]">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-headline-md text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-tertiary">rocket_launch</span>
              Active Bookings
            </h3>
            <span className="bg-primary/20 text-primary px-3 py-1 rounded-full text-label-caps border border-primary/30">
              {stats?.active_bookings ?? 0} IN TRANSIT
            </span>
          </div>

          {dashboard?.recent_bookings?.length > 0 ? (
            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
              {dashboard.recent_bookings.slice(0, 3).map((b: any) => (
                <Link
                  key={b.id}
                  href={`/bookings/${b.id}`}
                  className="bg-surface-container-low/50 border border-white/5 rounded-xl p-4 relative overflow-hidden group block hover:border-primary/30 transition-all"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 pointer-events-none" />
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-label-caps text-outline-variant mb-1">ID: #{b.id?.slice(0, 8)}</p>
                      <h4 className="text-body-lg text-white font-semibold truncate max-w-[300px]">
                        {b.pickup_address} → {b.drop_address}
                      </h4>
                    </div>
                    <StatusBadge status={b.status} />
                  </div>
                  {(b.status === 'IN_TRANSIT' || b.status === 'PICKING_UP') && (
                    <div className="flex-1 flex flex-col justify-center">
                      <div className="relative h-1 bg-surface-container-highest rounded-full w-full">
                        <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary to-tertiary rounded-full w-[65%] shadow-[0_0_10px_rgba(76,215,246,0.4)]" />
                        <div className="absolute top-1/2 left-[65%] -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-tertiary rounded-full shadow-[0_0_12px_rgba(76,215,246,0.8)] z-10" />
                      </div>
                    </div>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <span className="material-symbols-outlined text-6xl text-outline-variant/40 mb-4">local_shipping</span>
              <p className="text-on-surface-variant mb-4">No active bookings</p>
              <Link href="/bookings/new" className="btn-3d text-white px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">add</span>
                Create Shipment
              </Link>
            </div>
          )}
        </section>

        {/* Right Column */}
        <div className="md:col-span-4 space-y-6">
          {/* Quick Book */}
          <section className="glass-panel rounded-2xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
            <h3 className="text-headline-md text-white mb-4">Quick Deploy</h3>
            <Link
              href="/bookings/new"
              className="w-full mt-4 py-3 rounded-xl btn-3d text-white font-bold text-sm tracking-wide flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              New Shipment
            </Link>
          </section>

          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-2 gap-3 stagger-children">
              {[{
                label: 'Total', value: stats.total_bookings, icon: 'package_2', color: 'text-primary' },
                { label: 'Completed', value: stats.completed_bookings, icon: 'check_circle', color: 'text-tertiary' },
                { label: 'Active', value: stats.active_bookings, icon: 'schedule', color: 'text-primary-container' },
                { label: 'Cancelled', value: stats.cancelled_bookings, icon: 'cancel', color: 'text-outline' },
              ].map((s) => (
                <div key={s.label} className="glass-panel rounded-xl p-4 relative overflow-hidden group hover:border-primary-container/30 transition-colors">
                  <span className={`material-symbols-outlined ${s.color} mb-2`}>{s.icon}</span>
                  <div className="text-2xl font-bold text-white">{s.value ?? 0}</div>
                  <div className="text-label-caps text-on-surface-variant">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Spending */}
          {spending && (
            <section className="glass-panel rounded-2xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-body-lg text-white font-semibold">Cost Efficiency</h3>
                <span className="material-symbols-outlined text-outline hover:text-white cursor-pointer">more_horiz</span>
              </div>
              <div className="flex items-end gap-4 mb-4">
                <div>
                  <p className="text-3xl font-bold text-white tracking-tight">
                    ₹{(spending.this_month_paise / 100).toLocaleString('en-IN')}
                  </p>
                  <p className="text-label-caps text-tertiary flex items-center gap-1 mt-1">
                    <span className="material-symbols-outlined text-[14px]">arrow_downward</span>
                    THIS MONTH
                  </p>
                </div>
              </div>
              <div className="text-sm text-on-surface-variant">
                Total spent: <span className="text-white font-semibold">{spending.total_spent_formatted}</span>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    BIDDING: 'bg-secondary/10 text-secondary border-secondary/20',
    ACCEPTED: 'bg-primary/10 text-primary border-primary/20',
    PICKING_UP: 'bg-tertiary/10 text-tertiary border-tertiary/20',
    IN_TRANSIT: 'bg-primary-container/10 text-primary-container border-primary-container/20 shadow-[0_0_10px_rgba(77,142,255,0.2)]',
    COMPLETED: 'bg-tertiary/10 text-tertiary border-tertiary/20 shadow-[0_0_10px_rgba(76,215,246,0.2)]',
    CANCELLED: 'bg-outline/10 text-outline border-outline/20',
    DISPUTED: 'bg-error/10 text-error border-error/20',
  };
  return (
    <span className={`text-label-caps px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${styles[status] ?? 'bg-outline/10 text-outline border-outline/20'}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {status.replace(/_/g, ' ')}
    </span>
  );
}

