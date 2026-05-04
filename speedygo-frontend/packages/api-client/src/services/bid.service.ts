import { apiClient } from '../lib/axios';
import { Bid, PlaceBidRequest, Booking } from '@speedygo/types';

export const bidService = {
  place: (bookingId: number, data: PlaceBidRequest) =>
    apiClient.post<Bid>(`/bookings/${bookingId}/bids`, data).then(r => r.data),

  list: (bookingId: number) =>
    apiClient.get<Bid[]>(`/bookings/${bookingId}/bids`).then(r => r.data),

  accept: (bidId: number) =>
    apiClient.put<Booking>(`/bookings/bids/${bidId}/accept`).then(r => r.data),
};

