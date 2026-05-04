'use client';

import { useState } from 'react';
import Link from 'next/link';
import { authService, getApiError } from '@speedygo/api-client';
import { LogisticsScene } from '@speedygo/three-scene';

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
      <div className="min-h-screen relative overflow-hidden">
        <div className="absolute inset-0 z-0"><LogisticsScene type="login" theme="transporter" /></div>
        <div className="absolute inset-0 z-[1] bg-gradient-to-t from-black/70 via-black/40 to-black/50" />
        <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
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
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 z-0"><LogisticsScene type="login" theme="transporter" /></div>
      <div className="absolute inset-0 z-[1] bg-gradient-to-t from-black/70 via-black/40 to-black/50" />
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-surface-container/80 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-white/10">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-primary italic tracking-tighter">SpeedyGo</h1>
            <p className="text-on-surface-variant mt-1">Reset Password</p>
          </div>

          {step === 'email' && (
            <div className="space-y-4">
              <p className="text-sm text-on-surface-variant text-center">Enter your email to receive a reset code</p>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">mail</span>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com"
                  className="w-full glass-input rounded-lg pl-10 pr-4 py-2.5 text-sm text-on-surface placeholder:text-outline" />
              </div>
              {error && <div className="bg-error/10 border border-error/20 rounded-lg px-4 py-3 text-error text-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">error</span>{error}
              </div>}
              <button onClick={requestReset} disabled={loading} className="w-full btn-3d disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg">
                {loading ? 'Sending…' : 'Send Reset Code'}
              </button>
            </div>
          )}

          {step === 'otp' && (
            <div className="space-y-4">
              <p className="text-sm text-on-surface-variant text-center">Code sent to <strong className="text-white">{email}</strong></p>
              <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit code" maxLength={6}
                className="w-full text-center text-2xl tracking-widest glass-input rounded-lg px-4 py-3 text-on-surface placeholder:text-outline" />
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">lock</span>
                <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" placeholder="New password (min 8 chars)"
                  className="w-full glass-input rounded-lg pl-10 pr-4 py-2.5 text-sm text-on-surface placeholder:text-outline" />
              </div>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">lock</span>
                <input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} type="password" placeholder="Confirm password"
                  className="w-full glass-input rounded-lg pl-10 pr-4 py-2.5 text-sm text-on-surface placeholder:text-outline" />
              </div>
              {error && <div className="bg-error/10 border border-error/20 rounded-lg px-4 py-3 text-error text-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">error</span>{error}
              </div>}
              <button onClick={resetPassword} disabled={loading} className="w-full btn-3d disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg">
                {loading ? 'Resetting…' : 'Reset Password'}
              </button>
              <button onClick={() => { setStep('email'); setError(''); }} className="w-full text-sm text-outline hover:text-tertiary transition-colors">← Back</button>
            </div>
          )}

          <p className="text-center text-sm text-outline mt-6">
            <Link href="/login" className="text-tertiary font-medium hover:underline">← Back to Sign In</Link>
          </p>
        </div>
      </div>
    </div>
  );
}


