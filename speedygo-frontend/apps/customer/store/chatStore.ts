import { create } from 'zustand';
import { ChatMessage } from '@speedygo/types';

interface ChatState {
  messagesByBooking: Record<number, ChatMessage[]>;
  setHistory: (bookingId: number, msgs: ChatMessage[]) => void;
  appendMessage: (bookingId: number, msg: ChatMessage) => void;
  connected: Record<number, boolean>;
  setConnected: (bookingId: number, c: boolean) => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  messagesByBooking: {},
  connected: {},

  setHistory: (bookingId, msgs) =>
    set((s) => ({ messagesByBooking: { ...s.messagesByBooking, [bookingId]: msgs } })),

  appendMessage: (bookingId, msg) =>
    set((s) => {
      const prev = s.messagesByBooking[bookingId] ?? [];
      // deduplicate by client_uuid
      if (prev.some((m) => m.client_uuid === msg.client_uuid && m.client_uuid !== '')) {
        return s;
      }
      return { messagesByBooking: { ...s.messagesByBooking, [bookingId]: [...prev, msg] } };
    }),

  setConnected: (bookingId, c) =>
    set((s) => ({ connected: { ...s.connected, [bookingId]: c } })),
}));

