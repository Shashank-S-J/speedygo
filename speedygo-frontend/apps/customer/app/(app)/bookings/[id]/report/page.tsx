'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { bookingService, reportService, getApiError } from '@speedygo/api-client';

const CATEGORIES = [
  'RECKLESS_DRIVING', 'DAMAGED_GOODS', 'LATE_ARRIVAL', 'HARASSMENT',
  'EXTRA_PAYMENT_DEMAND', 'NO_SHOW', 'FAKE_GPS', 'VEHICLE_MISMATCH',
  'INTOXICATED_DRIVER', 'OVERCHARGED',
] as const;

export default function ReportPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const { data: booking } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => bookingService.getById(id),
  });

  const reportMut = useMutation({
    mutationFn: () => reportService.create({
      reported_id: booking!.transporter_id!,
      booking_id: id,
      type: 'TRANSPORTER_REPORT',
      category,
      description,
    }),
    onSuccess: () => setSuccess(true),
    onError: (err) => setError(getApiError(err)),
  });

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4 animate-blur-fade-up">
        <div className="w-20 h-20 rounded-full bg-tertiary/10 border border-tertiary/20 flex items-center justify-center shadow-[0_0_30px_rgba(76,215,246,0.3)]">
          <span className="material-symbols-outlined text-[40px] text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
        </div>
        <h2 className="text-headline-md font-bold text-on-surface">Report Submitted</h2>
        <p className="text-on-surface-variant text-sm">Our team will review and take appropriate action.</p>
        <button onClick={() => router.push(`/bookings/${id}`)} className="text-primary font-medium flex items-center gap-2 hover:text-tertiary transition-colors">
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Back to Booking
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-6 max-w-lg mx-auto animate-blur-fade-up">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-outline hover:text-on-surface transition">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-headline-md font-bold text-on-surface">Report Transporter</h2>
      </div>

      <div className="bg-error/10 border border-error/20 rounded-xl p-4 flex items-center gap-3">
        <span className="material-symbols-outlined text-error flex-shrink-0">warning</span>
        <p className="text-sm text-error/80">
          Reports are reviewed by our safety team. False reports may result in account penalties.
        </p>
      </div>

      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <div>
          <label className="block text-label-caps text-on-surface-variant mb-2">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof category)}
            className="w-full glass-input rounded-lg px-4 py-3 text-sm text-on-surface"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-label-caps text-on-surface-variant mb-2">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what happened in detail…"
            rows={4}
            className="w-full glass-input rounded-lg px-4 py-3 text-sm text-on-surface placeholder:text-outline"
          />
        </div>

        {error && (
          <div className="bg-error/10 border border-error/20 rounded-lg px-4 py-3 text-error text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">error</span>
            {error}
          </div>
        )}

        <button
          onClick={() => reportMut.mutate()}
          disabled={!description.trim() || !booking?.transporter_id || reportMut.isPending}
          className="w-full bg-gradient-to-b from-red-500 to-red-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_2px_0_#7f1d1d] hover:translate-y-[1px] active:translate-y-[3px] active:shadow-none transition-all"
        >
          {reportMut.isPending ? 'Submitting…' : 'Submit Report'}
        </button>
      </div>
    </div>
  );
}
