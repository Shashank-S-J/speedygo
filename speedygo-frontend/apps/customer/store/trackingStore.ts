import { create } from 'zustand';
import { LocationUpdate } from '@speedygo/types';

interface TrackingState {
  vehicleLocation: LocationUpdate | null;
  lastUpdatedAt: Date | null;
  isConnected: boolean;
  setVehicleLocation: (loc: LocationUpdate) => void;
  setConnected: (c: boolean) => void;
}

export const useTrackingStore = create<TrackingState>()((set) => ({
  vehicleLocation: null,
  lastUpdatedAt: null,
  isConnected: false,
  setVehicleLocation: (loc) => set({ vehicleLocation: loc, lastUpdatedAt: new Date() }),
  setConnected: (c) => set({ isConnected: c }),
}));

