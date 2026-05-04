'use client';
import { useQuery } from '@tanstack/react-query';
import { adminService } from '@speedygo/api-client';
import { useState } from 'react';
import { AuditLog } from '@speedygo/types';

export default function AuditLogsPage() {
  const [offset, setOffset] = useState(0);
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', offset, action, targetType],
    queryFn: () => adminService.getAuditLogs({ limit: 50, offset, action: action || undefined, target_type: targetType || undefined }),
  });

  return (
    <div className="space-y-6 animate-blur-fade-up">
      <header>
        <h1 className="text-headline-lg font-bold text-white">Audit Logs</h1>
        <p className="text-on-surface-variant">Track all admin actions on the platform</p>
      </header>

      <div className="flex flex-col sm:flex-row gap-3">
        <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Filter by action…"
          className="glass-input rounded-lg px-3 py-2.5 text-sm text-on-surface placeholder:text-outline flex-1 sm:max-w-[12rem]" />
        <input value={targetType} onChange={(e) => setTargetType(e.target.value)} placeholder="Target type…"
          className="glass-input rounded-lg px-3 py-2.5 text-sm text-on-surface placeholder:text-outline flex-1 sm:max-w-[10rem]" />
      </div>

      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left px-4 py-3 font-label-caps text-on-surface-variant">Time</th>
              <th className="text-left px-4 py-3 font-label-caps text-on-surface-variant">Action</th>
              <th className="text-left px-4 py-3 font-label-caps text-on-surface-variant">Target</th>
              <th className="text-left px-4 py-3 font-label-caps text-on-surface-variant">Admin</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && [...Array(8)].map((_, i) => (
              <tr key={i}><td colSpan={4} className="px-4 py-3"><div className="h-4 bg-surface-container rounded animate-pulse" /></td></tr>
            ))}
            {(data?.data as AuditLog[])?.map((log) => (
              <tr key={log.id} className="border-b border-white/5 hover:bg-white/5 transition">
                <td className="px-4 py-3 text-xs text-outline whitespace-nowrap">
                  {new Date(log.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs font-medium bg-surface-container-high text-on-surface-variant px-2 py-0.5 rounded font-mono">
                    {log.action}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-on-surface-variant">
                  {log.target_type} #{log.target_id}
                </td>
                <td className="px-4 py-3 text-xs text-on-surface-variant">Admin #{log.admin_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        {data && data.total > 50 && (
          <div className="flex justify-between px-4 py-3 border-t border-white/10">
            <span className="text-xs text-outline">{offset + 1}–{Math.min(offset + 50, data.total)} of {data.total}</span>
            <div className="flex gap-2">
              <button onClick={() => setOffset(Math.max(0, offset - 50))} disabled={offset === 0} className="text-sm text-primary disabled:text-outline font-medium">← Prev</button>
              <button onClick={() => setOffset(offset + 50)} disabled={offset + 50 >= data.total} className="text-sm text-primary disabled:text-outline font-medium">Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
