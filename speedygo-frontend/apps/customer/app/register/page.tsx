'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authService, getApiError } from '@speedygo/api-client';
import { useAuthStore } from '@/store/authStore';
import { LogisticsScene } from '@speedygo/three-scene';

const schema = z.object({
  full_name: z.string().min(2, 'Full name required'),
  email: z.string().email('Invalid email'),
  phone: z.string().min(10, 'Valid phone required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [otpRequired, setOtpRequired] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');

  const { register, handleSubmit, getValues, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setError('');
    try {
      const res = await authService.register({ ...data, role: 'CUSTOMER' });
      if (!res.otp_required && res.auth) {
        setAuth({ accessToken: res.auth.access_token, refreshToken: res.auth.refresh_token }, res.auth.user);
        router.push('/dashboard');
      } else {
        setPendingEmail(res.email);
        setOtpRequired(true);
        sessionStorage.setItem('pending_email', res.email);
      }
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    setOtpLoading(true);
    setOtpError('');
    try {
      const res = await authService.verifyOtp({ email: pendingEmail, otp });
      setAuth({ accessToken: res.access_token, refreshToken: res.refresh_token }, res.user);
      sessionStorage.removeItem('pending_email');
      router.push('/dashboard');
    } catch (err) {
      setOtpError(getApiError(err));
    } finally {
      setOtpLoading(false);
    }
  };

  const resendOtp = async () => {
    try {
      await authService.resendOtp(pendingEmail);
    } catch (err) {
      setOtpError(getApiError(err));
    }
  };

  if (otpRequired) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        <div className="absolute inset-0 z-0"><LogisticsScene type="booking" theme="customer" /></div>
        <div className="absolute inset-0 z-[1] bg-gradient-to-t from-black/70 via-black/40 to-black/50" />
        <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-surface-container/80 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-white/10">
          <h2 className="text-2xl font-bold text-center text-on-surface mb-2">Verify Email</h2>
          <p className="text-on-surface-variant text-sm text-center mb-6">
            We sent a 6-digit code to <strong className="text-white">{pendingEmail}</strong>
          </p>
          <input
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Enter OTP"
            maxLength={6}
            className="w-full text-center text-2xl tracking-widest glass-input rounded-lg px-4 py-3 text-on-surface placeholder:text-outline"
          />
          {otpError && <p className="text-error text-sm mt-2 text-center">{otpError}</p>}
          <button
            onClick={verifyOtp}
            disabled={otp.length < 6 || otpLoading}
            className="w-full mt-4 btn-3d disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg"
          >
            {otpLoading ? 'Verifying…' : 'Verify OTP'}
          </button>
          <button
            onClick={resendOtp}
            className="w-full mt-2 text-tertiary text-sm hover:underline"
          >
            Resend OTP
          </button>
        </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 z-0"><LogisticsScene type="login" theme="customer" /></div>
      <div className="absolute inset-0 z-[1] bg-gradient-to-t from-black/70 via-black/40 to-black/50" />
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-surface-container/80 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-white/10">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary italic tracking-tighter">SpeedyGo</h1>
          <p className="text-on-surface-variant mt-1">Create Customer Account</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {[
            { name: 'full_name' as const, label: 'Full Name', type: 'text', placeholder: 'John Doe', icon: 'person' },
            { name: 'email' as const, label: 'Email', type: 'email', placeholder: 'you@example.com', icon: 'mail' },
            { name: 'phone' as const, label: 'Phone', type: 'tel', placeholder: '+919876543210', icon: 'call' },
            { name: 'password' as const, label: 'Password', type: 'password', placeholder: '••••••••', icon: 'lock' },
          ].map((f) => (
            <div key={f.name}>
              <label className="block text-label-caps uppercase text-on-surface-variant mb-1">{f.label}</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">{f.icon}</span>
                <input
                  {...register(f.name)}
                  type={f.type}
                  placeholder={f.placeholder}
                  className="w-full glass-input rounded-lg pl-10 pr-4 py-2.5 text-sm text-on-surface placeholder:text-outline"
                />
              </div>
              {errors[f.name] && (
                <p className="text-error text-xs mt-1">{errors[f.name]?.message}</p>
              )}
            </div>
          ))}

          {error && (
            <div className="bg-error/10 border border-error/20 rounded-lg px-4 py-3 text-error text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">error</span>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-3d disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg"
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-sm text-outline mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-tertiary font-medium hover:underline">
            Sign In
          </Link>
        </p>
      </div>
      </div>
    </div>
  );
}

