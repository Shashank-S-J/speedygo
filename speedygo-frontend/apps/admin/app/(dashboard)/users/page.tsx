'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService, getApiError } from '@speedygo/api-client';
import { User, UserRole } from '@speedygo/types';

const ROLES: UserRole[] = ['CUSTOMER', 'TRANSPORTER', 'ADMIN'];

export default function UsersPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [offset, setOffset] = useState(0);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [actionError, setActionError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', q, role, offset],
    queryFn: () => adminService.searchUsers({ q: q || undefined, role: role || undefined, limit: 20, offset }),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, action, reason, duration, pw }: { id: number; action: string; reason?: string; duration?: string; pw?: string }) =>
      adminService.updateUserStatus(id, { action: action as 'enable' | 'disable', reason, duration: duration as any }, pw),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); setSelectedUser(null); },
    onError: (err) => setActionError(getApiError(err)),
  });

  const [actionModal, setActionModal] = useState<{ user: User; action: 'enable' | 'disable'; duration?: string } | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionPassword, setActionPassword] = useState('');

  const handleAction = (user: User, action: 'enable' | 'disable', duration?: string) => {
    setActionModal({ user, action, duration }); setActionReason(''); setActionPassword('');
  };

  const confirmAction = () => {
    if (!actionModal) return;
    const { user, action, duration } = actionModal;
    const needsPw = duration === 'permanent' || action === 'enable';
    statusMut.mutate({ id: user.id, action, reason: action === 'disable' ? actionReason : undefined, duration, pw: needsPw ? actionPassword : undefined });
    setActionModal(null);
  };

  return (
    <div className="space-y-6 animate-blur-fade-up">
      <header>
        <h1 className="text-headline-lg font-bold text-white">User Management</h1>
        <p className="text-on-surface-variant">Search, review, and manage platform users</p>
      </header>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">search</span>
          <input value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }}
            placeholder="Search users…"
            className="w-full glass-input rounded-lg pl-10 pr-4 py-2.5 text-sm text-on-surface placeholder:text-outline" />
        </div>
        <select value={role} onChange={(e) => { setRole(e.target.value); setOffset(0); }}
          className="glass-input rounded-lg px-3 py-2.5 text-sm text-on-surface">
          <option value="">All roles</option>
          {ROLES.map((r) => <option key={r}>{r}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left px-4 py-3 font-label-caps text-on-surface-variant">User</th>
              <th className="text-left px-4 py-3 font-label-caps text-on-surface-variant">Role</th>
              <th className="text-left px-4 py-3 font-label-caps text-on-surface-variant">Status</th>
              <th className="text-left px-4 py-3 font-label-caps text-on-surface-variant">Fraud</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && [...Array(5)].map((_, i) => (
              <tr key={i}><td colSpan={5} className="px-4 py-3"><div className="h-4 bg-surface-container rounded animate-pulse" /></td></tr>
            ))}
            {data?.data.map((user: User) => (
              <tr key={user.id} className="border-b border-white/5 hover:bg-white/5 transition">
                <td className="px-4 py-3">
                  <div className="font-medium text-on-surface">{user.full_name}</div>
                  <div className="text-xs text-outline">{user.email}</div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs font-medium text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded">{user.role}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    user.status === 'ACTIVE' ? 'bg-tertiary/10 text-tertiary border border-tertiary/20' :
                    user.status === 'BANNED' ? 'bg-error/10 text-error border border-error/20' :
                    user.status === 'SUSPENDED' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                    'bg-outline/10 text-outline border border-outline/20'
                  }`}>{user.status}</span>
                </td>
                <td className="px-4 py-3 text-xs text-outline">{user.fraud_score?.toFixed(2)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    {user.status === 'ACTIVE' || user.status === 'PENDING_KYC' ? (
                      <>
                        <button onClick={() => handleAction(user, 'disable', '7d')} className="text-xs text-amber-400 hover:text-amber-300 font-medium">7d</button>
                        <button onClick={() => handleAction(user, 'disable', '30d')} className="text-xs text-error hover:text-red-300 font-medium">30d</button>
                      </>
                    ) : (
                      <button onClick={() => handleAction(user, 'enable')} className="text-xs text-tertiary hover:text-tertiary-fixed font-medium flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">check_circle</span> Enable
                      </button>
                    )}
                    <button onClick={() => setSelectedUser(user)} className="text-outline hover:text-on-surface transition">
                      <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        {data && data.total > 20 && (
          <div className="flex justify-between items-center px-4 py-3 border-t border-white/10">
            <span className="text-xs text-outline">{offset + 1}–{Math.min(offset + 20, data.total)} of {data.total}</span>
            <div className="flex gap-2">
              <button onClick={() => setOffset(Math.max(0, offset - 20))} disabled={offset === 0}
                className="text-sm text-primary disabled:text-outline font-medium">← Prev</button>
              <button onClick={() => setOffset(offset + 20)} disabled={offset + 20 >= data.total}
                className="text-sm text-primary disabled:text-outline font-medium">Next →</button>
            </div>
          </div>
        )}
      </div>

      {/* User detail drawer */}
      {selectedUser && <UserDetailDrawer user={selectedUser} onClose={() => setSelectedUser(null)} />}

      {/* Action modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-lg font-bold text-on-surface">
              {actionModal.action === 'enable' ? 'Enable User' : `Suspend User (${actionModal.duration})`}
            </h3>
            <p className="text-sm text-on-surface-variant">{actionModal.user.full_name} — {actionModal.user.email}</p>
            {actionModal.action === 'disable' && (
              <textarea value={actionReason} onChange={(e) => setActionReason(e.target.value)}
                placeholder="Reason…" rows={2} className="w-full glass-input rounded-lg px-4 py-2.5 text-sm text-on-surface placeholder:text-outline" />
            )}
            {(actionModal.duration === 'permanent' || actionModal.action === 'enable') && (
              <input value={actionPassword} onChange={(e) => setActionPassword(e.target.value)}
                type="password" placeholder="Admin password" className="w-full glass-input rounded-lg px-4 py-2.5 text-sm text-on-surface placeholder:text-outline" />
            )}
            {actionError && <p className="text-error text-xs">{actionError}</p>}
            <div className="flex gap-3">
              <button onClick={() => setActionModal(null)} className="flex-1 border border-outline-variant text-on-surface py-2.5 rounded-lg text-sm bg-surface-container">Cancel</button>
              <button onClick={confirmAction} disabled={statusMut.isPending}
                className="flex-1 btn-3d text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50">
                {statusMut.isPending ? 'Processing…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UserDetailDrawer({ user, onClose }: { user: User; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: detail } = useQuery({
    queryKey: ['admin-user-detail', user.id],
    queryFn: () => adminService.getUserDetail(user.id),
  });

  const [newRole, setNewRole] = useState(user.role);
  const [roleError, setRoleError] = useState('');
  const [roleSuccess, setRoleSuccess] = useState('');
  const [rolePassword, setRolePassword] = useState('');

  const roleMut = useMutation({
    mutationFn: () => {
      if (!rolePassword) throw new Error('Password is required');
      return adminService.updateUserRole(user.id, newRole, rolePassword);
    },
    onSuccess: () => { setRoleSuccess('Role updated'); setRoleError(''); setRolePassword(''); qc.invalidateQueries({ queryKey: ['admin-users'] }); },
    onError: (err) => setRoleError(getApiError(err)),
  });

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm hidden md:block" onClick={onClose} />
      <div className="w-full md:w-[480px] bg-surface-container shadow-2xl h-full overflow-y-auto p-6 space-y-5 border-l border-white/10">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-lg font-bold text-on-surface">{user.full_name}</h2>
            <p className="text-sm text-on-surface-variant">{user.email} · {user.phone}</p>
          </div>
          <button onClick={onClose} className="text-outline hover:text-on-surface text-2xl leading-none">×</button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            { label: 'Role', value: user.role },
            { label: 'Status', value: user.status },
            { label: 'Fraud Score', value: user.fraud_score?.toFixed(3) },
            { label: 'Warnings', value: user.warning_count },
          ].map((item) => (
            <div key={item.label} className="glass-card rounded-lg p-3">
              <div className="text-xs text-outline">{item.label}</div>
              <div className="font-medium text-on-surface">{item.value}</div>
            </div>
          ))}
        </div>

        {user.role !== 'SUPER_ADMIN' && (
          <div className="glass-card rounded-lg p-4 space-y-3">
            <h3 className="font-medium text-on-surface text-sm">Change Role</h3>
            <select value={newRole} onChange={(e) => setNewRole(e.target.value as UserRole)}
              className="w-full glass-input rounded-lg px-3 py-2 text-sm text-on-surface">
              <option value="CUSTOMER">CUSTOMER</option>
              <option value="TRANSPORTER">TRANSPORTER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
            <input value={rolePassword} onChange={(e) => setRolePassword(e.target.value)}
              type="password" placeholder="Admin password" className="w-full glass-input rounded-lg px-3 py-2 text-sm text-on-surface placeholder:text-outline" />
            {roleError && <p className="text-error text-xs">{roleError}</p>}
            {roleSuccess && <p className="text-tertiary text-xs">{roleSuccess}</p>}
            <button onClick={() => roleMut.mutate()} disabled={newRole === user.role || roleMut.isPending}
              className="btn-3d text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">
              {roleMut.isPending ? 'Updating…' : 'Update Role'}
            </button>
          </div>
        )}

        {detail?.booking_stats && (
          <div className="glass-card rounded-lg p-4">
            <h3 className="font-medium text-on-surface mb-2 text-sm">Booking Stats</h3>
            <div className="grid grid-cols-2 gap-2 text-xs text-on-surface-variant">
              <span>Total: {detail.booking_stats.total}</span>
              <span>Completed: {detail.booking_stats.completed}</span>
              <span>Cancelled: {detail.booking_stats.cancelled}</span>
              <span>Disputed: {detail.booking_stats.disputed}</span>
            </div>
          </div>
        )}

        <div>
          <div className="text-xs text-outline mb-1">Member since</div>
          <div className="text-sm text-on-surface">{new Date(user.created_at).toLocaleDateString()}</div>
        </div>
      </div>
    </div>
  );
}

