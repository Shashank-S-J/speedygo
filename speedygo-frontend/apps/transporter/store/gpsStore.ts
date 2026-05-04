import { create } from 'zustand';

interface GPSState {
  isPublishing: boolean;
  currentVehicleId: number | null;
  lastPublishedAt: Date | null;
  isWsConnected: boolean;
  setPublishing: (v: boolean, vehicleId?: number) => void;
  setLastPublished: () => void;
  setWsConnected: (c: boolean) => void;
}

export const useGPSStore = create<GPSState>()((set) => ({
  isPublishing: false,
  currentVehicleId: null,
  lastPublishedAt: null,
  isWsConnected: false,
  setPublishing: (v, vehicleId) => set({ isPublishing: v, currentVehicleId: vehicleId ?? null }),
  setLastPublished: () => set({ lastPublishedAt: new Date() }),
  setWsConnected: (c) => set({ isWsConnected: c }),
}));

