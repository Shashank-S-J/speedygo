import { apiClient } from '../lib/axios';

export const paymentService = {
  initiate: (data: { booking_id: number; amount_paise: number; customer_id: number; transporter_id: number }) =>
    apiClient.post<{ client_secret: string; payment_intent_id: string }>('/payments/initiate', data).then(r => r.data),

  getEarnings: (params?: { filter?: string; from?: string; to?: string }) =>
    apiClient.get('/users/me/earnings', { params }).then(r => r.data),
};

