'use client';
import { useQuery } from '@tanstack/react-query';
import { profileService } from '@speedygo/api-client';
import { apiClient } from '@speedygo/api-client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useState } from 'react';

type FilterType = 'today' | 'week' | 'month' | 'year' | 'all' | 'custom';

export default function EarningsPage() {
  const [filter, setFilter] = useState<FilterType>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const { data } = useQuery({ queryKey: ['dashboard'], queryFn: profileService.getDashboard });
  const earnings = data?.earnings;

  const { data: filtered } = useQuery({
    queryKey: ['earnings-filtered', filter, customFrom, customTo],
    queryFn: () => apiClient.get('/users/me/earnings', {
      params: { filter, ...(filter === 'custom' ? { from: customFrom, to: customTo } : {}) }
    }).then(r => r.data),
    enabled: filter !== 'custom' || (!!customFrom && !!customTo),
  });

  const chartData = filtered?.data?.map((d: any) => ({ label: d.month, amount: d.amount_paise / 100 })) ?? [];

  return (
    <div className="space-y-6 animate-blur-fade-up">
      <header>
        <h2 className="text-headline-lg font-bold text-white">Earnings</h2>
        <p className="text-on-surface-variant">Track your income</p>
      </header>

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-2">
        {(['today', 'week', 'month', 'year', 'all', 'custom'] as FilterType[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${filter === f ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-surface-container text-outline border border-transparent hover:border-outline-variant/30'}`}>
            {f === 'today' ? 'Today' : f === 'week' ? 'This Week' : f === 'month' ? 'This Month' : f === 'year' ? 'This Year' : f === 'all' ? 'All Time' : 'Custom'}
          </button>
        ))}
      </div>

      {filter === 'custom' && (
        <div className="flex gap-3 items-end">
          <div>
            <label className="text-xs text-on-surface-variant block mb-1">From</label>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="glass-input rounded-lg px-3 py-2 text-sm text-on-surface" />
          </div>
          <div>
            <label className="text-xs text-on-surface-variant block mb-1">To</label>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="glass-input rounded-lg px-3 py-2 text-sm text-on-surface" />
          </div>
        </div>
      )}

      {/* Filtered Summary */}
      {filtered && (
        <div className="grid grid-cols-3 gap-3">
          <div className="glass-panel rounded-xl p-4">
            <div className="text-label-caps text-on-surface-variant mb-1">Earned</div>
            <div className="text-xl font-bold text-white">₹{(filtered.total_paise / 100).toLocaleString('en-IN')}</div>
          </div>
          <div className="glass-panel rounded-xl p-4">
            <div className="text-label-caps text-on-surface-variant mb-1">Trips</div>
            <div className="text-xl font-bold text-white">{filtered.trip_count}</div>
          </div>
          <div className="glass-panel rounded-xl p-4">
            <div className="text-label-caps text-on-surface-variant mb-1">Avg/Trip</div>
            <div className="text-xl font-bold text-white">₹{(filtered.avg_paise / 100).toLocaleString('en-IN')}</div>
          </div>
        </div>
      )}

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="glass-panel rounded-xl p-6">
          <h3 className="font-semibold text-on-surface mb-4">Earnings Chart</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#8c909f' }} />
              <YAxis tick={{ fontSize: 11, fill: '#8c909f' }} tickFormatter={(v) => `₹${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} />
              <Tooltip formatter={(v: number) => `₹${v.toLocaleString('en-IN')}`} contentStyle={{ background: '#1d2022', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e0e3e5' }} />
              <Bar dataKey="amount" fill="#4cd7f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Overall Stats */}
      {earnings && (
        <div className="grid grid-cols-2 gap-3 stagger-children">
          {[
            { label: 'Total Earned', value: earnings.total_earned_formatted, color: 'text-white' },
            { label: 'This Month', value: `₹${(earnings.this_month_paise / 100).toLocaleString('en-IN')}`, color: 'text-white' },
            { label: 'Pending Payout', value: `₹${(earnings.pending_payout_paise / 100).toLocaleString('en-IN')}`, color: 'text-tertiary' },
            { label: 'Avg Per Trip', value: `₹${(earnings.avg_per_trip_paise / 100).toLocaleString('en-IN')}`, color: 'text-white' },
          ].map((s) => (
            <div key={s.label} className="glass-panel rounded-xl p-4">
              <div className="text-label-caps text-on-surface-variant mb-1">{s.label}</div>
              <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

