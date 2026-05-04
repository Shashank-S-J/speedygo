'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

function FadeIn({ children, delay = 0, duration = 1000, className = '' }: {
  children: React.ReactNode; delay?: number; duration?: number; className?: string;
}) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div className={`transition-all ${className}`}
      style={{ opacity: show ? 1 : 0, transform: show ? 'translateY(0)' : 'translateY(20px)', transitionDuration: `${duration}ms` }}>
      {children}
    </div>
  );
}

const FEATURES = [
  { icon: 'package_2', title: 'Easy Booking', desc: 'Book any vehicle in minutes with instant price estimates and real-time tracking.' },
  { icon: 'map', title: 'Live Tracking', desc: 'Watch your shipment move in real-time with GPS tracking and ETA updates.' },
  { icon: 'shield_lock', title: 'Secure Payments', desc: 'Pay securely with Stripe. Funds held in escrow until delivery is confirmed.' },
  { icon: 'gavel', title: 'Bidding System', desc: 'Enable bidding to get competitive rates from verified transport partners.' },
];

export default function LandingPage() {
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => {
    if (isAuthenticated) router.replace('/dashboard');
  }, [isAuthenticated, router]);

  if (isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-background text-on-surface overflow-x-hidden">
      {/* TopAppBar */}
      <header className="fixed top-0 w-full z-50 rounded-b-lg border-b border-white/10 bg-slate-900/40 backdrop-blur-xl backdrop-saturate-150 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]">
        <div className="flex justify-between items-center px-6 py-4 h-16 max-w-7xl mx-auto">
          <span className="material-symbols-outlined text-blue-500">speed</span>
          <h1 className="font-bold text-2xl italic tracking-tighter text-blue-500 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]">SpeedyGo</h1>
          <div className="hidden md:flex items-center gap-4">
            <Link href="/login" className="text-sm text-on-surface-variant hover:text-white transition-colors px-4 py-2">Sign In</Link>
            <Link href="/register" className="btn-3d text-white px-6 py-2 rounded-lg text-sm font-medium">Get Started</Link>
          </div>
          <button className="md:hidden material-symbols-outlined text-blue-500 hover:bg-white/5 transition-all active:scale-95" onClick={() => setMobileMenu(!mobileMenu)}>
            {mobileMenu ? 'close' : 'menu'}
          </button>
        </div>
        {/* Mobile menu */}
        {mobileMenu && (
          <div className="md:hidden px-6 pb-4 space-y-2 border-t border-white/5">
            <Link href="/login" className="block py-3 px-4 text-on-surface-variant hover:text-white text-sm rounded-lg hover:bg-white/5 transition" onClick={() => setMobileMenu(false)}>Sign In</Link>
            <Link href="/register" className="block py-3 px-4 text-center btn-3d text-white text-sm font-medium rounded-lg" onClick={() => setMobileMenu(false)}>Get Started</Link>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="relative w-full min-h-screen flex flex-col justify-end items-center pb-12 md:pb-24 overflow-hidden pt-16">
        {/* Background gradient */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent z-10" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-[150px]" />
          <div className="absolute bottom-[20%] right-0 w-[400px] h-[400px] bg-cyan-500/10 rounded-full blur-[120px]" />
        </div>
        <div className="relative z-20 text-center flex flex-col gap-4 px-4 w-full max-w-4xl mx-auto">
          <FadeIn delay={200}>
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 mb-6 text-xs sm:text-sm text-on-surface-variant">
              <span className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px]">package_2</span> Ship Anything</span>
              <span className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px]">verified_user</span> Verified Partners</span>
              <span className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px]">schedule</span> Real-time Tracking</span>
            </div>
          </FadeIn>
          <FadeIn delay={400}>
            <h2 className="text-4xl md:text-6xl lg:text-7xl font-extrabold text-primary tracking-tight drop-shadow-[0_0_20px_rgba(173,198,255,0.5)]" style={{ letterSpacing: '-0.04em' }}>
              Deliver Faster.
            </h2>
          </FadeIn>
          <FadeIn delay={600}>
            <p className="text-base md:text-lg text-on-surface-variant max-w-xl mx-auto">
              The next generation of logistics is here. Precision tracking. Instant bidding. Book reliable transport in minutes.
            </p>
          </FadeIn>
          <FadeIn delay={800}>
            <div className="flex flex-wrap justify-center gap-4 mt-4">
              <Link href="/register"
                className="btn-3d text-white rounded-xl font-bold px-8 py-4 text-label-caps uppercase tracking-widest shadow-[0_4px_14px_0_rgba(77,142,255,0.39)] transition-all duration-200 active:translate-y-1 active:shadow-none flex items-center gap-2">
                Get Started
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </Link>
              <Link href="/login"
                className="glass-panel text-on-surface rounded-xl font-medium px-8 py-4 hover:bg-white/10 transition-all">
                Sign In
              </Link>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Bento Grid Sections */}
      <section className="px-4 md:px-12 lg:px-16 pb-24 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {/* For Customers Card */}
          <FadeIn delay={200}>
            <div className="glass-panel rounded-3xl p-6 md:p-8 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center shadow-[0_0_15px_rgba(76,215,246,0.4)]">
                  <span className="material-symbols-outlined text-tertiary">package_2</span>
                </div>
                <h3 className="text-headline-md text-on-surface">For Customers</h3>
              </div>
              <p className="text-on-surface-variant mb-6">Track your shipments in real-time with aerospace-grade precision. Request quotes instantly.</p>
              <Link href="/register" className="flex items-center gap-2 text-primary text-label-caps cursor-pointer hover:text-tertiary transition-colors">
                <span>SHIP NOW</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </Link>
            </div>
          </FadeIn>

          {/* For Transporters Card */}
          <FadeIn delay={400}>
            <div className="glass-panel rounded-3xl p-6 md:p-8 relative overflow-hidden group">
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-tertiary/10 rounded-full blur-3xl -ml-10 -mb-10 pointer-events-none" />
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center border border-white/5">
                  <span className="material-symbols-outlined text-primary">local_shipping</span>
                </div>
                <h3 className="text-headline-md text-on-surface">For Transporters</h3>
              </div>
              <p className="text-on-surface-variant mb-6">Access a high-volume marketplace. Bid on loads, optimize routes, and get paid faster.</p>
              <a href="https://transporter.speedygo.in/register" className="flex items-center gap-2 text-tertiary text-label-caps cursor-pointer hover:text-tertiary-fixed transition-colors">
                <span>FIND LOADS</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </a>
            </div>
          </FadeIn>
        </div>

        {/* Features */}
        <FadeIn delay={200}>
          <h2 className="text-headline-lg text-on-surface mb-8 text-center">Why SpeedyGo</h2>
        </FadeIn>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
          {FEATURES.map(({ icon, title, desc }, i) => (
            <FadeIn key={title} delay={300 + i * 150}>
              <div className="glass-panel rounded-2xl p-6 h-full group hover:border-primary/30 transition-all">
                <div className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center mb-5 group-hover:bg-primary/10 transition border border-white/5">
                  <span className="material-symbols-outlined text-tertiary">{icon}</span>
                </div>
                <h3 className="text-body-lg font-semibold text-on-surface mb-2">{title}</h3>
                <p className="text-sm text-on-surface-variant leading-relaxed">{desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>

        {/* How it Works */}
        <FadeIn delay={200}>
          <h2 className="text-headline-lg text-on-surface mb-12 text-center">
            Ship in <span className="text-outline">3 easy steps.</span>
          </h2>
        </FadeIn>
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {[{
            step: '01', title: 'Book a Shipment', desc: 'Enter pickup & drop locations, goods details, and get an instant price estimate.' },
            { step: '02', title: 'Track Live', desc: 'Watch your shipment in real-time with GPS tracking, ETA updates, and chat with driver.' },
            { step: '03', title: 'Confirm Delivery', desc: 'Verify delivery with photos. Rate your transporter. Payment released automatically.' },
          ].map(({ step, title, desc }, i) => (
            <FadeIn key={step} delay={200 + i * 200}>
              <div className="relative">
                <span className="text-6xl font-bold text-white/5">{step}</span>
                <h3 className="text-xl font-medium text-on-surface mt-2 mb-3">{title}</h3>
                <p className="text-on-surface-variant text-sm leading-relaxed">{desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>

        {/* Stats Card */}
        <FadeIn delay={200}>
          <div className="glass-panel rounded-3xl p-6 md:p-8 flex flex-col gap-4">
            <h4 className="text-label-caps text-on-surface-variant uppercase tracking-widest">Live Network</h4>
            <div className="flex justify-between items-end">
              <div className="flex flex-col">
                <span className="text-4xl md:text-6xl font-extrabold text-on-surface tracking-tight">1.2M</span>
                <span className="text-on-surface-variant">Active Loads</span>
              </div>
              <div className="h-16 w-full max-w-[120px] flex items-center justify-end">
                <svg height="40" preserveAspectRatio="none" viewBox="0 0 100 40" width="100%">
                  <path d="M0,30 Q20,10 40,25 T80,15 T100,5" fill="none" stroke="#4cd7f6" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                  <circle cx="100" cy="5" fill="#4cd7f6" r="4" />
                </svg>
              </div>
            </div>
          </div>
        </FadeIn>

        {/* CTA */}
        <div className="text-center py-16">
          <FadeIn delay={200}>
            <h2 className="text-3xl md:text-5xl font-bold text-on-surface mb-6 tracking-tight">Ready to ship?</h2>
          </FadeIn>
          <FadeIn delay={400}>
            <p className="text-on-surface-variant text-base md:text-lg mb-10 max-w-xl mx-auto">
              Join thousands of businesses shipping smarter with SpeedyGo.
            </p>
          </FadeIn>
          <FadeIn delay={600}>
            <Link href="/register"
              className="inline-flex items-center gap-2 btn-3d text-white rounded-xl font-bold px-10 py-4 text-lg transition group">
              Get Started <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">chevron_right</span>
            </Link>
          </FadeIn>
        </div>
      </section>

      <footer className="border-t border-white/10 py-8 px-6 md:px-12 lg:px-16">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-sm text-outline">&copy; 2026 SpeedyGo. All rights reserved.</span>
          <div className="flex gap-6 text-sm text-outline">
            <a href="#" className="hover:text-on-surface transition">Privacy</a>
            <a href="#" className="hover:text-on-surface transition">Terms</a>
            <a href="#" className="hover:text-on-surface transition">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
