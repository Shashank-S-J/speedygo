'use client';

import { useQuery } from '@tanstack/react-query';
import { bookingService } from '@speedygo/api-client';
import { Booking, BookingStatus } from '@speedygo/types';
import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

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

export default function TripHistoryPage() {
  const [offset, setOffset] = useState(0);
  const LIMIT = 20;
  const { data, isLoading } = useQuery({
    queryKey: ['my-trips', offset],
    queryFn: () => bookingService.list({ limit: LIMIT, offset }),
  });

  return (
    <div className="space-y-6 animate-blur-fade-up">
      <header>
        <h2 className="text-headline-lg font-bold text-white">Trip History</h2>
        <p className="text-on-surface-variant">All your past and current trips</p>
      </header>

      {isLoading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-surface-container rounded-xl animate-pulse" />)}
        </div>
      )}

      {data?.data.length === 0 && (
        <div className="text-center py-16 text-outline">
          <span className="material-symbols-outlined text-6xl text-outline-variant/40 mb-4 block">history</span>
          No trips yet.
        </div>
      )}

      <div className="space-y-3 stagger-children">
        {data?.data.map((b: Booking) => (
          <Link key={b.id} href={['ACCEPTED', 'PICKING_UP', 'IN_TRANSIT'].includes(b.status) ? `/active/${b.id}` : `/jobs/${b.id}`}>
            <motion.div whileHover={{ scale: 1.01 }}
              className="glass-card rounded-xl p-4 hover:border-primary/30 transition-all cursor-pointer">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0 mr-4">
                  <div className="text-sm font-medium text-on-surface truncate">{b.pickup_address}</div>
                  <div className="text-xs text-on-surface-variant mt-0.5">→ {b.drop_address}</div>
                  <div className="text-xs text-outline mt-1">
                    {b.distance_km ? `${b.distance_km.toFixed(1)} km · ` : ''}
                    ₹{((b.final_price ?? b.estimated_price ?? 0) / 100).toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-label-caps ${STATUS_COLORS[b.status]}`}>
                    {b.status.replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs text-outline">{new Date(b.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </motion.div>
          </Link>
        ))}
      </div>

      {data && data.total > LIMIT && (
        <div className="flex justify-center gap-4 pt-2">
          <button onClick={() => setOffset(Math.max(0, offset - LIMIT))} disabled={offset === 0}
            className="text-sm text-primary disabled:text-outline font-medium">← Previous</button>
          <span className="text-sm text-on-surface-variant">{offset + 1}–{Math.min(offset + LIMIT, data.total)} of {data.total}</span>
          <button onClick={() => setOffset(offset + LIMIT)} disabled={offset + LIMIT >= data.total}
            className="text-sm text-primary disabled:text-outline font-medium">Next →</button>
        </div>
      )}
    </div>
  );
}
