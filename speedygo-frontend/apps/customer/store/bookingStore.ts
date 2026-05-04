import { create } from 'zustand';
import { Booking } from '@speedygo/types';

interface BookingState {
  activeBooking: Booking | null;
  setActiveBooking: (b: Booking) => void;
  clearActiveBooking: () => void;
  updateActiveStatus: (status: Booking['status']) => void;
}

export const useBookingStore = create<BookingState>()((set) => ({
  activeBooking: null,
  setActiveBooking: (b) => set({ activeBooking: b }),
  clearActiveBooking: () => set({ activeBooking: null }),
  updateActiveStatus: (status) =>
    set((s) => ({ activeBooking: s.activeBooking ? { ...s.activeBooking, status } : null })),
}));

