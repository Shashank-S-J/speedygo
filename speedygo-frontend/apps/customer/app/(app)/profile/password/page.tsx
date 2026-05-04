'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { profileService, getApiError } from '@speedygo/api-client';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const submit = async () => {
    setError('');
    setSuccess('');
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const res = await profileService.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setSuccess(res.message ?? 'Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5 pb-6 max-w-lg mx-auto animate-blur-fade-up">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-outline hover:text-on-surface transition">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-headline-md font-bold text-on-surface">Change Password</h2>
      </div>

      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-on-surface font-medium">
          <span className="material-symbols-outlined text-primary">key</span>
          Update your account password
        </div>

        <input
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          type="password"
          placeholder="Current password"
          className="w-full glass-input rounded-lg px-4 py-3 text-sm text-on-surface placeholder:text-outline"
        />
        <input
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          type="password"
          placeholder="New password"
          className="w-full glass-input rounded-lg px-4 py-3 text-sm text-on-surface placeholder:text-outline"
        />
        <input
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          type="password"
          placeholder="Confirm new password"
          className="w-full glass-input rounded-lg px-4 py-3 text-sm text-on-surface placeholder:text-outline"
        />

        {error && <div className="bg-error/10 border border-error/20 rounded-lg px-4 py-3 text-error text-sm">{error}</div>}
        {success && <div className="bg-tertiary/10 border border-tertiary/20 rounded-lg px-4 py-3 text-tertiary text-sm">{success}</div>}

        <button
          onClick={submit}
          disabled={loading || !currentPassword || !newPassword || !confirmPassword}
          className="w-full btn-3d disabled:opacity-50 text-white font-semibold py-3 rounded-xl"
        >
          {loading ? 'Updating…' : 'Update Password'}
        </button>
      </div>
    </div>
  );
}

