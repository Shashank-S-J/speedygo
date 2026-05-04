'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authService, getApiError } from '@speedygo/api-client';
import { useAuthStore } from '@/store/authStore';
import { LogisticsScene } from '@speedygo/three-scene';

export default function RegisterPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '' });
  const [otpRequired, setOtpRequired] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!form.full_name.trim() || form.full_name.trim().length < 2) { setError('Full name is required (min 2 characters)'); return; }
    if (!form.email.trim() || !/\S+@\S+\.\S+/.test(form.email)) { setError('Valid email is required'); return; }
    if (!form.phone.trim() || form.phone.trim().length < 10) { setError('Valid phone number is required'); return; }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      const res = await authService.register({ ...form, role: 'TRANSPORTER' });
      if (!res.otp_required && res.auth) {
        setAuth({ accessToken: res.auth.access_token, refreshToken: res.auth.refresh_token }, res.auth.user);
        router.push('/dashboard');
      } else {
        setPendingEmail(res.email);
        setOtpRequired(true);
      }
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await authService.verifyOtp({ email: pendingEmail, otp });
      setAuth({ accessToken: res.access_token, refreshToken: res.refresh_token }, res.user);
      router.push('/dashboard');
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 z-0"><LogisticsScene type="login" theme="transporter" /></div>
      <div className="absolute inset-0 z-[1] bg-gradient-to-t from-black/70 via-black/40 to-black/50" />
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-surface-container/80 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-white/10">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary italic tracking-tighter">SpeedyGo</h1>
          <p className="text-on-surface-variant mt-1">Transporter Registration</p>
        </div>

        {!otpRequired ? (
          <div className="space-y-4">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">person</span>
              <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Full name"
                className="w-full glass-input rounded-lg pl-10 pr-4 py-2.5 text-sm text-on-surface placeholder:text-outline" />
            </div>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">mail</span>
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" placeholder="Email"
                className="w-full glass-input rounded-lg pl-10 pr-4 py-2.5 text-sm text-on-surface placeholder:text-outline" />
            </div>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">call</span>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone"
                className="w-full glass-input rounded-lg pl-10 pr-4 py-2.5 text-sm text-on-surface placeholder:text-outline" />
            </div>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">lock</span>
              <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} type="password" placeholder="Password (min 8 chars)"
                className="w-full glass-input rounded-lg pl-10 pr-4 py-2.5 text-sm text-on-surface placeholder:text-outline" />
            </div>
            {error && <div className="bg-error/10 border border-error/20 rounded-lg px-4 py-3 text-error text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">error</span>{error}
            </div>}
            <button onClick={submit} disabled={loading} className="w-full btn-3d disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg">
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
            <p className="text-center text-sm text-outline">Already have an account? <Link href="/login" className="text-tertiary font-medium hover:underline">Sign in</Link></p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-on-surface-variant text-center">Enter the OTP sent to <strong className="text-white">{pendingEmail}</strong></p>
            <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Enter OTP" maxLength={6}
              className="w-full text-center text-2xl tracking-widest glass-input rounded-lg px-4 py-3 text-on-surface placeholder:text-outline" />
            {error && <div className="bg-error/10 border border-error/20 rounded-lg px-4 py-3 text-error text-sm">{error}</div>}
            <button onClick={verifyOtp} disabled={loading || otp.length < 6} className="w-full btn-3d disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg">
              {loading ? 'Verifying…' : 'Verify OTP'}
            </button>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

