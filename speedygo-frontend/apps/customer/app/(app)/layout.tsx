"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/authStore";
import { motion, AnimatePresence } from "framer-motion";

const NAV = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/bookings", label: "Bookings", icon: "local_shipping" },
  { href: "/bookings/new", label: "Map", icon: "explore" },
  { href: "/profile", label: "Profile", icon: "person" },
];

const SIDE_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/bookings", label: "Shipments", icon: "local_shipping" },
  { href: "/bookings/new", label: "Live Map", icon: "map" },
  { href: "/payments", label: "Wallet", icon: "account_balance_wallet" },
  { href: "/profile", label: "Profile", icon: "person" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, logout } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isAuthenticated || (user?.role && user.role !== "CUSTOMER")) {
      router.replace("/login");
    }
  }, [isAuthenticated, router, user?.role]);

  if (!isAuthenticated || (user?.role && user.role !== "CUSTOMER")) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row overflow-x-hidden">
      {/* Ambient Background Glows */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-cyan-900/20 rounded-full blur-[100px]" />
      </div>

      {/* SideNavBar (Desktop) */}
      <nav className="hidden md:flex flex-col fixed left-0 top-0 h-full z-40 bg-slate-950/80 backdrop-blur-2xl w-64 border-r border-white/10 shadow-[20px_0_50px_rgba(30,27,75,0.4)]">
        <div className="p-6 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-tertiary flex items-center justify-center shadow-[0_0_15px_rgba(76,215,246,0.3)]">
            <span className="material-symbols-outlined text-background font-bold" style={{ fontVariationSettings: "'FILL' 1" }}>speed</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">SpeedyGo</h1>
            <p className="text-xs text-primary-fixed-dim">Logistics Engine</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-2 text-sm">
          {SIDE_NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  active
                    ? "bg-blue-600/20 text-blue-400 border-r-4 border-cyan-400 shadow-[inset_0_0_15px_rgba(34,211,238,0.2)]"
                    : "text-slate-500 hover:text-slate-300 hover:bg-white/5 hover:translate-x-1"
                }`}
              >
                <span className="material-symbols-outlined" style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}>{item.icon}</span>
                <span className="font-semibold">{item.label}</span>
              </Link>
            );
          })}
        </div>
        <div className="p-6 border-t border-white/10 space-y-4">
          <Link href="/bookings/new" className="w-full py-2.5 rounded-lg btn-3d text-white font-bold text-sm flex justify-center items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">add</span>
            New Shipment
          </Link>
          <div className="space-y-2">
            <Link href="/sos" className="flex items-center gap-3 px-4 py-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors">
              <span className="material-symbols-outlined text-[18px]">emergency</span>
              <span className="font-medium text-xs uppercase tracking-wider">Emergency SOS</span>
            </Link>
            <button onClick={logout} className="flex items-center gap-3 px-4 py-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors w-full">
              <span className="material-symbols-outlined text-[18px]">logout</span>
              <span className="font-medium">Logout</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Top Bar */}
      <header className="md:hidden sticky top-0 z-50 glass-panel border-b border-white/5 px-4 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold text-white tracking-tight italic">SpeedyGo</h1>
        <div className="flex items-center gap-3">
          <Link href="/sos" className="text-red-400 hover:text-red-300 p-1.5 rounded-full hover:bg-white/5 transition-all">
            <span className="material-symbols-outlined text-[20px]">emergency</span>
          </Link>
          <button className="w-10 h-10 rounded-full glass-panel flex items-center justify-center text-tertiary hover:text-white transition-colors relative">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>notifications</span>
            <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full shadow-[0_0_8px_rgba(255,180,171,0.8)]" />
          </button>
        </div>
      </header>

      <main className="flex-1 md:ml-64 relative z-10 pb-24 md:pb-8">
        <div className="max-w-[1440px] mx-auto p-4 md:p-8">
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
        </div>
      </main>

      {/* Bottom Nav (Mobile) */}
      <nav className="md:hidden fixed bottom-0 w-full z-50 flex justify-around items-center px-4 py-3 bg-slate-900/90 backdrop-blur-xl rounded-t-2xl border-t border-white/20 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] text-[10px] font-bold uppercase tracking-widest">
        {NAV.map(({ href, label, icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center p-2 transition-transform duration-200 active:scale-90 ${
                active
                  ? "bg-blue-600 rounded-xl shadow-[0_0_20px_rgba(59,130,246,0.5)] text-white"
                  : "text-slate-500 hover:text-blue-300"
              }`}
            >
              <span className="material-symbols-outlined mb-0.5" style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}>{icon}</span>
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
