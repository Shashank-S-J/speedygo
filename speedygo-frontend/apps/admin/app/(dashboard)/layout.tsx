'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { motion, AnimatePresence } from 'framer-motion';

const NAV = [
  { href: '/dashboard', label: 'Overview', icon: 'dashboard' },
  { href: '/users', label: 'Users', icon: 'group' },
  { href: '/kyc', label: 'KYC Queue', icon: 'verified_user' },
  { href: '/vehicles', label: 'Vehicles', icon: 'local_shipping' },
  { href: '/reports', label: 'Reports', icon: 'description' },
  { href: '/sos', label: 'SOS Alerts', icon: 'emergency' },
  { href: '/admin-management', label: 'Admin Mgmt', icon: 'admin_panel_settings', superOnly: true },
  { href: '/profile', label: 'Profile', icon: 'account_circle' },
  { href: '/ai', label: 'AI Query', icon: 'smart_toy' },
  { href: '/audit-logs', label: 'Audit Logs', icon: 'history' },
];

const MOBILE_NAV = [
  { href: '/dashboard', label: 'Overview', icon: 'dashboard' },
  { href: '/kyc', label: 'KYC', icon: 'verified_user' },
  { href: '/reports', label: 'Reports', icon: 'description' },
  { href: '/profile', label: 'Profile', icon: 'account_circle' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, logout, user } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileDrawer, setMobileDrawer] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || (user?.role && !['ADMIN', 'SUPER_ADMIN'].includes(user.role))) {
      router.replace('/login');
    }
  }, [isAuthenticated, router, user?.role]);

  if (!isAuthenticated || (user?.role && !['ADMIN', 'SUPER_ADMIN'].includes(user.role))) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Ambient Background */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-15%] left-[-5%] w-[35%] h-[35%] bg-indigo-900/15 rounded-full blur-[150px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[25%] h-[25%] bg-cyan-900/15 rounded-full blur-[120px]" />
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 bg-slate-950/80 backdrop-blur-2xl border-r border-white/10 flex-col fixed inset-y-0 left-0 z-40 shadow-[20px_0_50px_rgba(30,27,75,0.4)]">
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-tertiary flex items-center justify-center shadow-[0_0_15px_rgba(76,215,246,0.3)]">
              <span className="material-symbols-outlined text-background font-bold" style={{ fontVariationSettings: "'FILL' 1" }}>admin_panel_settings</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">SpeedyGo</h1>
              <p className="text-xs text-tertiary">Admin Panel</p>
            </div>
          </div>
          <div className="text-on-surface-variant text-xs">{user?.full_name}</div>
          <div className="text-outline text-xs">{user?.role}</div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.filter(n => !('superOnly' in n && n.superOnly) || user?.role === 'SUPER_ADMIN').map(({ href, label, icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link key={href} href={href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? 'bg-blue-600/20 text-blue-400 border-r-4 border-cyan-400 shadow-[inset_0_0_15px_rgba(34,211,238,0.2)]'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/5 hover:translate-x-1'
                }`}>
                <span className="material-symbols-outlined text-[20px]" style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}>{icon}</span>
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-white/10">
          <button onClick={logout}
            className="flex items-center gap-3 text-slate-500 hover:text-slate-300 text-sm w-full px-4 py-2 rounded-lg hover:bg-white/5 transition">
            <span className="material-symbols-outlined text-[18px]">logout</span> Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <header className="md:hidden sticky top-0 z-50 bg-slate-900/40 backdrop-blur-xl border-b border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] flex justify-between items-center px-6 h-16">
        <button onClick={() => setMobileDrawer(true)} className="text-slate-400 hover:bg-white/5 p-2 rounded-full transition active:scale-95">
          <span className="material-symbols-outlined">menu</span>
        </button>
        <h1 className="text-sm font-bold italic tracking-tighter text-blue-500 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]">SpeedyGo Admin</h1>
        <button onClick={logout} className="text-slate-400 hover:bg-white/5 p-2 rounded-full transition active:scale-95">
          <span className="material-symbols-outlined text-[20px]">logout</span>
        </button>
      </header>

      {/* Mobile Drawer */}
      {mobileDrawer && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={() => setMobileDrawer(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-surface-container backdrop-blur-2xl border-r border-white/10 p-6 flex flex-col animate-slide-in-left">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-tertiary flex items-center justify-center">
                <span className="material-symbols-outlined text-background font-bold" style={{ fontVariationSettings: "'FILL' 1" }}>admin_panel_settings</span>
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">SpeedyGo</h1>
                <p className="text-xs text-tertiary">Admin Panel</p>
              </div>
            </div>
            <nav className="flex-1 space-y-1">
              {NAV.filter(n => !('superOnly' in n && n.superOnly) || user?.role === 'SUPER_ADMIN').map(({ href, label, icon }) => {
                const active = pathname === href || pathname.startsWith(href + '/');
                return (
                  <Link key={href} href={href} onClick={() => setMobileDrawer(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                      active
                        ? 'bg-blue-600/20 text-blue-400'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                    }`}>
                    <span className="material-symbols-outlined text-[20px]" style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}>{icon}</span>
                    {label}
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-white/10 pt-4 text-xs text-outline">
              {user?.full_name} · {user?.role}
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 md:ml-64 p-4 md:p-8 min-h-screen relative z-10 pb-24 md:pb-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 12, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 w-full z-50 rounded-t-2xl bg-slate-950/90 backdrop-blur-2xl border-t border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] flex justify-around items-center h-20 px-4 pb-safe">
        {MOBILE_NAV.map(({ href, label, icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link key={href} href={href}
              className={`flex flex-col items-center justify-center p-2 transition-all duration-200 active:scale-90 ${
                active
                  ? 'text-blue-400 bg-blue-500/10 rounded-xl px-3 py-1 shadow-[0_0_15px_rgba(59,130,246,0.3)]'
                  : 'text-slate-500 hover:text-blue-300'
              }`}>
              <span className="material-symbols-outlined mb-0.5 text-[24px]" style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}>{icon}</span>
              <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
