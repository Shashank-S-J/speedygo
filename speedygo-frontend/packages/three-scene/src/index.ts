/**
 * SpeedyGo 3D Scene Engine
 * Logistics-themed Three.js scenes with device-adaptive quality
 */

// ─── Device Detection ───
export type DeviceClass = 'mobile' | 'tablet' | 'desktop';

export function detectDevice(): DeviceClass {
  if (typeof window === 'undefined') return 'desktop';
  const w = window.innerWidth;
  if (w <= 480) return 'mobile';
  if (w <= 768) return 'tablet';
  return 'desktop';
}

export function getPixelRatio(device: DeviceClass): number {
  if (typeof window === 'undefined') return 1;
  const dpr = window.devicePixelRatio || 1;
  switch (device) {
    case 'mobile': return Math.min(dpr, 1.5);
    case 'tablet': return Math.min(dpr, 2);
    default: return Math.min(dpr, 2);
  }
}

export function getQualityScale(device: DeviceClass): number {
  switch (device) {
    case 'mobile': return 0.6;
    case 'tablet': return 0.8;
    default: return 1.0;
  }
}

// ─── Color Themes ───
export const THEMES = {
  customer: {
    accent: 0xf97316,    // orange-500
    accentHex: '#f97316',
    secondary: 0xfb923c, // orange-400
    bg: 0x0f0f17,
    fog: 0x0f0f17,
    ambient: 0xfff7ed,
    ground: 0x1a1520,
    particles: 0xf97316,
  },
  transporter: {
    accent: 0x2563eb,    // blue-600
    accentHex: '#2563eb',
    secondary: 0x3b82f6, // blue-500
    bg: 0x0a0e1a,
    fog: 0x0a0e1a,
    ambient: 0xeff6ff,
    ground: 0x101828,
    particles: 0x3b82f6,
  },
  admin: {
    accent: 0x475569,    // slate-600
    accentHex: '#475569',
    secondary: 0x64748b, // slate-500
    bg: 0x0f172a,
    fog: 0x0f172a,
    ambient: 0xf8fafc,
    ground: 0x1e293b,
    particles: 0x94a3b8,
  },
} as const;

export type ThemeName = keyof typeof THEMES;

// ─── Re-exports ───
export { LogisticsSceneEngine } from './engine';
export type { SceneConfig, SceneType } from './engine';
export { LogisticsScene } from './LogisticsScene';
export { SceneHero } from './SceneHero';
