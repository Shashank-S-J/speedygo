'use client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { profileService, bookingService } from '@speedygo/api-client';
import { useAuthStore } from '@/store/authStore';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useState } from 'react';

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [isAvailable, setIsAvailable] = useState((user as any)?.is_available ?? true);
  const { data, isError, refetch } = useQuery({ queryKey: ['dashboard'], queryFn: profileService.getDashboard });

  const availabilityMut = useMutation({
    mutationFn: (available: boolean) => bookingService.setAvailability(available),
    onSuccess: (data) => { setIsAvailable(data.available); },
  });
  const stats = data?.stats;
  const earnings = data?.earnings;

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
          <h2 className="text-headline-lg font-bold text-white">Hello, {user?.full_name?.split(' ')[0]} 🚛</h2>
          <p className="text-on-surface-variant">
            {user?.status !== 'ACTIVE' ? (
              <Link href="/kyc" className="text-tertiary font-medium flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">warning</span>
                Complete KYC to accept jobs —{' '}
                <span className="underline hover:text-white transition-colors">Verify now</span>
              </Link>
            ) : 'Ready to transport'}
          </p>
        </div>
        {/* Availability Toggle */}
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium ${isAvailable ? 'text-tertiary' : 'text-outline'}`}>
            {isAvailable ? 'Available' : 'Offline'}
          </span>
          <button
            onClick={() => { const next = !isAvailable; setIsAvailable(next); availabilityMut.mutate(next); }}
            className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${isAvailable ? 'bg-tertiary' : 'bg-outline-variant/40'}`}
          >
            <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-transform duration-300 ${isAvailable ? 'translate-x-7' : 'translate-x-0.5'}`} />
          </button>
        </div>
      </header>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 stagger-children">
        {/* Find Jobs CTA */}
        <section className="md:col-span-8 glass-panel rounded-2xl p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-40 h-40 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-headline-md text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-tertiary">explore</span>
                Nearby Jobs
              </h3>
              {stats && (
                <span className="bg-primary/20 text-primary px-3 py-1 rounded-full text-label-caps border border-primary/30">
                  {stats.active_trips ?? 0} ACTIVE
                </span>
              )}
            </div>
            <p className="text-on-surface-variant mb-6">Browse available shipments near you and start earning</p>
            <Link href="/jobs" className="btn-3d text-white px-8 py-3 rounded-xl text-sm font-bold flex items-center gap-2 w-fit">
              <span className="material-symbols-outlined text-[18px]">search</span>
              Find Jobs
            </Link>
          </div>
        </section>

        {/* Stats Cards */}
        <div className="md:col-span-4 space-y-6">
          {stats && (
            <div className="grid grid-cols-2 gap-3 stagger-children">
              {[
                { label: 'Total Trips', value: stats.total_trips, icon: 'check_circle', color: 'text-primary' },
                { label: 'Active', value: stats.active_trips, icon: 'schedule', color: 'text-tertiary' },
                { label: 'Avg Rating', value: stats.avg_rating_received?.toFixed(1) ?? '–', icon: 'star', color: 'text-yellow-400' },
                { label: 'Bids Won', value: stats.bids_won, icon: 'gavel', color: 'text-secondary' },
              ].map((s) => (
                <motion.div key={s.label} whileHover={{ scale: 1.02 }} className="glass-panel rounded-xl p-4 relative overflow-hidden group hover:border-primary-container/30 transition-colors">
                  <span className={`material-symbols-outlined ${s.color} mb-2`} style={{ fontVariationSettings: "'FILL' 1" }}>{s.icon}</span>
                  <div className="text-2xl font-bold text-white">{s.value ?? 0}</div>
                  <div className="text-label-caps text-on-surface-variant">{s.label}</div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Earnings */}
      {earnings && (
        <section className="glass-panel rounded-2xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-body-lg text-white font-semibold flex items-center gap-2">
              <span className="material-symbols-outlined text-tertiary">account_balance_wallet</span>
              Earnings Overview
            </h3>
            <Link href="/earnings" className="text-primary text-label-caps hover:text-tertiary transition-colors">View All →</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-label-caps text-on-surface-variant mb-1">THIS MONTH</p>
              <p className="text-2xl font-bold text-white">₹{(earnings.this_month_paise / 100).toLocaleString('en-IN')}</p>
            </div>
            <div>
              <p className="text-label-caps text-on-surface-variant mb-1">PENDING</p>
              <p className="text-2xl font-bold text-tertiary">₹{(earnings.pending_payout_paise / 100).toLocaleString('en-IN')}</p>
            </div>
            <div>
              <p className="text-label-caps text-on-surface-variant mb-1">TOTAL</p>
              <p className="text-2xl font-bold text-white">{earnings.total_earned_formatted}</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
