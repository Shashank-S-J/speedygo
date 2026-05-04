'use client';

import { useQuery } from '@tanstack/react-query';
import { bookingService } from '@speedygo/api-client';
import { useState } from 'react';
import Link from 'next/link';
import { Booking, BookingStatus } from '@speedygo/types';

const STATUS_STYLES: Record<BookingStatus, string> = {
  PENDING: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  BIDDING: 'bg-secondary/10 text-secondary border-secondary/20',
  ACCEPTED: 'bg-primary/10 text-primary border-primary/20',
  PICKING_UP: 'bg-tertiary/10 text-tertiary border-tertiary/20',
  IN_TRANSIT: 'bg-primary-container/10 text-primary-container border-primary-container/20',
  COMPLETED: 'bg-tertiary/10 text-tertiary border-tertiary/20 shadow-[0_0_10px_rgba(76,215,246,0.2)]',
  CANCELLED: 'bg-outline/10 text-outline border-outline/20',
  DISPUTED: 'bg-error/10 text-error border-error/20',
};

const STATUS_GLOW: Record<string, string> = {
  COMPLETED: 'bg-tertiary',
  IN_TRANSIT: 'bg-primary',
  PICKING_UP: 'bg-tertiary',
  DISPUTED: 'bg-error',
  CANCELLED: 'bg-outline',
  PENDING: 'bg-yellow-400',
  BIDDING: 'bg-secondary',
  ACCEPTED: 'bg-primary',
};

export default function BookingsPage() {
  const [offset, setOffset] = useState(0);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const LIMIT = 20;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['bookings', offset],
    queryFn: () => bookingService.list({ limit: LIMIT, offset }),
  });

  const filteredData = data?.data?.filter((b: Booking) =>
    filterStatus === 'all' || b.status === filterStatus
  );

  return (
    <div className="space-y-8 animate-blur-fade-up">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-headline-lg font-bold text-white tracking-tight">Booking History</h1>
          <p className="text-on-surface-variant">Review your past shipments, active routes, and financial summaries.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 md:w-64">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline">search</span>
            <input className="w-full glass-input rounded-lg py-2.5 pl-10 pr-4 text-sm text-on-surface placeholder:text-outline" placeholder="Search PO or Route..." />
          </div>
          <Link href="/bookings/new" className="btn-3d text-white px-4 py-2.5 rounded-lg text-label-caps flex items-center gap-2 flex-shrink-0">
            <span className="material-symbols-outlined text-[18px]">add</span>
            New Shipment
          </Link>
        </div>
      </header>

      {/* Filter Chips */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {['all', 'PENDING', 'BIDDING', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED', 'DISPUTED'].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`text-label-caps px-4 py-2 rounded-full border whitespace-nowrap transition-all ${
              filterStatus === s
                ? 'bg-surface-variant text-on-surface border-outline/20'
                : 'bg-surface-container text-outline hover:text-on-surface border-transparent hover:border-outline/20'
            }`}
          >
            {s === 'all' ? 'All' : s.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {isError && (
        <div className="glass-panel rounded-xl p-4 text-error text-sm flex justify-between items-center border-l-2 border-l-error">
          <span>Failed to load bookings.</span>
          <button onClick={() => refetch()} className="text-tertiary font-medium underline text-xs">Retry</button>
        </div>
      )}

      {isLoading && (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 glass-panel rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {filteredData?.length === 0 && !isLoading && (
        <div className="text-center py-16 text-on-surface-variant">
          <span className="material-symbols-outlined text-6xl text-outline-variant/40 block mb-4">inbox</span>
          <p className="text-lg">No bookings found</p>
          <p className="text-sm mt-1 text-outline">Create your first booking above</p>
        </div>
      )}

      {/* Booking List */}
      <div className="space-y-4 stagger-children">
        {filteredData?.map((b: Booking) => (
          <Link
            key={b.id}
            href={`/bookings/${b.id}`}
            className="glass-card rounded-xl p-6 hover:bg-white/[0.02] transition-colors relative overflow-hidden group block"
          >
            {/* Status Glow Bar */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${STATUS_GLOW[b.status] ?? 'bg-outline'} shadow-[0_0_15px_currentColor]`} />

            <div className="flex flex-col md:flex-row gap-6 md:items-center justify-between ml-2">
              {/* Route Info */}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  <span className={`text-label-caps px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${STATUS_STYLES[b.status] ?? ''}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    {b.status.replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs text-outline font-medium tracking-wide">#{String(b.id).slice(0, 8)}</span>
                  <span className="text-xs text-outline font-medium">
                    {new Date(b.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex flex-col">
                    <span className="text-headline-md text-on-surface leading-none truncate max-w-[200px]">{b.pickup_address}</span>
                    <span className="text-sm text-on-surface-variant">Origin</span>
                  </div>
                  <div className="flex-1 flex items-center px-4">
                    <div className={`w-2 h-2 rounded-full ${STATUS_GLOW[b.status]} shadow-[0_0_8px_currentColor]`} />
                    <div className="flex-1 h-px bg-gradient-to-r from-current to-transparent opacity-50 border-b border-dashed border-white/20" />
                    <div className="w-2 h-2 rounded-full bg-white/20" />
                  </div>
                  <div className="flex flex-col text-right">
                    <span className="text-headline-md text-on-surface leading-none truncate max-w-[200px]">{b.drop_address}</span>
                    <span className="text-sm text-on-surface-variant">Destination</span>
                  </div>
                </div>
              </div>

              {/* Price */}
              <div className="flex md:flex-col items-center md:items-end justify-between md:justify-center gap-4 pl-0 md:pl-6 md:border-l border-white/5">
                <div className="text-left md:text-right">
                  <div className="text-[28px] font-bold text-on-surface">
                    {b.final_price
                      ? `₹${(b.final_price / 100).toLocaleString('en-IN')}`
                      : b.estimated_price
                      ? `~₹${(b.estimated_price / 100).toLocaleString('en-IN')}`
                      : '—'}
                  </div>
                  {b.distance_km && <div className="text-sm text-on-surface-variant">{b.distance_km.toFixed(1)} km</div>}
                </div>
                <span className="text-primary hover:text-tertiary transition-colors text-sm font-semibold flex items-center gap-1 group-hover:underline">
                  View Details <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Pagination */}
      {data && data.total > LIMIT && (
        <div className="flex justify-center items-center gap-2 mt-8">
          <button
            onClick={() => setOffset(Math.max(0, offset - LIMIT))}
            disabled={offset === 0}
            className="p-2 rounded-lg glass-card text-on-surface-variant hover:text-white disabled:opacity-50"
          >
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
          <span className="text-on-surface-variant text-sm px-4">
            {offset + 1}–{Math.min(offset + LIMIT, data.total)} of {data.total}
          </span>
          <button
            onClick={() => setOffset(offset + LIMIT)}
            disabled={offset + LIMIT >= data.total}
            className="p-2 rounded-lg glass-card text-on-surface-variant hover:text-white disabled:opacity-50"
          >
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
        </div>
      )}
    </div>
  );
}
