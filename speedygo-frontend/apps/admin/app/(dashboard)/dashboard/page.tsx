'use client';
import { useQuery } from '@tanstack/react-query';
import { adminService } from '@speedygo/api-client';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';
import { motion } from 'framer-motion';
import { useState } from 'react';

type Period = 'today' | '7d' | '30d' | '90d' | '1y' | 'all';

export default function AdminDashboardPage() {
  const [bookingPeriod, setBookingPeriod] = useState<Period>('30d');
  const [userPeriod, setUserPeriod] = useState<Period>('30d');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: adminService.getDashboard,
    refetchInterval: 30_000,
  });

  const { data: dailyBookings } = useQuery({
    queryKey: ['admin-daily-bookings', bookingPeriod],
    queryFn: () => adminService.getDailyBookings({ period: bookingPeriod }),
  });

  const { data: activeTransporters } = useQuery({
    queryKey: ['admin-active-transporters'],
    queryFn: adminService.getActiveTransporters,
    refetchInterval: 60_000,
  });

  const { data: userActivity } = useQuery({
    queryKey: ['admin-user-activity', userPeriod],
    queryFn: () => adminService.getUserActivity({ period: userPeriod }),
  });

  if (isLoading) return (
    <div className="space-y-4">
      {[...Array(8)].map((_, i) => <div key={i} className="h-20 bg-surface-container rounded-xl animate-pulse" />)}
    </div>
  );

  if (isError) return (
    <div className="glass-panel rounded-xl p-6 text-center border-l-2 border-l-error">
      <p className="text-error mb-2">Failed to load dashboard data.</p>
      <button onClick={() => refetch()} className="text-tertiary font-medium underline text-sm">Retry</button>
    </div>
  );

  const u = data?.users;
  const b = data?.bookings;
  const r = data?.revenue;
  const s = data?.safety;

  const periods: { label: string; value: Period }[] = [
    { label: 'Today', value: 'today' },
    { label: '7D', value: '7d' },
    { label: '30D', value: '30d' },
    { label: '90D', value: '90d' },
    { label: '1Y', value: '1y' },
    { label: 'All', value: 'all' },
  ];

  return (
    <div className="space-y-8 animate-blur-fade-up">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="px-2.5 py-1 rounded-full border border-tertiary/30 bg-tertiary/10 text-tertiary text-label-caps text-[10px]">LIVE</span>
            <span className="px-2.5 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-label-caps text-[10px]">GLOBAL SCOPE</span>
          </div>
          <h1 className="text-headline-lg font-bold text-white text-glow">Platform Metrics</h1>
          <p className="text-on-surface-variant">Real-time analytics and monitoring</p>
        </div>
        <div className="text-right">
          <p className="text-label-caps text-outline uppercase tracking-widest mb-1 text-[10px]">System Status</p>
          <div className="flex items-center gap-2 justify-end text-tertiary">
            <span className="w-2 h-2 rounded-full bg-tertiary shadow-[0_0_10px_rgba(76,215,246,0.8)] animate-pulse" />
            <span className="text-sm font-semibold">All Systems Nominal</span>
          </div>
        </div>
      </header>

      {/* Safety alerts */}
      {(s?.active_sos_alerts ?? 0) > 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-red-900/20 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
          <span className="material-symbols-outlined text-red-400 text-[24px] animate-pulse" style={{ fontVariationSettings: "'FILL' 1" }}>emergency</span>
          <div className="flex-1">
            <div className="font-semibold text-red-400">Active SOS Alerts</div>
            <div className="text-sm text-red-400/70">{s?.active_sos_alerts} emergency alerts require attention</div>
          </div>
          <Link href="/sos" className="bg-gradient-to-b from-red-500 to-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-[0_2px_0_#7f1d1d]">View</Link>
        </motion.div>
      )}

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        <motion.div whileHover={{ scale: 1.02 }} className="glass-card rounded-2xl p-6 lg:col-span-2 relative overflow-hidden">
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-primary/10 rounded-full blur-[40px]" />
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div>
              <p className="text-label-caps text-on-surface-variant text-[10px] mb-2">GROSS REVENUE (YTD)</p>
              <h2 className="text-headline-lg text-on-surface">{r?.total_revenue_formatted ?? '—'}</h2>
            </div>
            <div className="p-3 rounded-xl bg-surface-container border border-white/5 text-primary">
              <span className="material-symbols-outlined text-2xl">monitoring</span>
            </div>
          </div>
          {r?.monthly_revenue && r.monthly_revenue.length > 0 && (
            <div className="h-24 relative z-10 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={r.monthly_revenue.map((m: any) => ({ month: m.month.slice(5), revenue: m.amount_paise / 100 }))}>
                  <Bar dataKey="revenue" fill="#adc6ff" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </motion.div>

        <motion.div whileHover={{ scale: 1.02 }} className="glass-card rounded-2xl p-6 relative overflow-hidden">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-label-caps text-on-surface-variant text-[10px] mb-2">ACTIVE BOOKINGS</p>
              <h2 className="text-headline-md text-on-surface">{b?.active_bookings?.toLocaleString() ?? '—'}</h2>
            </div>
            <div className="p-3 rounded-xl bg-surface-container border border-white/5 text-tertiary">
              <span className="material-symbols-outlined text-2xl">local_shipping</span>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            <div>
              <div className="flex justify-between text-sm text-on-surface-variant mb-1">
                <span>Completed Today</span>
                <span className="text-tertiary">{b?.completed_today ?? 0}</span>
              </div>
              <div className="w-full bg-surface-container-highest rounded-full h-1.5 overflow-hidden">
                <div className="bg-tertiary h-1.5 rounded-full" style={{ width: `${Math.min(100, ((b?.completed_today ?? 0) / Math.max(1, b?.total_bookings ?? 1)) * 5000)}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm text-on-surface-variant mb-1">
                <span>Disputed</span>
                <span className="text-error">{b?.disputed_active ?? 0}</span>
              </div>
              <div className="w-full bg-surface-container-highest rounded-full h-1.5 overflow-hidden">
                <div className="bg-error h-1.5 rounded-full" style={{ width: `${Math.min(100, ((b?.disputed_active ?? 0) / Math.max(1, b?.active_bookings ?? 1)) * 100)}%` }} />
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div whileHover={{ scale: 1.02 }} className="glass-card rounded-2xl p-6 relative overflow-hidden border-error/20 bg-error-container/5">
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-error/10 rounded-full blur-[40px] animate-pulse" />
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div>
              <p className="text-label-caps text-error text-[10px] mb-2">SAFETY ALERTS</p>
              <h2 className="text-headline-md text-on-error-container">{s?.active_sos_alerts ?? 0} Active</h2>
            </div>
            <div className="p-3 rounded-xl bg-error-container/30 border border-error/20 text-error">
              <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
            </div>
          </div>
          <div className="space-y-2 relative z-10 mt-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-on-surface-variant">Pending Reports</span>
              <span className="text-error font-medium">{s?.pending_reports ?? 0}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-on-surface-variant">Flagged (24h)</span>
              <span className="text-amber-400 font-medium">{s?.flagged_messages_24h ?? 0}</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Daily Bookings Chart */}
      <section className="glass-panel rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h3 className="text-headline-md text-on-surface">Daily Bookings</h3>
            <p className="text-sm text-on-surface-variant">Track booking volume over time</p>
          </div>
          <div className="flex gap-1 bg-surface-container-lowest/50 rounded-lg p-1">
            {periods.map((p) => (
              <button key={p.value} onClick={() => setBookingPeriod(p.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${
                  bookingPeriod === p.value ? 'bg-primary/20 text-primary' : 'text-outline hover:text-on-surface'
                }`}>{p.label}</button>
            ))}
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyBookings?.data ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8c909f' }} tickFormatter={(v: string) => v?.slice(5) ?? v} />
              <YAxis tick={{ fontSize: 11, fill: '#8c909f' }} />
              <Tooltip contentStyle={{ background: '#1d2022', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e0e3e5' }} />
              <Bar dataKey="count" fill="#4cd7f6" radius={[4, 4, 0, 0]} name="Bookings" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Active Transporters + User Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Transporters */}
        <div className="glass-panel rounded-2xl p-6">
          <h3 className="text-headline-md text-on-surface mb-4">Active Transporters</h3>
          <div className="text-center py-6">
            <div className="text-display-xl text-tertiary text-glow">{activeTransporters?.active_count ?? '—'}</div>
            <p className="text-label-caps text-on-surface-variant mt-2">CURRENTLY ONLINE</p>
          </div>
          <div className="space-y-3 mt-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-surface-container border border-white/5">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-tertiary shadow-[0_0_8px_rgba(76,215,246,0.6)]" />
                <span className="text-on-surface text-sm">On Trip</span>
              </div>
              <span className="font-semibold text-on-surface">{activeTransporters?.on_trip ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-surface-container border border-white/5">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-primary shadow-[0_0_8px_rgba(173,198,255,0.6)]" />
                <span className="text-on-surface text-sm">Available</span>
              </div>
              <span className="font-semibold text-on-surface">{activeTransporters?.available ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-surface-container border border-white/5">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-outline" />
                <span className="text-on-surface text-sm">Total Registered</span>
              </div>
              <span className="font-semibold text-on-surface">{u?.total_transporters?.toLocaleString() ?? '—'}</span>
            </div>
          </div>
        </div>

        {/* User Activity */}
        <div className="glass-panel rounded-2xl p-6 lg:col-span-2">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h3 className="text-headline-md text-on-surface">User Activity</h3>
              <p className="text-sm text-on-surface-variant">Users using the platform</p>
            </div>
            <div className="flex gap-1 bg-surface-container-lowest/50 rounded-lg p-1">
              {periods.map((p) => (
                <button key={p.value} onClick={() => setUserPeriod(p.value)}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                    userPeriod === p.value ? 'bg-primary/20 text-primary' : 'text-outline hover:text-on-surface'
                  }`}>{p.label}</button>
              ))}
            </div>
          </div>

          {/* Real-time stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-surface-container rounded-xl p-4 border border-white/5">
              <p className="text-[10px] text-label-caps text-on-surface-variant mb-1">RIGHT NOW</p>
              <p className="text-2xl font-bold text-tertiary">{userActivity?.active_now ?? '—'}</p>
            </div>
            <div className="bg-surface-container rounded-xl p-4 border border-white/5">
              <p className="text-[10px] text-label-caps text-on-surface-variant mb-1">TODAY</p>
              <p className="text-2xl font-bold text-primary">{userActivity?.today ?? '—'}</p>
            </div>
            <div className="bg-surface-container rounded-xl p-4 border border-white/5">
              <p className="text-[10px] text-label-caps text-on-surface-variant mb-1">NEW TODAY</p>
              <p className="text-2xl font-bold text-secondary">{u?.new_users_today ?? '—'}</p>
            </div>
          </div>

          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={userActivity?.daily ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#8c909f' }} tickFormatter={(v: string) => v?.slice(5) ?? v} />
                <YAxis tick={{ fontSize: 10, fill: '#8c909f' }} />
                <Tooltip contentStyle={{ background: '#1d2022', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e0e3e5' }} />
                <Line type="monotone" dataKey="active_users" stroke="#4cd7f6" strokeWidth={2} dot={false} name="Active Users" />
                <Line type="monotone" dataKey="new_users" stroke="#adc6ff" strokeWidth={2} dot={false} name="New Users" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* User base stats */}
      <section>
        <h2 className="text-label-caps text-on-surface-variant mb-3">USER BASE</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
          { [
            { label: 'Total Users', value: u?.total_users, icon: 'group', color: 'text-primary' },
            { label: 'Active', value: u?.active_users, icon: 'check_circle', color: 'text-tertiary' },
            { label: 'Pending KYC', value: u?.pending_kyc, icon: 'verified_user', color: 'text-amber-400' },
            { label: 'Suspended', value: u?.suspended_users, icon: 'block', color: 'text-error' },
          ].map((stat) => (
            <motion.div key={stat.label} whileHover={{ scale: 1.02 }} className="glass-panel rounded-xl p-4">
              <span className={`material-symbols-outlined ${stat.color} mb-2`} style={{ fontVariationSettings: "'FILL' 1" }}>{stat.icon}</span>
              <div className="text-2xl font-bold text-white">{stat.value?.toLocaleString() ?? '—'}</div>
              <div className="text-label-caps text-on-surface-variant">{stat.label}</div>
            </motion.div>
          )) }
        </div>
      </section>

      {/* Revenue */}
      <section>
        <h2 className="text-label-caps text-on-surface-variant mb-3">REVENUE</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
          { [
            { label: 'Total Revenue', value: r?.total_revenue_formatted },
            { label: 'This Month', value: r ? `₹${(r.this_month_paise / 100).toLocaleString('en-IN')}` : '—' },
            { label: 'In Escrow', value: r ? `₹${(r.pending_escrow_paise / 100).toLocaleString('en-IN')}` : '—' },
            { label: 'Total Refunds', value: r ? `₹${(r.total_refunds_paise / 100).toLocaleString('en-IN')}` : '—' },
          ].map((stat) => (
            <div key={stat.label} className="glass-panel rounded-xl p-4">
              <span className="material-symbols-outlined text-tertiary mb-2">payments</span>
              <div className="text-xl font-bold text-white">{stat.value ?? '—'}</div>
              <div className="text-label-caps text-on-surface-variant">{stat.label}</div>
            </div>
          )) }
        </div>
      </section>
    </div>
  );
}
