'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService, getApiError } from '@speedygo/api-client';
import { User } from '@speedygo/types';
import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function AdminManagementPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const qc = useQueryClient();

  // Redirect non-super-admins
  useEffect(() => {
    if (user?.role !== 'SUPER_ADMIN') router.replace('/dashboard');
  }, [user?.role, router]);

  const [showCreate, setShowCreate] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deletePassword, setDeletePassword] = useState('');

  const { data: admins, isLoading } = useQuery({
    queryKey: ['admin-list'],
    queryFn: adminService.getAdmins,
  });

  const createMut = useMutation({
    mutationFn: () => adminService.createAdmin(
      { email: newEmail, phone: newPhone, full_name: newName, password: newPassword },
      adminPassword
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-list'] });
      setShowCreate(false);
      setNewEmail(''); setNewPhone(''); setNewName(''); setNewPassword(''); setAdminPassword('');
      setError('');
    },
    onError: (err) => setError(getApiError(err)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => adminService.deleteAdmin(id, deletePassword),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-list'] });
      setDeleteTarget(null); setDeletePassword(''); setError('');
    },
    onError: (err) => setError(getApiError(err)),
  });

  if (user?.role !== 'SUPER_ADMIN') return null;

  const adminList = (admins as User[]) ?? [];

  return (
    <div className="space-y-6 animate-blur-fade-up">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-headline-lg font-bold text-white">Admin Management</h1>
          <p className="text-on-surface-variant">Add and remove admin accounts (Super Admin only)</p>
        </div>
        <button onClick={() => { setShowCreate(true); setError(''); }}
          className="btn-3d text-white text-label-caps px-6 py-3 rounded-lg flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">person_add</span>
          Add Admin
        </button>
      </header>

      {/* Info */}
      <div className="glass-panel rounded-xl p-4 border-l-2 border-l-primary/50 flex items-start gap-3">
        <span className="material-symbols-outlined text-primary text-[20px] mt-0.5">info</span>
        <div className="text-sm text-on-surface-variant">
          Only the <strong className="text-primary">Super Admin</strong> can create or delete admin accounts.
          The Super Admin account cannot be deleted by anyone, including itself.
          Admins do not register — accounts are created here.
        </div>
      </div>

      {isLoading && <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-surface-container rounded-xl animate-pulse" />)}</div>}

      {/* Admin List */}
      <div className="space-y-3 stagger-children">
        {adminList.map((admin) => (
          <motion.div key={admin.id} whileHover={{ scale: 1.003 }}
            className={`glass-card rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 ${
              admin.role === 'SUPER_ADMIN' ? 'border-l-2 border-l-tertiary/50' : ''
            }`}>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold flex-shrink-0 ${
              admin.role === 'SUPER_ADMIN'
                ? 'bg-gradient-to-br from-primary to-tertiary text-white shadow-[0_0_15px_rgba(76,215,246,0.3)]'
                : 'bg-primary/10 border border-primary/20 text-primary'
            }`}>
              {admin.profile_photo ? (
                <img src={admin.profile_photo} alt={admin.full_name} className="w-full h-full rounded-full object-cover" />
              ) : (
                admin.full_name?.[0]?.toUpperCase() ?? 'A'
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-on-surface">{admin.full_name}</span>
                {admin.role === 'SUPER_ADMIN' && (
                  <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-tertiary/10 text-tertiary border border-tertiary/20">SUPER ADMIN</span>
                )}
              </div>
              <div className="text-xs text-on-surface-variant">{admin.email} · {admin.phone}</div>
              <div className="flex items-center gap-3 mt-1 text-xs">
                <span className={`inline-flex items-center gap-1 ${admin.status === 'ACTIVE' ? 'text-tertiary' : 'text-error'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${admin.status === 'ACTIVE' ? 'bg-tertiary' : 'bg-error'}`} />
                  {admin.status}
                </span>
                <span className="text-outline">Joined {new Date(admin.created_at).toLocaleDateString()}</span>
              </div>
            </div>
            <div className="flex-shrink-0">
              {admin.role === 'SUPER_ADMIN' ? (
                <span className="text-xs text-outline italic">Protected</span>
              ) : (
                <button onClick={() => { setDeleteTarget(admin); setDeletePassword(''); setError(''); }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-error border border-error/30 hover:bg-error/10 transition-colors">
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                  Remove
                </button>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {adminList.length === 0 && !isLoading && (
        <div className="text-center py-16 text-outline glass-panel rounded-xl">
          <span className="material-symbols-outlined text-6xl text-primary/40 mb-4 block">admin_panel_settings</span>
          <p>No admin accounts found</p>
        </div>
      )}

      {/* Create Admin Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-on-surface">Create Admin Account</h2>
              <button onClick={() => setShowCreate(false)} className="text-outline hover:text-on-surface text-2xl leading-none">×</button>
            </div>
            <p className="text-sm text-on-surface-variant">This creates a new admin user. They can log in with Email + Password.</p>
            <div className="space-y-3">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full Name"
                className="w-full glass-input rounded-lg px-4 py-3 text-sm text-on-surface placeholder:text-outline" />
              <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} type="email" placeholder="Email"
                className="w-full glass-input rounded-lg px-4 py-3 text-sm text-on-surface placeholder:text-outline" />
              <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Phone (+91...)"
                className="w-full glass-input rounded-lg px-4 py-3 text-sm text-on-surface placeholder:text-outline" />
              <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" placeholder="Password for new admin"
                className="w-full glass-input rounded-lg px-4 py-3 text-sm text-on-surface placeholder:text-outline" />
              <div className="border-t border-white/10 pt-3">
                <label className="block text-label-caps text-on-surface-variant mb-2">YOUR PASSWORD (Re-authentication)</label>
                <input value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} type="password" placeholder="Your super admin password"
                  className="w-full glass-input rounded-lg px-4 py-3 text-sm text-on-surface placeholder:text-outline" />
              </div>
            </div>
            {error && <p className="text-error text-sm">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => setShowCreate(false)} className="flex-1 border border-outline-variant text-on-surface py-2.5 rounded-lg text-sm bg-surface-container">Cancel</button>
              <button onClick={() => createMut.mutate()}
                disabled={!newEmail || !newName || !newPassword || !adminPassword || createMut.isPending}
                className="flex-1 btn-3d text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50">
                {createMut.isPending ? 'Creating…' : 'Create Admin'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold text-on-surface">Remove Admin</h2>
            <p className="text-sm text-on-surface-variant">
              Are you sure you want to remove <strong className="text-on-surface">{deleteTarget.full_name}</strong> ({deleteTarget.email})?
              This will revoke their admin access.
            </p>
            <div className="border-t border-white/10 pt-3">
              <label className="block text-label-caps text-on-surface-variant mb-2">YOUR PASSWORD (Re-authentication)</label>
              <input value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} type="password" placeholder="Your super admin password"
                className="w-full glass-input rounded-lg px-4 py-3 text-sm text-on-surface placeholder:text-outline" />
            </div>
            {error && <p className="text-error text-sm">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 border border-outline-variant text-on-surface py-2.5 rounded-lg text-sm bg-surface-container">Cancel</button>
              <button onClick={() => deleteMut.mutate(deleteTarget.id)}
                disabled={!deletePassword || deleteMut.isPending}
                className="flex-1 bg-gradient-to-b from-red-500 to-red-700 text-white font-semibold py-2.5 rounded-lg text-sm shadow-[0_2px_0_#7f1d1d] disabled:opacity-50">
                {deleteMut.isPending ? 'Removing…' : 'Remove Admin'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

