import { apiClient } from '../lib/axios';
import { KYCSubmission, KYCSubmitRequest } from '@speedygo/types';

export const kycService = {
  submit: (data: KYCSubmitRequest) =>
    apiClient.post<KYCSubmission>('/kyc/submit', data).then(r => r.data),

  getStatus: () =>
    apiClient.get<KYCSubmission>('/kyc/status').then(r => r.data),
};

