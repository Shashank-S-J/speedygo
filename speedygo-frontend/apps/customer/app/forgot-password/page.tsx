'use client';

import { useState } from 'react';
import Link from 'next/link';
import { authService, getApiError } from '@speedygo/api-client';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<'email' | 'otp' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const requestReset = async () => {
    setError('');
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }
    setLoading(true);
    try {
      await authService.forgotPassword(email.trim());
      setStep('otp');
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    setError('');
    if (otp.length < 6) { setError('Enter the 6-digit code'); return; }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      await authService.resetPassword({ email: email.trim(), otp, new_password: newPassword });
      setStep('done');
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  };

  if (step === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md bg-surface-container/80 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-white/10 text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-tertiary/10 border border-tertiary/20 flex items-center justify-center shadow-[0_0_30px_rgba(76,215,246,0.3)]">
            <span className="material-symbols-outlined text-[32px] text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          </div>
          <h2 className="text-xl font-bold text-on-surface">Password Reset</h2>
          <p className="text-on-surface-variant text-sm">Your password has been successfully updated.</p>
          <Link href="/login" className="btn-3d text-white font-semibold py-2.5 px-8 rounded-lg inline-block mt-4">
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 relative overflow-hidden">
      <div className="fixed top-[-20%] left-[-10%] w-[60vw] h-[60vw] bg-primary/20 rounded-full mix-blend-screen filter blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] bg-tertiary-container/10 rounded-full mix-blend-screen filter blur-[100px] pointer-events-none" />

      <div className="w-full max-w-md bg-surface-container/60 backdrop-blur-[20px] rounded-xl border border-white/10 shadow-[0_24px_64px_rgba(0,0,0,0.5)] p-8 relative z-10 animate-blur-fade-up">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-surface-container-highest border border-white/10 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] mb-4">
            <span className="material-symbols-outlined text-primary text-2xl">lock_reset</span>
          </div>
          <h1 className="text-headline-lg text-on-surface font-bold">Reset Password</h1>
          <p className="text-on-surface-variant text-sm mt-1">
            {step === 'email' ? 'Enter your email to receive a reset code' : 'Enter the code and your new password'}
          </p>
        </div>

        {step === 'email' && (
          <div className="space-y-4">
            <div>
              <label className="block text-label-caps uppercase text-on-surface-variant mb-2">Email</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline text-[20px]">mail</span>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="you@example.com"
                  className="w-full bg-surface-container-lowest/40 border border-white/10 rounded-lg py-3 pl-12 pr-4 text-on-surface shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] focus:outline-none focus:ring-1 focus:ring-tertiary focus:border-tertiary transition-all placeholder:text-outline-variant/40"
                />
              </div>
            </div>
            {error && (
              <div className="bg-error/10 border border-error/20 rounded-lg px-4 py-3 text-error text-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">error</span>{error}
              </div>
            )}
            <button onClick={requestReset} disabled={loading} className="w-full btn-3d disabled:opacity-50 text-white font-semibold py-3 rounded-lg">
              {loading ? 'Sending…' : 'Send Reset Code'}
            </button>
          </div>
        )}

        {step === 'otp' && (
          <div className="space-y-4">
            <p className="text-sm text-on-surface-variant text-center">
              Code sent to <strong className="text-white">{email}</strong>
            </p>
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit code"
              maxLength={6}
              className="w-full text-center text-2xl tracking-widest bg-surface-container-lowest/40 border border-white/10 rounded-lg px-4 py-3 text-on-surface shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] focus:outline-none focus:ring-1 focus:ring-tertiary placeholder:text-outline-variant/40"
            />
            <div>
              <label className="block text-label-caps uppercase text-on-surface-variant mb-2">New Password</label>
              <input
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                type="password"
                placeholder="Min 8 characters"
                className="w-full bg-surface-container-lowest/40 border border-white/10 rounded-lg py-3 px-4 text-on-surface shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] focus:outline-none focus:ring-1 focus:ring-tertiary transition-all placeholder:text-outline-variant/40"
              />
            </div>
            <div>
              <label className="block text-label-caps uppercase text-on-surface-variant mb-2">Confirm Password</label>
              <input
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                type="password"
                placeholder="Repeat password"
                className="w-full bg-surface-container-lowest/40 border border-white/10 rounded-lg py-3 px-4 text-on-surface shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] focus:outline-none focus:ring-1 focus:ring-tertiary transition-all placeholder:text-outline-variant/40"
              />
            </div>
            {error && (
              <div className="bg-error/10 border border-error/20 rounded-lg px-4 py-3 text-error text-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">error</span>{error}
              </div>
            )}
            <button onClick={resetPassword} disabled={loading} className="w-full btn-3d disabled:opacity-50 text-white font-semibold py-3 rounded-lg">
              {loading ? 'Resetting…' : 'Reset Password'}
            </button>
            <button onClick={() => { setStep('email'); setError(''); }} className="w-full text-sm text-outline hover:text-tertiary transition-colors">
              ← Back
            </button>
          </div>
        )}

        <div className="text-center mt-6">
          <Link href="/login" className="text-sm text-tertiary hover:text-white transition-colors font-medium">
            ← Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}


