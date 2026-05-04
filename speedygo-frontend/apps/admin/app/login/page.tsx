'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
      if (!['ADMIN', 'SUPER_ADMIN'].includes(res.user.role)) {
        setError('Access denied. Admin account required.');
        return;
      }
      setAuth({ accessToken: res.access_token, refreshToken: res.refresh_token }, res.user);
      router.push('/dashboard');
    } catch (err) { setError(getApiError(err)); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 z-0"><LogisticsScene type="admin-overview" theme="admin" /></div>
      <div className="absolute inset-0 z-[1] bg-gradient-to-t from-black/70 via-black/40 to-black/50" />
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-white/20">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-slate-800 rounded-2xl mb-4 shadow-lg shadow-slate-800/30">
            <span className="text-white text-2xl font-bold">S</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-800">SpeedyGo</h1>
          <p className="text-slate-500 mt-1">Admin Portal</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Admin email"
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white/80" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password"
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white/80" />
          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>}
          <button type="submit" disabled={loading}
            className="w-full bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition shadow-lg shadow-slate-800/25">
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
      </div>
    </div>
  );
}
