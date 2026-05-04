'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authService, getApiError } from '@speedygo/api-client';
import { useAuthStore } from '@/store/authStore';

type LoginMethod = 'password' | 'otp';

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [method, setMethod] = useState<LoginMethod>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);

  const handlePasswordLogin = async () => {
    if (!email || !password) { setError('Email and password are required'); return; }
    setLoading(true); setError('');
    try {
      const res = await authService.login({ email, password });
      if (res.user.role !== 'CUSTOMER') { setError('This portal is for customers only.'); return; }
      setAuth({ accessToken: res.access_token, refreshToken: res.refresh_token }, res.user);
      router.push('/dashboard');
    } catch (err) { setError(getApiError(err)); }
    finally { setLoading(false); }
  };

  const handleSendOtp = async () => {
    if (!email) { setError('Email is required'); return; }
    setOtpLoading(true); setError('');
    try {
      await authService.sendLoginOtp(email);
      setOtpSent(true);
    } catch (err) { setError(getApiError(err)); }
    finally { setOtpLoading(false); }
  };

  const handleOtpLogin = async () => {
    if (!email || !otp) { setError('Email and OTP are required'); return; }
    setLoading(true); setError('');
    try {
      const res = await authService.login({ email, login_method: 'otp', otp });
      if (res.user.role !== 'CUSTOMER') { setError('This portal is for customers only.'); return; }
      setAuth({ accessToken: res.access_token, refreshToken: res.refresh_token }, res.user);
      router.push('/dashboard');
    } catch (err) { setError(getApiError(err)); }
    finally { setLoading(false); }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (method === 'password') handlePasswordLogin();
    else handleOtpLogin();
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background selection:bg-tertiary selection:text-on-tertiary">
      {/* Background Glows */}
      <div className="fixed top-[-20%] left-[-10%] w-[60vw] h-[60vw] bg-primary/20 rounded-full mix-blend-screen filter blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] bg-tertiary-container/10 rounded-full mix-blend-screen filter blur-[100px] pointer-events-none" />

      {/* Auth Card */}
      <main className="relative w-full max-w-[440px] mx-4 md:mx-auto z-10 animate-blur-fade-up">
        <div className="bg-surface-container/60 backdrop-blur-[20px] rounded-xl border border-white/10 shadow-[0_24px_64px_rgba(0,0,0,0.5),_0_0_0_1px_rgba(255,255,255,0.05)_inset] p-8 relative overflow-hidden">
          <div className="absolute inset-0 border-t border-white/20 rounded-xl pointer-events-none mix-blend-overlay" />

          {/* Header */}
          <header className="text-center mb-8 relative z-20">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-surface-container-highest border border-white/10 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] mb-4">
              <span className="material-symbols-outlined fill text-tertiary text-2xl">local_shipping</span>
            </div>
            <h1 className="text-headline-lg italic text-primary tracking-tighter mb-1">SpeedyGo</h1>
            <p className="text-on-surface-variant">Secure Logistics Access</p>
          </header>

          {/* Method Toggle */}
          <div className="flex gap-1 bg-surface-container-lowest/50 rounded-lg p-1 mb-6 relative z-20">
            <button type="button" onClick={() => { setMethod('password'); setError(''); setOtpSent(false); }}
              className={`flex-1 text-sm font-medium py-2.5 rounded-md transition-all ${method === 'password' ? 'bg-primary/20 text-primary shadow-sm' : 'text-outline hover:text-on-surface'}`}>
              Password
            </button>
            <button type="button" onClick={() => { setMethod('otp'); setError(''); }}
              className={`flex-1 text-sm font-medium py-2.5 rounded-md transition-all ${method === 'otp' ? 'bg-primary/20 text-primary shadow-sm' : 'text-outline hover:text-on-surface'}`}>
              OTP Login
            </button>
          </div>

          <form onSubmit={onSubmit} className="space-y-5 relative z-20">
            {/* Email */}
            <div>
              <label className="block text-label-caps uppercase text-on-surface-variant mb-2 ml-1">Email / Phone</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline text-[20px]">mail</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com"
                  className="w-full bg-surface-container-lowest/40 border border-white/10 rounded-lg py-3 pl-12 pr-4 text-on-surface shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] focus:outline-none focus:ring-1 focus:ring-tertiary focus:border-tertiary transition-all placeholder:text-outline-variant/40" />
              </div>
            </div>

            {/* Password */}
            {method === 'password' && (
              <div>
                <label className="block text-label-caps uppercase text-on-surface-variant mb-2 ml-1">Password</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline text-[20px]">lock</span>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••"
                    className="w-full bg-surface-container-lowest/40 border border-white/10 rounded-lg py-3 pl-12 pr-4 text-on-surface shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] focus:outline-none focus:ring-1 focus:ring-tertiary focus:border-tertiary transition-all placeholder:text-outline-variant/40" />
                </div>
              </div>
            )}

            {/* OTP */}
            {method === 'otp' && (
              <>
                {!otpSent ? (
                  <button type="button" onClick={handleSendOtp} disabled={otpLoading || !email}
                    className="w-full btn-3d disabled:opacity-50 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2">
                    {otpLoading ? <><div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Sending...</>
                      : <><span className="material-symbols-outlined text-[18px]">send</span> Send OTP to Email</>}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="bg-tertiary/10 border border-tertiary/20 rounded-lg px-4 py-2.5 text-tertiary text-sm flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px]">check_circle</span> OTP sent to {email}
                    </div>
                    <div>
                      <label className="block text-label-caps uppercase text-on-surface-variant mb-2 ml-1">Enter OTP</label>
                      <input type="text" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit code" maxLength={6}
                        className="w-full bg-surface-container-lowest/40 border border-white/10 rounded-lg py-3 px-4 text-center text-xl tracking-[0.4em] font-bold text-on-surface shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] focus:outline-none focus:ring-1 focus:ring-tertiary focus:border-tertiary transition-all placeholder:text-sm placeholder:tracking-normal placeholder:font-normal" />
                    </div>
                    <button type="button" onClick={handleSendOtp} disabled={otpLoading} className="text-xs text-outline hover:text-tertiary transition-colors">Resend OTP</button>
                  </div>
                )}
              </>
            )}

            {error && (
              <div className="bg-error-container/20 border border-error/30 rounded-lg px-4 py-3 text-error text-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">error</span>{error}
              </div>
            )}

            {/* Submit */}
            {(method === 'password' || (method === 'otp' && otpSent)) && (
              <button type="submit" disabled={loading} className="w-full relative group block mt-2">
                <div className="absolute inset-0 bg-inverse-primary rounded-lg translate-y-[3px] transition-transform duration-150 group-active:translate-y-0" />
                <div className="relative w-full py-4 bg-gradient-to-b from-primary-container to-inverse-primary rounded-lg border-t border-white/30 text-white text-label-caps uppercase tracking-widest shadow-[0_8px_24px_rgba(0,0,0,0.6)] flex items-center justify-center gap-2 transition-all duration-150 group-hover:shadow-[0_12px_32px_rgba(77,142,255,0.4)] group-active:translate-y-[3px] group-active:shadow-none disabled:opacity-50">
                  {loading ? <><div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Authorizing...</>
                    : <>Authorize Access <span className="material-symbols-outlined text-[18px]">lock_open</span></>}
                </div>
              </button>
            )}
          </form>

          <div className="absolute top-4 right-4 flex gap-1 pointer-events-none">
            <div className="w-1.5 h-1.5 rounded-full bg-tertiary shadow-[0_0_8px_rgba(76,215,246,0.8)]" />
            <div className="w-1.5 h-1.5 rounded-full bg-outline-variant" />
          </div>
        </div>

        <div className="text-center mt-6 space-y-2">
          <p className="text-sm text-outline">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-tertiary hover:text-white transition-colors font-medium">Register</Link>
          </p>
          <Link href="/forgot-password" className="text-[13px] text-outline hover:text-tertiary transition-colors block">Forgot your password?</Link>
        </div>
      </main>
    </div>
  );
}
