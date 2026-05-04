import { apiClient } from '../lib/axios';
import { ChatMessage, PaginatedResponse } from '@speedygo/types';

export const chatService = {
  getHistory: (bookingId: number, params?: { limit?: number; offset?: number }) =>
    apiClient.get<ChatMessage[]>(`/chat/${bookingId}/history`, { params }).then(r => r.data),
};

