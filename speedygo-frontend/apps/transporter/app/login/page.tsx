'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authService, getApiError } from '@speedygo/api-client';
import { useAuthStore } from '@/store/authStore';
import { LogisticsScene } from '@speedygo/three-scene';

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await authService.login({ email, password });
      if (res.user.role !== 'TRANSPORTER') { setError('This portal is for transporters only.'); return; }
      setAuth({ accessToken: res.access_token, refreshToken: res.refresh_token }, res.user);
      router.push('/dashboard');
    } catch (err) { setError(getApiError(err)); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 z-0"><LogisticsScene type="login" theme="transporter" /></div>
      <div className="absolute inset-0 z-[1] bg-gradient-to-t from-black/70 via-black/40 to-black/50" />
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-surface-container/80 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-white/10">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary italic tracking-tighter">SpeedyGo</h1>
          <p className="text-on-surface-variant mt-1">Transporter Portal</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">mail</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email"
              className="w-full glass-input rounded-lg pl-10 pr-4 py-2.5 text-sm text-on-surface placeholder:text-outline" />
          </div>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">lock</span>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password"
              className="w-full glass-input rounded-lg pl-10 pr-4 py-2.5 text-sm text-on-surface placeholder:text-outline" />
          </div>
          {error && <div className="bg-error/10 border border-error/20 rounded-lg px-4 py-3 text-error text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">error</span>{error}
          </div>}
          <button type="submit" disabled={loading}
            className="w-full btn-3d disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg">
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
        <p className="text-center text-sm text-outline mt-6">
          New driver? <Link href="/register" className="text-tertiary font-medium hover:underline">Register</Link>
        </p>
        <Link href="/forgot-password" className="block text-center text-xs text-outline hover:text-tertiary transition-colors mt-2">
          Forgot your password?
        </Link>
      </div>
      </div>
    </div>
  );
}

